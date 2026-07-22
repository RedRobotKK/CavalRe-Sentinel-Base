import { describe, it, expect } from "vitest";
import {
  FLOATLIB_SIGNIFICANT_DIGITS,
  FLOATLIB_MANTISSA_BITS,
  FLOATLIB_NORMALIZED_MANTISSA_MIN,
  FLOATLIB_NORMALIZED_MANTISSA_MAX,
  LEDGER_ERROR_TO_POLICY_REASON,
  mapLedgerErrorToPolicyReason,
  PHASE_A_EXTERNAL_ROOTS,
  PHASE_A_MONEY_RULES,
  INTEGRATION_PHASES,
  phaseById,
  assertPhaseAInvariants,
} from "../src/phase-a-spec.js";

describe("Phase A — FloatLib constants (TRUST cavalre-contracts)", () => {
  it("locks 21 significant digits and 72-bit mantissa", () => {
    expect(FLOATLIB_SIGNIFICANT_DIGITS).toBe(21);
    expect(FLOATLIB_MANTISSA_BITS).toBe(72);
  });

  it("normalized mantissa band is [1e20, 1e21-1]", () => {
    expect(FLOATLIB_NORMALIZED_MANTISSA_MIN).toBe(10n ** 20n);
    expect(FLOATLIB_NORMALIZED_MANTISSA_MAX).toBe(10n ** 21n - 1n);
    expect(FLOATLIB_NORMALIZED_MANTISSA_MIN < FLOATLIB_NORMALIZED_MANTISSA_MAX).toBe(
      true
    );
  });
});

describe("Phase A — Ledger error → policy map", () => {
  it("maps InsufficientBalance to equity-style reject", () => {
    expect(mapLedgerErrorToPolicyReason("InsufficientBalance")).toBe(
      "exceeds_current_equity"
    );
  });

  it("maps UndercollateralizedToken", () => {
    expect(LEDGER_ERROR_TO_POLICY_REASON.UndercollateralizedToken).toBe(
      "undercollateralized"
    );
  });

  it("every mapped reason is non-empty", () => {
    for (const [k, v] of Object.entries(LEDGER_ERROR_TO_POLICY_REASON)) {
      expect(v.length).toBeGreaterThan(0);
      expect(k.length).toBeGreaterThan(0);
    }
  });
});

describe("Phase A — money rules", () => {
  it("forbids IEEE Number for value", () => {
    expect(PHASE_A_MONEY_RULES.amountType).toBe("bigint");
    expect(PHASE_A_MONEY_RULES.forbidIeeeForValue).toBe(true);
  });

  it("points float root of trust at FloatLib.sol", () => {
    expect(PHASE_A_MONEY_RULES.floatRootOfTrust).toContain(
      "CavalRe/cavalre-contracts"
    );
    expect(PHASE_A_MONEY_RULES.floatRootOfTrust).toContain("FloatLib.sol");
  });

  it("catalogs Base External roots", () => {
    expect(PHASE_A_EXTERNAL_ROOTS.WETH.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/);
    expect(PHASE_A_EXTERNAL_ROOTS.USDC.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/);
  });
});

describe("Phase A — integration phase ladder", () => {
  it("defines A through E in order", () => {
    expect(INTEGRATION_PHASES.map((p) => p.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("Phase A is off-chain and liveCapital false", () => {
    const a = phaseById("A");
    expect(a.posture).toBe("off-chain");
    expect(a.liveCapital).toBe(false);
  });

  it("only D and E allow live capital flag", () => {
    for (const p of INTEGRATION_PHASES) {
      if (p.id === "D" || p.id === "E") expect(p.liveCapital).toBe(true);
      else expect(p.liveCapital).toBe(false);
    }
  });

  it("assertPhaseAInvariants passes", () => {
    expect(() => assertPhaseAInvariants()).not.toThrow();
  });
});
