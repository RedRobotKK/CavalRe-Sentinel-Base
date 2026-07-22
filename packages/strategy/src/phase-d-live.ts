/**
 * Phase D — Live capital scaffold (gated).
 *
 * TRUST:
 *   https://github.com/CavalRe/cavalre-contracts (Dispatcher, Ledger)
 *   https://github.com/Uniswap/UniswapX (Reactor.execute)
 *   docs/GO_NO_GO.md
 *
 * This module does NOT sign, broadcast, or move funds.
 * It encodes the architecture + a hard gate so live stays OFF by default.
 */

export const LIVE_MODE_ERROR = "live_mode_not_enabled" as const;

/** Evidence required by docs/GO_NO_GO.md — all must be true to unlock. */
export interface GoNoGoEvidence {
  dryRunDaysGte7: boolean;
  shadowAcceptsGte100: boolean;
  meanMarkoutBpsGte0: boolean;
  medianMarkoutBpsGteNeg5: boolean;
  toxicFractionLte25pct: boolean;
  worstDayPnlWithinBound: boolean;
  noKeyLeakage: boolean;
  priorityPolicyOk: boolean;
  humanSignOff: boolean;
}

export const DEFAULT_GO_NO_GO: GoNoGoEvidence = {
  dryRunDaysGte7: false,
  shadowAcceptsGte100: false,
  meanMarkoutBpsGte0: false,
  medianMarkoutBpsGteNeg5: false,
  toxicFractionLte25pct: false,
  worstDayPnlWithinBound: false,
  noKeyLeakage: false,
  priorityPolicyOk: false,
  humanSignOff: false,
};

export function isGoNoGoSatisfied(e: GoNoGoEvidence): boolean {
  return (
    e.dryRunDaysGte7 &&
    e.shadowAcceptsGte100 &&
    e.meanMarkoutBpsGte0 &&
    e.medianMarkoutBpsGteNeg5 &&
    e.toxicFractionLte25pct &&
    e.worstDayPnlWithinBound &&
    e.noKeyLeakage &&
    e.priorityPolicyOk &&
    e.humanSignOff
  );
}

export function missingGoNoGoGates(e: GoNoGoEvidence): (keyof GoNoGoEvidence)[] {
  return (Object.keys(e) as (keyof GoNoGoEvidence)[]).filter((k) => !e[k]);
}

/** Phase-1 live limits after Go (from GO_NO_GO.md). */
export const PHASE_D_LIVE_LIMITS = {
  maxEquityUsd: 200,
  reactorExecuteOnly: true,
  requireDailyReview: true,
  haltOnModelDivergence: true,
} as const;

/**
 * On-chain target shape (not deployed by this package).
 * Install modules behind CavalRe Dispatcher; External roots for WETH/USDC.
 */
export interface PhaseDDeploymentPlan {
  chainId: 8453;
  components: {
    dispatcher: "cavalre-contracts/modules/dispatcher";
    ledger: "cavalre-contracts/modules/ledger";
    fillerModule: "future UniswapXFiller Dispatchable";
    uniswapxReactor: "Base Dutch / Exclusive Dutch reactor (verify address)";
  };
  settlementFlow: string[];
}

export const PHASE_D_PLAN: PhaseDDeploymentPlan = {
  chainId: 8453,
  components: {
    dispatcher: "cavalre-contracts/modules/dispatcher",
    ledger: "cavalre-contracts/modules/ledger",
    fillerModule: "future UniswapXFiller Dispatchable",
    uniswapxReactor: "Base Dutch / Exclusive Dutch reactor (verify address)",
  },
  settlementFlow: [
    "evaluateDutchAuction accept (off-chain)",
    "VirtualBooks capacity check (Phase B)",
    "RiskEngine allow",
    "Ledger.debit output inventory (on-chain, Phase D)",
    "Reactor.execute(SignedOrder)",
    "Ledger.credit input inventory",
    "journal + markout",
  ],
};

export type RunnerMode = "dry-run" | "live";

/**
 * Assert mode is allowed. Live requires full Go/No-Go evidence.
 * Default evidence is all false → live always blocked.
 */
export function assertModeAllowed(
  mode: RunnerMode,
  evidence: GoNoGoEvidence = DEFAULT_GO_NO_GO
): void {
  if (mode === "dry-run") return;
  if (mode === "live") {
    if (!isGoNoGoSatisfied(evidence)) {
      const missing = missingGoNoGoGates(evidence).join(",");
      throw new Error(`${LIVE_MODE_ERROR}:missing_gates:${missing}`);
    }
    return;
  }
  throw new Error(`unknown_mode:${mode}`);
}

/** Convenience: can we enable live right now? */
export function canEnableLive(
  evidence: GoNoGoEvidence = DEFAULT_GO_NO_GO
): boolean {
  return isGoNoGoSatisfied(evidence);
}
