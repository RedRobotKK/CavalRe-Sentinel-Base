/**
 * Dutch auction evaluation — pure composition of decay, edge, fill policy.
 *
 * UniswapX filler orientation:
 *   - Receives input (swapper sells tokenIn)
 *   - Delivers output (resolved along Dutch curve)
 *   - edgeBps = (refOut - resolvedOut) / refOut * 10_000
 *
 * Supports V3 block curve via resolveOrderAmounts when currentBlock + curve set.
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
  resolveOrderAmounts,
  type ResolvableOrder,
} from "./resolve.js";
import { DutchDecayError } from "./dutch-decay.js";
import { DutchBlockDecayError } from "./dutch-block-decay.js";

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

export function dutchAuctionPhaseBlocks(
  decayStartBlock: number,
  lastRelativeBlock: number,
  currentBlock: number
): DutchAuctionPhase {
  if (currentBlock < decayStartBlock) return "pre_decay";
  if (currentBlock >= decayStartBlock + lastRelativeBlock) return "finished";
  return "decaying";
}

export interface DutchAuctionInput {
  inputStart: Amount;
  inputEnd: Amount;
  outputStart: Amount;
  outputEnd: Amount;
  decayStartTime: number | null;
  decayEndTime: number | null;
  now: number;
  /** V3 */
  decayStartBlock?: number | null;
  relativeBlocks?: number[];
  relativeAmounts?: bigint[];
  currentBlock?: number;
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
  resolvePath: "v3_block" | "v2_time" | "static";
}

/**
 * Evaluate a Dutch auction order at clock.
 * Fail-closed: decay errors and zero ref → reject.
 */
export function evaluateDutchAuction(
  p: DutchAuctionInput
): DutchAuctionResult {
  const resolvable: ResolvableOrder = {
    inputStart: p.inputStart,
    inputEnd: p.inputEnd,
    outputStart: p.outputStart,
    outputEnd: p.outputEnd,
    decayStartTime: p.decayStartTime,
    decayEndTime: p.decayEndTime,
    decayStartBlock: p.decayStartBlock ?? null,
    relativeBlocks: p.relativeBlocks,
    relativeAmounts: p.relativeAmounts,
  };

  let resolvedInput: Amount;
  let resolvedOutput: Amount;
  let progress: number;
  let path: "v3_block" | "v2_time" | "static";
  let phase: DutchAuctionPhase;

  try {
    const r = resolveOrderAmounts(resolvable, {
      nowSec: p.now,
      currentBlock: p.currentBlock,
    });
    resolvedInput = r.input;
    resolvedOutput = r.output;
    progress = r.decayProgressBps;
    path = r.path;

    if (path === "v3_block" && p.decayStartBlock != null && p.currentBlock != null) {
      const last =
        p.relativeBlocks && p.relativeBlocks.length > 0
          ? p.relativeBlocks[p.relativeBlocks.length - 1]!
          : 0;
      phase = dutchAuctionPhaseBlocks(
        p.decayStartBlock,
        last,
        p.currentBlock
      );
    } else if (p.decayStartTime != null && p.decayEndTime != null) {
      phase = dutchAuctionPhase(p.decayStartTime, p.decayEndTime, p.now);
    } else {
      phase = "pre_decay";
    }
  } catch (e) {
    const reason =
      e instanceof DutchDecayError || e instanceof DutchBlockDecayError
        ? e.message
        : "decay_error";
    return {
      phase: "pre_decay",
      decayProgressBps: 0,
      resolved: { input: p.inputStart, output: p.outputStart },
      edge: { edgeBps: 0, undefined: true },
      toxicity: 1,
      decision: { action: "reject", reason },
      resolvePath: "static",
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
      resolvePath: path,
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
    resolvePath: path,
  };
}
