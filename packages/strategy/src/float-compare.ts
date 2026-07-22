/**
 * Experimental IEEE-754 float path vs production bigint Amount math.
 * NOT for production fills — comparison / research only.
 *
 * "floatlib" here = plain Number arithmetic (no external package).
 * Above 2^53−1, not every integer is representable → decay/edge can drift.
 */

import type { Amount } from "@cavalre/core";
import { computeEdgeBps } from "./edge.js";
import { linearDecay, decayProgressBps } from "./dutch-decay.js";

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

/** Same formula as computeEdgeBps but fully in Number. */
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
 * Compare bigint vs float for one decay + edge snapshot.
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
  };
}
