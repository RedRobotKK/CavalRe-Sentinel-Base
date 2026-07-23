/**
 * Feature extraction for residual Dutch toxicity / markout model.
 * Pure functions. NEVER TRUST — all inputs validated.
 *
 * Feature schema v1 (stable — do not expand until N ≥ 300 labeled):
 *   log_notional_usd, decay_progress_bps, edge_bps_vs_amm,
 *   is_exclusive, hour_sin, hour_cos, pair_bucket
 */

export const FEATURE_VERSION = "v1";

const PAIR_BUCKETS = {
  usdc_weth: 0,
  weth_usdc: 1,
  other: 2,
};

export function pairBucket(inputToken, outputToken) {
  const a = (inputToken || "").toLowerCase();
  const b = (outputToken || "").toLowerCase();
  const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const weth = "0x4200000000000000000000000000000000000006";
  if (a === usdc && b === weth) return PAIR_BUCKETS.usdc_weth;
  if (a === weth && b === usdc) return PAIR_BUCKETS.weth_usdc;
  return PAIR_BUCKETS.other;
}

export function hourEncoding(unixSec) {
  const hour = ((unixSec % 86400) + 86400) % 86400 / 3600; // 0–24
  const rad = (2 * Math.PI * hour) / 24;
  return { hour_sin: Math.sin(rad), hour_cos: Math.cos(rad) };
}

/**
 * Extract numeric feature vector from a labeled journal-like record.
 * Returns null if required fields are missing (fail-closed).
 */
export function extractFeatures(rec) {
  if (!rec || typeof rec !== "object") return null;

  const notional = Number(rec.notionalUsd ?? rec.notional_usd ?? NaN);
  const decay = Number(rec.decayProgressBps ?? rec.decay_progress_bps ?? NaN);
  const edge = Number(rec.edgeBpsVsAmm ?? rec.edge_bps_vs_amm ?? NaN);
  const exclusive = rec.exclusive || rec.is_exclusive ? 1 : 0;
  const ts = Number(rec.observedAt ?? rec.observed_at ?? rec.tsUnix ?? Date.now() / 1000);

  if (!Number.isFinite(notional) || notional <= 0) return null;
  if (!Number.isFinite(decay) || decay < -1) return null;
  if (!Number.isFinite(edge)) return null;

  const { hour_sin, hour_cos } = hourEncoding(ts);
  const pair = pairBucket(rec.inputToken, rec.outputToken);

  return {
    log_notional_usd: Math.log(Math.max(notional, 1)),
    decay_progress_bps: decay,
    edge_bps_vs_amm: edge,
    is_exclusive: exclusive,
    hour_sin,
    hour_cos,
    pair_bucket: pair,
  };
}

export function featureNames() {
  return [
    "log_notional_usd",
    "decay_progress_bps",
    "edge_bps_vs_amm",
    "is_exclusive",
    "hour_sin",
    "hour_cos",
    "pair_bucket",
  ];
}

/** Flatten to ordered array for sklearn / training matrices. */
export function toVector(feats) {
  if (!feats) return null;
  return featureNames().map((k) => feats[k]);
}
