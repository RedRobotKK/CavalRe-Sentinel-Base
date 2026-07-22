/**
 * Phase A — Off-chain policy spec aligned to cavalre-contracts.
 *
 * TRUST:
 *   https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol
 *   https://github.com/CavalRe/cavalre-contracts/blob/main/modules/ledger/
 *   docs/TRUST_CAVALRE_CONTRACTS.md
 *
 * This module does NOT implement Float arithmetic or on-chain Ledger.
 * It freezes the semantic contract Sentinel must obey before Phase B–E.
 */

/** Mirrors FloatLib.SIGNIFICANT_DIGITS */
export const FLOATLIB_SIGNIFICANT_DIGITS = 21 as const;

/** Mirrors FloatLib.MANTISSA_BITS */
export const FLOATLIB_MANTISSA_BITS = 72 as const;

/** Normalized mantissa band [10^(d-1), 10^d - 1] */
export const FLOATLIB_NORMALIZED_MANTISSA_MIN = 10n ** 20n;
export const FLOATLIB_NORMALIZED_MANTISSA_MAX = 10n ** 21n - 1n;

export type LedgerTokenKind = "Native" | "External" | "Internal" | "Claim";

/** Base external assets Sentinel may treat as External roots (Phase A catalog). */
export const PHASE_A_EXTERNAL_ROOTS = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;

/**
 * ILedger-style failures → RiskEngine / policy reject reasons.
 * Fail-closed vocabulary must stay stable across phases.
 */
export const LEDGER_ERROR_TO_POLICY_REASON = {
  InsufficientBalance: "exceeds_current_equity",
  InsufficientAllowance: "risk_blocked",
  InvalidToken: "invalid_token",
  InvalidAddress: "invalid_address",
  UndercollateralizedToken: "undercollateralized",
  Unauthorized: "unauthorized",
  LedgerUninitialized: "ledger_uninitialized",
  ZeroAddress: "zero_address",
  HasBalance: "has_balance",
  HasSubAccount: "has_subaccount",
} as const;

export type LedgerErrorName = keyof typeof LEDGER_ERROR_TO_POLICY_REASON;

export function mapLedgerErrorToPolicyReason(err: LedgerErrorName): string {
  return LEDGER_ERROR_TO_POLICY_REASON[err];
}

/**
 * Phase A money rules (enforced by process + tests, not by FloatLib bytecode).
 */
export const PHASE_A_MONEY_RULES = {
  /** Wire + journal + decay + quoter amounts */
  amountType: "bigint" as const,
  /** Never use IEEE Number for notionals */
  forbidIeeeForValue: true,
  /** IEEE Number only for thresholds (bps, toxicity) */
  numberAllowedFor: ["edgeBpsThreshold", "toxicityScore", "decayProgressBps"] as const,
  /** FloatLib is root of trust for future ratio ports — not IEEE float-compare */
  floatRootOfTrust:
    "https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol",
  ledgerRootOfTrust:
    "https://github.com/CavalRe/cavalre-contracts/tree/main/modules/ledger",
} as const;

export type IntegrationPhase = "A" | "B" | "C" | "D" | "E";

export interface PhaseDefinition {
  id: IntegrationPhase;
  name: string;
  posture: "off-chain" | "hybrid" | "on-chain";
  deliverable: string;
  liveCapital: boolean;
}

/** Canonical phase ladder — README and docs must match this object. */
export const INTEGRATION_PHASES: readonly PhaseDefinition[] = [
  {
    id: "A",
    name: "Policy spec",
    posture: "off-chain",
    deliverable:
      "FloatLib + Ledger semantics locked as constants, error maps, and docs",
    liveCapital: false,
  },
  {
    id: "B",
    name: "Virtual books",
    posture: "off-chain",
    deliverable:
      "Journal accepts post to ledger-shaped accounts (mirror, not chain)",
    liveCapital: false,
  },
  {
    id: "C",
    name: "FloatLib port",
    posture: "off-chain",
    deliverable:
      "TS Float ops verified against FloatLib tests for edge/markout ratios",
    liveCapital: false,
  },
  {
    id: "D",
    name: "Live capital",
    posture: "on-chain",
    deliverable:
      "Dispatcher + Ledger on Base; filler module moves External roots on accept",
    liveCapital: true,
  },
  {
    id: "E",
    name: "Product",
    posture: "hybrid",
    deliverable: "Claim/internal shares on filler PnL; multi-sleeve capital",
    liveCapital: true,
  },
] as const;

export function phaseById(id: IntegrationPhase): PhaseDefinition {
  const p = INTEGRATION_PHASES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown_phase:${id}`);
  return p;
}

/** Phase A is complete only when these invariants hold in code. */
export function assertPhaseAInvariants(): void {
  if (FLOATLIB_SIGNIFICANT_DIGITS !== 21) {
    throw new Error("FloatLib SIGNIFICANT_DIGITS mismatch");
  }
  if (FLOATLIB_MANTISSA_BITS !== 72) {
    throw new Error("FloatLib MANTISSA_BITS mismatch");
  }
  if (FLOATLIB_NORMALIZED_MANTISSA_MIN >= FLOATLIB_NORMALIZED_MANTISSA_MAX) {
    throw new Error("FloatLib mantissa band invalid");
  }
  if (!PHASE_A_MONEY_RULES.forbidIeeeForValue) {
    throw new Error("IEEE value arithmetic must stay forbidden");
  }
  if (INTEGRATION_PHASES[0]?.id !== "A") {
    throw new Error("Phase ladder must start at A");
  }
}
