import { amountToString } from "@cavalre/core";
import { pollOpenOrders, BASE_DEFAULT_ORDER_TYPE } from "@cavalre/uniswapx-base";
import type { ParsedOrder } from "@cavalre/uniswapx-base";
import {
  classifyOrder,
  isTradableClass,
  evaluateDutchAuction,
} from "@cavalre/strategy";
import type {
  RunnerConfig,
  RunnerDeps,
  CycleResult,
  RunnerMode,
} from "./types.js";

export async function runCycle(
  deps: RunnerDeps,
  config: RunnerConfig = {}
): Promise<CycleResult> {
  const mode: RunnerMode = config.mode ?? "dry-run";

  if (mode === "live") {
    throw new Error("live_mode_not_enabled");
  }

  const nowSec = config.nowSec ?? Math.floor(Date.now() / 1000);

  const poll = await pollOpenOrders({
    fetchFn: config.fetchFn,
    limit: config.pollLimit ?? 20,
    orderType: config.orderType ?? BASE_DEFAULT_ORDER_TYPE,
  });

  for (const r of poll.rejections) {
    deps.journal.append({
      kind: "quote_rejected",
      reason: r.reason,
      ref: r.orderHash,
      context: { stage: "parse", dryRun: true },
    });
  }

  const acceptedOrders: ParsedOrder[] = [];
  let accepted = 0;
  let rejected = poll.rejections.length;
  let waited = 0;

  if (deps.risk.isHalted()) {
    deps.journal.append({
      kind: "halt",
      reason: "engine_already_halted",
      context: { dryRun: true },
    });
    return {
      mode,
      fetchedAt: poll.fetchedAt,
      rawCount: poll.rawCount,
      accepted: 0,
      rejected,
      waited: 0,
      halted: true,
      acceptedOrders: [],
      requestUrl: poll.requestUrl,
    };
  }

  for (const order of poll.orders) {
    const orderClass = classifyOrder(order, nowSec);

    if (!isTradableClass(orderClass)) {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: `class_not_tradable:${orderClass}`,
        ref: order.orderHash,
        context: featureContext({
          stage: "classify",
          order,
          orderClass,
          policyAction: "reject",
          nowSec,
        }),
      });
      continue;
    }

    if (order.decayStartTime === null || order.decayEndTime === null) {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: "missing_decay_window",
        ref: order.orderHash,
        context: featureContext({
          stage: "resolve",
          order,
          orderClass,
          policyAction: "reject",
          nowSec,
        }),
      });
      continue;
    }

    let refOutput = 0n;
    let quoteErr: string | null = null;
    const quoteInput = order.inputStart;

    if (config.referenceCostFn) {
      try {
        refOutput = await config.referenceCostFn(order, quoteInput);
        if (refOutput === 0n) {
          quoteErr =
            (config.referenceCostFn as { lastError?: string }).lastError ??
            "ref_output_zero";
        }
      } catch (e) {
        quoteErr = e instanceof Error ? e.message.slice(0, 80) : "quote_throw";
        refOutput = 0n;
      }
    } else {
      quoteErr = "no_referenceCostFn";
    }

    if (refOutput === 0n) {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: quoteErr
          ? `edge_undefined:${quoteErr}`.slice(0, 120)
          : "edge_undefined_no_reference_cost",
        ref: order.orderHash,
        amount: quoteInput,
        context: featureContext({
          stage: "edge",
          order,
          orderClass,
          policyAction: "reject",
          nowSec,
          refOutput: 0n,
        }),
      });
      continue;
    }

    const riskDecision = deps.risk.checkPositionSize(quoteInput);

    const auction = evaluateDutchAuction({
      inputStart: order.inputStart,
      inputEnd: order.inputEnd,
      outputStart: order.outputStart,
      outputEnd: order.outputEnd,
      decayStartTime: order.decayStartTime,
      decayEndTime: order.decayEndTime,
      now: nowSec,
      refOutput,
      riskAllowed: riskDecision.allowed,
      riskReason: riskDecision.reason,
      notional: quoteInput,
    });

    const ctx = featureContext({
      stage: "policy",
      order,
      orderClass,
      policyAction: auction.decision.action,
      nowSec,
      resolvedInput: auction.resolved.input,
      resolvedOutput: auction.resolved.output,
      refOutput,
      edgeBps: auction.edge.edgeBps,
      toxicity: auction.toxicity,
      decayProgressBps: auction.decayProgressBps,
      auctionPhase: auction.phase,
    });

    if (auction.decision.action === "accept") {
      accepted += 1;
      acceptedOrders.push(order);

      let booksNote: string | null = null;
      if (deps.virtualBooks) {
        try {
          deps.virtualBooks.postAccept({
            inputRoot: order.inputToken,
            outputRoot: order.outputToken,
            inputAmount: auction.resolved.input,
            outputAmount: auction.resolved.output,
            ref: order.orderHash,
          });
          booksNote = "posted";
        } catch (e) {
          booksNote =
            e instanceof Error ? e.message.slice(0, 64) : "books_post_failed";
          // Research path: still journal accept; books failure is informational
        }
      }

      deps.journal.append({
        kind: "quote_accepted",
        reason: auction.decision.reason,
        ref: order.orderHash,
        amount: auction.resolved.input,
        amount2: auction.resolved.output,
        context: {
          ...ctx,
          virtualBooks: booksNote,
        },
      });
    } else if (auction.decision.action === "wait") {
      waited += 1;
      deps.journal.append({
        kind: "info",
        reason: auction.decision.reason,
        ref: order.orderHash,
        amount: auction.resolved.input,
        amount2: auction.resolved.output,
        context: ctx,
      });
    } else {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: auction.decision.reason,
        ref: order.orderHash,
        amount: auction.resolved.input,
        amount2: auction.resolved.output,
        context: ctx,
      });
    }
  }

  return {
    mode,
    fetchedAt: poll.fetchedAt,
    rawCount: poll.rawCount,
    accepted,
    rejected,
    waited,
    halted: deps.risk.isHalted(),
    acceptedOrders,
    requestUrl: poll.requestUrl,
    booksSnapshot: deps.virtualBooks?.snapshot(),
  };
}

