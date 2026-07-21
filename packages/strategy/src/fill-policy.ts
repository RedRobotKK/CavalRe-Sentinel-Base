import type { Amount } from "@cavalre/core";
import { isGT } from "@cavalre/core";

export type FillAction = "accept" | "reject" | "wait";

export interface FillPolicyConfig {
  /** Minimum edge vs cost model, in bps. */
  minEdgeBps: number;
  /** Reject if toxicity score >= this (0–1). */
  maxToxicity: number;
  /** Minimum notional (Amount, raw units). */
  minNotional: Amount;
  /** Prefer waiting if edge positive but decay just started and edge thin. */
  earlyDecayMaxProgressBps: number;
  /** Min edge required to accept in early decay window. */
  earlyDecayMinEdgeBps: number;
}

export const DEFAULT_LOW_CAPITAL_POLICY: FillPolicyConfig = {
  minEdgeBps: 5,
  maxToxicity: 0.55,
  minNotional: 50_000000n, // $50 if 6 decimals
  earlyDecayMaxProgressBps: 1500, // first 15%
  earlyDecayMinEdgeBps: 15,
};

export interface FillFeatures {
  notional: Amount;
  edgeBps: number; // can be negative
  toxicity: number; // 0–1
  decayProgressBps: number; // 0–10000
  riskAllowed: boolean;
  riskReason?: string;
}

export interface FillDecision {
  action: FillAction;
  reason: string;
}

/**
 * Low-capital FillPolicy.
 * Pure function: features + config → accept | reject | wait.
 */
export function decideFill(
  features: FillFeatures,
  config: FillPolicyConfig = DEFAULT_LOW_CAPITAL_POLICY
): FillDecision {
  if (!features.riskAllowed) {
    return {
      action: "reject",
      reason: features.riskReason ?? "risk_reject",
    };
  }

  if (!isGT(features.notional, config.minNotional - 1n)) {
    // notional < minNotional
    if (features.notional < config.minNotional) {
      return { action: "reject", reason: "below_min_notional" };
    }
  }

  if (features.toxicity >= config.maxToxicity) {
    return { action: "reject", reason: "toxicity_high" };
  }

  if (features.edgeBps < config.minEdgeBps) {
    // Not yet profitable enough — Dutch may improve
    if (features.decayProgressBps < 10000 && features.edgeBps < config.minEdgeBps) {
      return { action: "wait", reason: "edge_below_min" };
    }
    return { action: "reject", reason: "edge_below_min_terminal" };
  }

  // Early in decay: require fatter edge (don't race pros for thin edge)
  if (
    features.decayProgressBps <= config.earlyDecayMaxProgressBps &&
    features.edgeBps < config.earlyDecayMinEdgeBps
  ) {
    return { action: "wait", reason: "early_decay_thin_edge" };
  }

  return { action: "accept", reason: "policy_accept" };
}

/**
 * Heuristic toxicity in [0, 1] without an SLM.
 * Higher = more likely adverse.
 */
export function heuristicToxicity(params: {
  decayProgressBps: number;
  edgeBpsVsAmm: number; // positive = we seem to win vs AMM
  recentPairToxicRate?: number; // 0–1 from journal stats
}): number {
  let score = 0;

  // Deep into auction and still open → others passed → higher toxic prior
  if (params.decayProgressBps >= 8000) score += 0.35;
  else if (params.decayProgressBps >= 5000) score += 0.2;

  // If edge vs AMM is huge, may be toxic (too good to be true)
  if (params.edgeBpsVsAmm >= 50) score += 0.35;
  else if (params.edgeBpsVsAmm >= 25) score += 0.15;

  if (params.recentPairToxicRate !== undefined) {
    score += params.recentPairToxicRate * 0.4;
  }

  if (score > 1) score = 1;
  if (score < 0) score = 0;
  return score;
}
