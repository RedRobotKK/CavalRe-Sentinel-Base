/**
 * Soft toxicity prior — advisory only.
 *
 * Default posture: NO_OPINION.
 * Never blocks or accepts on its own. FillPolicy hard gates remain authoritative.
 *
 * Enable only after real residual walk-forward AUC ≥ 0.65 + calibration + review.
 */

import { extractFeatures, toVector } from "./features.js";

export const DISABLED_PRIOR = {
  enabled: false,
  w: null,
  b: 0,
  threshold: 0.5,
  source: "disabled",
  meanAuc: null,
};

export function scoreSoftPrior(model, rec) {
  if (!model || !model.enabled || !model.w || !Array.isArray(model.w)) {
    return { opinion: "no_opinion", pToxic: null, reason: "prior_disabled" };
  }

  const feats = extractFeatures(rec);
  if (!feats) return { opinion: "no_opinion", pToxic: null, reason: "features_unavailable" };

  const vec = toVector(feats);
  if (!vec || vec.length !== model.w.length) {
    return { opinion: "no_opinion", pToxic: null, reason: "feature_dim_mismatch" };
  }

  let z = model.b;
  for (let i = 0; i < vec.length; i++) z += vec[i] * model.w[i];
  const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

  if (p >= model.threshold) {
    return { opinion: "likely_toxic", pToxic: p, reason: "prior_above_threshold" };
  }
  if (p <= 1 - model.threshold) {
    return { opinion: "likely_clean", pToxic: p, reason: "prior_below_threshold" };
  }
  return { opinion: "no_opinion", pToxic: p, reason: "prior_uncertain_band" };
}

export function modelFromWeights(w, b, meta = {}) {
  return {
    enabled: false,
    w: [...w],
    b,
    threshold: meta.threshold ?? 0.55,
    source: meta.source ?? "unspecified",
    meanAuc: meta.meanAuc ?? null,
  };
}

export function policyHint(opinion) {
  switch (opinion) {
    case "likely_toxic":
      return "raise_edge_floor_or_wait";
    case "likely_clean":
      return "no_change";
    default:
      return "no_change";
  }
}
