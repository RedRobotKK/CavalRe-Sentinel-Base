import { describe, it, expect } from "vitest";
import {
  DEFAULT_GO_NO_GO,
  isGoNoGoSatisfied,
  missingGoNoGoGates,
  assertModeAllowed,
  canEnableLive,
  LIVE_MODE_ERROR,
  PHASE_D_LIVE_LIMITS,
  PHASE_D_PLAN,
  type GoNoGoEvidence,
} from "../src/phase-d-live.js";

describe("Phase D — Go/No-Go gate", () => {
  it("default evidence is not satisfied", () => {
    expect(isGoNoGoSatisfied(DEFAULT_GO_NO_GO)).toBe(false);
    expect(canEnableLive()).toBe(false);
  });

  it("lists all missing gates when default", () => {
    const m = missingGoNoGoGates(DEFAULT_GO_NO_GO);
    expect(m.length).toBe(9);
    expect(m).toContain("humanSignOff");
    expect(m).toContain("shadowAcceptsGte100");
  });

  it("dry-run always allowed", () => {
    expect(() => assertModeAllowed("dry-run")).not.toThrow();
  });

  it("live blocked by default", () => {
    expect(() => assertModeAllowed("live")).toThrow(LIVE_MODE_ERROR);
  });

  it("live still blocked if only humanSignOff true", () => {
    const e: GoNoGoEvidence = { ...DEFAULT_GO_NO_GO, humanSignOff: true };
    expect(() => assertModeAllowed("live", e)).toThrow(LIVE_MODE_ERROR);
  });

  it("live allowed only when every gate true", () => {
    const e: GoNoGoEvidence = {
      dryRunDaysGte7: true,
      shadowAcceptsGte100: true,
      meanMarkoutBpsGte0: true,
      medianMarkoutBpsGteNeg5: true,
      toxicFractionLte25pct: true,
      worstDayPnlWithinBound: true,
      noKeyLeakage: true,
      priorityPolicyOk: true,
      humanSignOff: true,
    };
    expect(isGoNoGoSatisfied(e)).toBe(true);
    expect(() => assertModeAllowed("live", e)).not.toThrow();
  });
});

describe("Phase D — limits and plan", () => {
  it("phase-1 max equity is $200", () => {
    expect(PHASE_D_LIVE_LIMITS.maxEquityUsd).toBe(200);
    expect(PHASE_D_LIVE_LIMITS.reactorExecuteOnly).toBe(true);
  });

  it("deployment plan targets Base 8453", () => {
    expect(PHASE_D_PLAN.chainId).toBe(8453);
    expect(PHASE_D_PLAN.settlementFlow.length).toBeGreaterThan(3);
    expect(PHASE_D_PLAN.components.ledger).toContain("ledger");
  });
});
