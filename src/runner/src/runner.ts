import { amountToString } from "@cavalre/core";
import { pollOpenOrders, BASE_DEFAULT_ORDER_TYPE } from "@cavalre/uniswapx-base";
import type { ParsedOrder } from "@cavalre/uniswapx-base";
import {
  classifyOrder,
  isTradableClass,
  resolveOrderAmounts,
  computeEdgeBps,
  heuristicToxicity,
  decideFill,
  DutchDecayError,
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
    const orderClass = classifyOrder(order);

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
        }),
      });
      continue;
    }

    let resolved;
    try {
      resolved = resolveOrderAmounts(order, nowSec);
    } catch (e) {
      rejected += 1;
      const reason =
        e instanceof DutchDecayError ? e.message : "resolve_failed";
      deps.journal.append({
        kind: "quote_rejected",
        reason,
        ref: order.orderHash,
        context: featureContext({
          stage: "resolve",
          order,
          orderClass,
          policyAction: "reject",
        }),
      });
      continue;
    }

    let refOutput = 0n;
    let edgeUndefined = true;
    let edgeBps = 0;
    let quoteErr: string | null = null;

    if (config.referenceCostFn) {
      try {
        refOutput = await config.referenceCostFn(order, resolved.input);
        const edge = computeEdgeBps({
          resolvedOutput: resolved.output,
          refOutput,
        });
        edgeBps = edge.edgeBps;
        edgeUndefined = edge.undefined;
        if (edgeUndefined) {
          quoteErr =
            (config.referenceCostFn as { lastError?: string }).lastError ??
            "ref_output_zero";
        }
      } catch (e) {
        quoteErr = e instanceof Error ? e.message.slice(0, 80) : "quote_throw";
        edgeUndefined = true;
      }
    } else {
      quoteErr = "no_referenceCostFn";
    }

    if (edgeUndefined) {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: quoteErr
          ? `edge_undefined:${quoteErr}`.slice(0, 120)
          : "edge_undefined_no_reference_cost",
        ref: order.orderHash,
        amount: resolved.input,
        context: featureContext({
          stage: "edge",
          order,
          orderClass,
          resolvedInput: resolved.input,
          resolvedOutput: resolved.output,
          refOutput,
          edgeBps,
          decayProgressBps: resolved.decayProgressBps,
          policyAction: "reject",
        }),
      });
      continue;
    }

    const toxicity = heuristicToxicity({
      decayProgressBps: resolved.decayProgressBps,
      edgeBpsVsAmm: edgeBps,
    });

    const riskDecision = deps.risk.checkPositionSize(resolved.input);

    const fillDecision = decideFill({
      notional: resolved.input,
      edgeBps,
      toxicity,
      decayProgressBps: resolved.decayProgressBps,
      riskAllowed: riskDecision.allowed,
      riskReason: riskDecision.reason,
    });

    const ctx = featureContext({
      stage: "policy",
      order,
      orderClass,
      resolvedInput: resolved.input,
      resolvedOutput: resolved.output,
      refOutput,
      edgeBps,
      toxicity,
      decayProgressBps: resolved.decayProgressBps,
      policyAction: fillDecision.action,
    });

    if (fillDecision.action === "accept") {
      accepted += 1;
      acceptedOrders.push(order);
      deps.journal.append({
        kind: "quote_accepted",
        reason: fillDecision.reason,
        ref: order.orderHash,
        amount: resolved.input,
        amount2: resolved.output,
        context: ctx,
      });
    } else if (fillDecision.action === "wait") {
      waited += 1;
      deps.journal.append({
        kind: "info",
        reason: fillDecision.reason,
        ref: order.orderHash,
        amount: resolved.input,
        amount2: resolved.output,
        context: ctx,
      });
    } else {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: fillDecision.reason,
        ref: order.orderHash,
        amount: resolved.input,
        amount2: resolved.output,
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
  };
}

function featureContext(p: {
  stage: string;
  order: ParsedOrder;
  orderClass: string;
  policyAction: string;
  resolvedInput?: bigint;
  resolvedOutput?: bigint;
  refOutput?: bigint;
  edgeBps?: number;
  toxicity?: number;
  decayProgressBps?: number;
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
