import type { Amount } from "@cavalre/core";
import type { MarkoutAnnotation } from "./types.js";

/**
 * Build a MarkoutAnnotation from observed prices.
 *
 * markoutBps = (markPrice - fillPrice) / fillPrice * 10_000
 * Positive = favorable for the filler; negative = adverse (potential toxicity).
 *
 * All inputs are Amount (bigint). Division is integer; we scale to preserve bps.
 */
export function computeMarkoutBps(
  fillPrice: Amount,
  markPrice: Amount
): string {
  if (fillPrice === 0n) {
    return "0";
  }
  // (mark - fill) * 10000 / fill
  const diff = markPrice - fillPrice;
  const bps = (diff * 10000n) / fillPrice;
  return bps.toString();
}

/**
 * Create a MarkoutAnnotation.
 * toxicThresholdBps: absolute bps beyond which we flag toxic (e.g. 30 = 0.3%).
 */
export function makeMarkoutAnnotation(params: {
  fillPrice: Amount;
  markPrice: Amount;
  windowSec: number;
  toxicThresholdBps?: number;
}): MarkoutAnnotation {
  const markoutBps = computeMarkoutBps(params.fillPrice, params.markPrice);
  const threshold = params.toxicThresholdBps ?? 30;
  const bpsNum = Number(markoutBps); // only for threshold compare; source of truth stays string
  const toxic = bpsNum < -threshold;

  return {
    markoutBps,
    windowSec: params.windowSec,
    toxic,
  };
}
