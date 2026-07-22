/**
 * TRUST — float math root of truth:
 *   https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol
 *   (CavalRe Float type: 21 significant digits, dynamic exponent, int256 packed)
 *
 * This file is an **IEEE-754 Number** side-channel for A/B vs bigint Amount.
 * It is NOT a port of FloatLib and must not be used for production fills.
 *
 * Production money path: @cavalre/core Amount (bigint).
 * Future: TS FloatLib-compatible helpers should match on-chain FloatLib
 * semantics (normalize / align / times / divide / fullMulDiv), not Number.
 */

import type { Amount } from "@cavalre/core";
import { computeEdgeBps } from "./edge.js";
import { linearDecay, decayProgressBps } from "./dutch-decay.js";

/** @deprecated name — IEEE only; see FloatLib TRUST header */
export function floatLinearDecay(
  startTime: number,
  endTime: number,
  currentTime: number,
  startAmount: number,
  endAmount: number
): number {
  if (endTime <= startTime) throw new Error("EndTimeBeforeStartTime");
  if (currentTime >= endTime) return endAmount;
  if (currentTime <= startTime) return startAmount;
  if (startAmount === endAmount) return startAmount;
  const elapsed = currentTime - startTime;
  const duration = endTime - startTime;
  return startAmount + ((endAmount - startAmount) * elapsed) / duration;
}

/** Same edge formula in Number — not FloatLib.divide. */
export function floatEdgeBps(resolvedOutput: number, refOutput: number): {
  edgeBps: number;
  undefined: boolean;
} {
  if (refOutput === 0) return { edgeBps: 0, undefined: true };
  const bps = ((refOutput - resolvedOutput) / refOutput) * 10_000;
  return { edgeBps: bps, undefined: false };
}

export type MathCompareRow = {
  label: string;
  bigintValue: string;
  floatValue: number;
  absDiff: number;
  relDiffBps: number | null;
};

function relBps(bigintN: number, floatN: number): number | null {
  if (bigintN === 0) return floatN === 0 ? 0 : null;
  return ((floatN - bigintN) / Math.abs(bigintN)) * 10_000;
}

/**
 * Compare production bigint vs IEEE Number (research).
 * Does not invoke CavalRe FloatLib; that lives on-chain / future TS port.
 */
export function compareDecayAndEdge(p: {
  label?: string;
  startAmount: Amount;
  endAmount: Amount;
  startTime: number;
  endTime: number;
  now: number;
  refOutput: Amount;
}): {
  label: string;
  progressBps: { bigint: number; float: number };
  resolvedOut: MathCompareRow;
  edgeBps: MathCompareRow;
  trustNote: string;
} {
  const label = p.label ?? "sample";

  const biResolved = linearDecay(
    p.startTime,
    p.endTime,
    p.now,
    p.startAmount,
    p.endAmount
  );
  const flResolved = floatLinearDecay(
    p.startTime,
    p.endTime,
    p.now,
    Number(p.startAmount),
    Number(p.endAmount)
  );

  const biEdge = computeEdgeBps({
    resolvedOutput: biResolved,
    refOutput: p.refOutput,
  });
  const flEdge = floatEdgeBps(flResolved, Number(p.refOutput));

  const biResolvedN = Number(biResolved);
  const biEdgeN = biEdge.edgeBps;
  const flEdgeN = flEdge.edgeBps;

  return {
    label,
    progressBps: {
      bigint: decayProgressBps(p.startTime, p.endTime, p.now),
      float:
        p.now <= p.startTime
          ? 0
          : p.now >= p.endTime
            ? 10_000
            : ((p.now - p.startTime) * 10_000) / (p.endTime - p.startTime),
    },
    resolvedOut: {
      label: "resolvedOutput",
      bigintValue: biResolved.toString(),
      floatValue: flResolved,
      absDiff: Math.abs(flResolved - biResolvedN),
      relDiffBps: relBps(biResolvedN, flResolved),
    },
    edgeBps: {
      label: "edgeBps",
      bigintValue: String(biEdgeN),
      floatValue: flEdgeN,
      absDiff: Math.abs(flEdgeN - biEdgeN),
      relDiffBps: relBps(biEdgeN, flEdgeN),
    },
    trustNote:
      "FloatLib root: https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol — this compare uses IEEE Number only",
  };
}
