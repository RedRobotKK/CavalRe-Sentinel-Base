/**
 * Low-capital Dutch fill policy (Jane Street / Cumberland style gates).
 *
 * edgeBps = (refOut - resolvedOut) / refOut * 1e4
 * Accept only with positive edge above thresholds; wait early when thin.
 */

export type FillAction = "accept" | "reject" | "wait";

export interface FillPolicyConfig {
  minEdgeBps: number;
  /** Required edge while decay is still early (anti-snipe). */
  earlyDecayMinEdgeBps: number;
  /** Decay progress below this is "early". */
  earlyDecayBelowBps: number;
  maxToxicity: number;
  minNotional: bigint;
}

export const DEFAULT_LOW_CAPITAL_POLICY: FillPolicyConfig = {
  minEdgeBps: 5,
  earlyDecayMinEdgeBps: 15,
  earlyDecayBelowBps: 2000,
  maxToxicity: 0.65,
  minNotional: 25_000000n, // $25 if 6dp stable
};

export interface FillFeatures {
  notional: bigint;
  edgeBps: number;
  toxicity: number;
  decayProgressBps: number;
  riskAllowed: boolean;
  riskReason?: string;
  policy?: Partial<FillPolicyConfig>;
}

export interface FillDecision {
  action: FillAction;
  reason: string;
}

/** @deprecated use FillFeatures */
export type FillPolicyInput = FillFeatures;

export function decideFill(p: FillFeatures): FillDecision {
  const cfg: FillPolicyConfig = {
    ...DEFAULT_LOW_CAPITAL_POLICY,
    ...p.policy,
  };

  if (!p.riskAllowed) {
    return {
      action: "reject",
      reason: p.riskReason ?? "risk_blocked",
    };
  }

  if (p.notional <= 0n) {
    return { action: "reject", reason: "zero_notional" };
  }

  if (p.notional < cfg.minNotional) {
    return { action: "reject", reason: "below_min_notional" };
  }

  if (p.toxicity > cfg.maxToxicity) {
    return { action: "reject", reason: "toxicity_high" };
  }

  // Negative edge: wait early (decay may help), else reject
  if (p.edgeBps < 0) {
    if (p.decayProgressBps < cfg.earlyDecayBelowBps) {
      return { action: "wait", reason: "edge_negative_wait_decay" };
    }
    return { action: "reject", reason: "edge_negative" };
  }

  // Early in curve: demand fatter edge (don't race pros on crumbs)
  if (
    p.decayProgressBps < cfg.earlyDecayBelowBps &&
    p.edgeBps < cfg.earlyDecayMinEdgeBps
  ) {
    return { action: "wait", reason: "early_decay_thin_edge" };
  }

  if (p.edgeBps < cfg.minEdgeBps) {
    if (p.decayProgressBps < 4000) {
      return { action: "wait", reason: "edge_below_min" };
    }
    return { action: "reject", reason: "edge_below_min" };
  }

  return { action: "accept", reason: "edge_ok" };
}

/**
 * Simple toxicity score in [0,1].
 * Late decay + suspiciously large edge vs AMM raises score.
 */
export function heuristicToxicity(p: {
  decayProgressBps: number;
  edgeBpsVsAmm: number;
  recentPairToxicRate?: number;
}): number {
  const late = Math.min(1, Math.max(0, p.decayProgressBps / 10_000));
  const juicy = Math.min(1, Math.max(0, Math.abs(p.edgeBpsVsAmm) / 100));
  const hist = Math.min(1, Math.max(0, p.recentPairToxicRate ?? 0));
  const score = 0.45 * late + 0.35 * juicy + 0.2 * hist;
  return Math.min(1, Math.max(0, score));
}
