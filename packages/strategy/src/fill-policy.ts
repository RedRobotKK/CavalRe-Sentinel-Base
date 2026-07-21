/**
 * Fill policy for low-capital Dutch on Base.
 *
 * Win condition (inventory-light):
 *   edgeBps = (refOut - resolvedOut) / refOut * 1e4
 * must clear minEdgeBps after we can source output on AMM.
 *
 * When edge is thin but decay is early → WAIT (price improves for filler as Dutch decays).
 * When toxicity high or risk blocked → REJECT.
 */

export type FillAction = "accept" | "reject" | "wait";

export interface FillDecision {
  action: FillAction;
  reason: string;
}

export interface FillPolicyInput {
  notional: bigint;
  edgeBps: number;
  toxicity: number;
  decayProgressBps: number;
  riskAllowed: boolean;
  riskReason?: string;
  /** Minimum edge in bps to accept (default 5). */
  minEdgeBps?: number;
  /** Toxicity above this → reject (default 0.65). */
  maxToxicity?: number;
  /** If edge in [0, minEdge) and decay below this → wait (default 4000 = 40%). */
  earlyDecayWaitBelowBps?: number;
}

export function decideFill(p: FillPolicyInput): FillDecision {
  const minEdge = p.minEdgeBps ?? 5;
  const maxTox = p.maxToxicity ?? 0.65;
  const earlyWait = p.earlyDecayWaitBelowBps ?? 4000;

  if (!p.riskAllowed) {
    return {
      action: "reject",
      reason: p.riskReason ? `risk:${p.riskReason}` : "risk_blocked",
    };
  }

  if (p.notional <= 0n) {
    return { action: "reject", reason: "zero_notional" };
  }

  if (p.toxicity > maxTox) {
    return { action: "reject", reason: `toxicity_high:${p.toxicity}` };
  }

  // Negative edge vs AMM reference → cannot win inventory-light
  if (p.edgeBps < 0) {
    // Early in Dutch: wait for decay to improve filler terms
    if (p.decayProgressBps < earlyWait) {
      return {
        action: "wait",
        reason: `edge_negative_wait_decay:${p.edgeBps}`,
      };
    }
    return { action: "reject", reason: `edge_negative:${p.edgeBps}` };
  }

  // Thin positive edge early → optional wait for more decay (better price)
  if (p.edgeBps < minEdge && p.decayProgressBps < earlyWait) {
    return {
      action: "wait",
      reason: `edge_thin_wait_decay:${p.edgeBps}<${minEdge}`,
    };
  }

  if (p.edgeBps < minEdge) {
    return {
      action: "reject",
      reason: `edge_below_min:${p.edgeBps}<${minEdge}`,
    };
  }

  return {
    action: "accept",
    reason: `edge_ok:${p.edgeBps}>=${minEdge}`,
  };
}
