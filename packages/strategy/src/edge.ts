/**
 * Computed edge — never assumed.
 *
 * edgeBps = (resolvedOutput - refOutput) / refOutput * 10_000
 * when we receive output and pay input (filler buys input, sells output),
 * the economic meaning depends on leg orientation. For standard
 * swapper-sells-tokenIn / filler-provides-tokenOut:
 *   filler gives resolvedOutput, receives resolvedInput.
 * Reference cost refOutput = output amount needed to source via AMM/inventory.
 * Positive edgeBps ⇒ resolved obligation is cheaper than ref (favorable).
 *
 * For filler obligation = output tokens to swapper:
 *   edgeBps = (refOutput - resolvedOutput) / refOutput * 10000
 *   (we owe less than it costs us to source ⇒ positive)
 */

import type { Amount } from "@cavalre/core";

export interface EdgeInput {
  /** Output amount we must deliver (resolved Dutch). */
  resolvedOutput: Amount;
  /** Output amount our reference cost model requires to source. */
  refOutput: Amount;
}

export interface EdgeResult {
  edgeBps: number;
  /** true if refOutput was zero (undefined economics). */
  undefined: boolean;
}

/**
 * Compute edge in bps. Integer division on Amount; result is number only for policy thresholds.
 * Fail-closed: zero ref → undefined, edgeBps = 0.
 */
export function computeEdgeBps(input: EdgeInput): EdgeResult {
  const { resolvedOutput, refOutput } = input;
  if (refOutput === 0n) {
    return { edgeBps: 0, undefined: true };
  }
  // (ref - resolved) * 10000 / ref
  const diff = refOutput - resolvedOutput;
  const bps = Number((diff * 10000n) / refOutput);
  return { edgeBps: bps, undefined: false };
}