function featureContext(p: {
  stage: string;
  order: ParsedOrder;
  orderClass: string;
  policyAction: string;
  nowSec?: number;
  resolvedInput?: bigint;
  resolvedOutput?: bigint;
  refOutput?: bigint;
  edgeBps?: number;
  toxicity?: number;
  decayProgressBps?: number;
  auctionPhase?: string;
}): Record<string, string | boolean | null> {
  return {
    dryRun: true,
    stage: p.stage,
    orderClass: p.orderClass,
    orderType: p.order.orderType,
    inputToken: p.order.inputToken,
    outputToken: p.order.outputToken,
    policyAction: p.policyAction,
    exclusiveFiller: p.order.exclusiveFiller,
    decayStartTime:
      p.order.decayStartTime !== null ? String(p.order.decayStartTime) : null,
    decayEndTime:
      p.order.decayEndTime !== null ? String(p.order.decayEndTime) : null,
    nowSec: p.nowSec !== undefined ? String(p.nowSec) : null,
    auctionPhase: p.auctionPhase ?? null,
    decayProgressBps:
      p.decayProgressBps !== undefined ? String(p.decayProgressBps) : null,
    edgeBps: p.edgeBps !== undefined ? String(p.edgeBps) : null,
    toxicity: p.toxicity !== undefined ? String(p.toxicity) : null,
    resolvedInput:
      p.resolvedInput !== undefined ? amountToString(p.resolvedInput) : null,
    resolvedOutput:
      p.resolvedOutput !== undefined ? amountToString(p.resolvedOutput) : null,
    refOutput: p.refOutput !== undefined ? amountToString(p.refOutput) : null,
  };
}
