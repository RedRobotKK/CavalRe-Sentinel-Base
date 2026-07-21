import type { Amount } from "@cavalre/core";
import { pollOpenOrders } from "@cavalre/uniswapx-base";
import type { ParsedOrder } from "@cavalre/uniswapx-base";
import type {
  RunnerConfig,
  RunnerDeps,
  CycleResult,
  RunnerMode,
} from "./types.js";

/**
 * One dry-run (or future live) cycle:
 * 1. Poll open UniswapX orders on Base
 * 2. Journal parse rejections
 * 3. For each valid order, ask RiskEngine
 * 4. Journal accept / reject / halt
 *
 * In dry-run mode nothing is signed or broadcast.
 */
export async function runCycle(
  deps: RunnerDeps,
  config: RunnerConfig = {}
): Promise<CycleResult> {
  const mode: RunnerMode = config.mode ?? "dry-run";

  if (mode === "live") {
    // Explicit guard — live path is not implemented yet.
    throw new Error("live_mode_not_enabled");
  }

  const poll = await pollOpenOrders({
    fetchFn: config.fetchFn,
    limit: config.pollLimit ?? 20,
  });

  // Journal parse-level rejections
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
  let rejected = 0;

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
      rejected: poll.rejections.length,
      halted: true,
      acceptedOrders: [],
    };
  }

  for (const order of poll.orders) {
    // Use input size as the notional proxy for risk checks in v0.1.
    const size: Amount = order.inputStart;
    const decision = deps.risk.checkPositionSize(size);

    if (!decision.allowed) {
      rejected += 1;
      deps.journal.append({
        kind: "quote_rejected",
        reason: decision.reason ?? "risk_reject",
        ref: order.orderHash,
        amount: size,
        context: {
          stage: "risk",
          dryRun: true,
          inputToken: order.inputToken,
          outputToken: order.outputToken,
        },
      });
      continue;
    }

    // Dry-run accept: journal only, no execution.
    accepted += 1;
    acceptedOrders.push(order);
    deps.journal.append({
      kind: "quote_accepted",
      reason: "dry_run_accept",
      ref: order.orderHash,
      amount: size,
      context: {
        stage: "risk",
        dryRun: true,
        inputToken: order.inputToken,
        outputToken: order.outputToken,
        orderType: order.orderType,
      },
    });
  }

  return {
    mode,
    fetchedAt: poll.fetchedAt,
    rawCount: poll.rawCount,
    accepted,
    rejected: rejected + poll.rejections.length,
    halted: deps.risk.isHalted(),
    acceptedOrders,
  };
}
