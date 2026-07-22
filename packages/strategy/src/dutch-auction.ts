/**
 * Dutch auction evaluation — pure composition of decay, edge, fill policy.
 *
 * UniswapX filler orientation:
 *   - Receives input (swapper sells tokenIn)
 *   - Delivers output (resolved along Dutch curve)
 *   - edgeBps = (refOut - resolvedOut) / refOut * 10_000
 */

import type { Amount } from "@cavalre/core";
import { computeEdgeBps, type EdgeResult } from "./edge.js";
import {
  decideFill,
  heuristicToxicity,
  type FillDecision,
  type FillPolicyConfig,
} from "./fill-policy.js";
import {
  decayProgressBps,
  decayInput,
  decayOutput,
  DutchDecayError,
} from "./dutch-decay.js";

export type DutchAuctionPhase = "pre_decay" | "decaying" | "finished";

export function dutchAuctionPhase(
  decayStartTime: number,
  decayEndTime: number,
  now: number
): DutchAuctionPhase {
  if (now < decayStartTime) return "pre_decay";
  if (now >= decayEndTime) return "finished";
  return "decaying";
}

export interface DutchAuctionInput {
  inputStart: Amount;
  inputEnd: Amount;
  outputStart: Amount;
  outputEnd: Amount;
  decayStartTime: number;
  decayEndTime: number;
  now: number;
  /** Reference cost to source output (Quoter / inventory). */
  refOutput: Amount;
  riskAllowed: boolean;
  riskReason?: string;
  /** Notional for min-size gate (defaults to inputStart). */
  notional?: Amount;
  recentPairToxicRate?: number;
  policy?: Partial<FillPolicyConfig>;
}

export interface DutchAuctionResult {
  phase: DutchAuctionPhase;
  decayProgressBps: number;
  resolved: { input: Amount; output: Amount };
  edge: EdgeResult;
  toxicity: number;
  decision: FillDecision;
}

/**
 * Evaluate a Dutch auction order at `now`.
 * Fail-closed: decay errors and zero ref → reject.
 */
export function evaluateDutchAuction(
  p: DutchAuctionInput
): DutchAuctionResult {
  const phase = dutchAuctionPhase(p.decayStartTime, p.decayEndTime, p.now);
  const progress = decayProgressBps(p.decayStartTime, p.decayEndTime, p.now);

  let resolvedInput: Amount;
  let resolvedOutput: Amount;
  try {
    resolvedInput = decayInput(
      p.inputStart,
      p.inputEnd,
      p.decayStartTime,
      p.decayEndTime,
      p.now
    );
    resolvedOutput = decayOutput(
      p.outputStart,
      p.outputEnd,
      p.decayStartTime,
      p.decayEndTime,
      p.now
    );
  } catch (e) {
    const reason =
      e instanceof DutchDecayError ? e.message : "decay_error";
    return {
      phase,
      decayProgressBps: progress,
      resolved: { input: p.inputStart, output: p.outputStart },
      edge: { edgeBps: 0, undefined: true },
      toxicity: 1,
      decision: { action: "reject", reason },
    };
  }

  const edge = computeEdgeBps({
    resolvedOutput,
    refOutput: p.refOutput,
  });

  if (edge.undefined) {
    return {
      phase,
      decayProgressBps: progress,
      resolved: { input: resolvedInput, output: resolvedOutput },
      edge,
      toxicity: 1,
      decision: { action: "reject", reason: "edge_undefined" },
    };
  }

  const toxicity = heuristicToxicity({
    decayProgressBps: progress,
    edgeBpsVsAmm: edge.edgeBps,
    recentPairToxicRate: p.recentPairToxicRate,
  });

  const decision = decideFill({
    notional: p.notional ?? p.inputStart,
    edgeBps: edge.edgeBps,
    toxicity,
    decayProgressBps: progress,
    riskAllowed: p.riskAllowed,
    riskReason: p.riskReason,
    policy: p.policy,
  });

  return {
    phase,
    decayProgressBps: progress,
    resolved: { input: resolvedInput, output: resolvedOutput },
    edge,
    toxicity,
    decision,
  };
}
