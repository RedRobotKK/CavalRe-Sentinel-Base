import { describe, it, expect, beforeEach } from "vitest";
import { toAmount } from "@cavalre/core";
import {
  RiskEngine,
  defaultSmallCapitalConfig,
  type RiskConfig,
} from "../src/risk-engine.js";

describe("RiskEngine (small capital)", () => {
  let engine: RiskEngine;
  let config: RiskConfig;

  beforeEach(() => {
    config = defaultSmallCapitalConfig();
    engine = new RiskEngine(config);
  });

  it("starts with full equity and not halted", () => {
    expect(engine.getCurrentEquity()).toBe(config.workingCapital);
    expect(engine.isHalted()).toBe(false);
    expect(engine.getDailyLoss()).toBe(0n);
  });

  it("allows a position within limits", () => {
    const decision = engine.checkPositionSize(toAmount("50000000")); // $50
    expect(decision.allowed).toBe(true);
  });

  it("rejects a position above maxPositionSize", () => {
    const decision = engine.checkPositionSize(toAmount("90000000")); // $90 > $80
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("exceeds_max_position_size");
  });

  it("rejects a position larger than current equity", () => {
    // Force equity down
    engine.recordLoss(toAmount("950000000")); // leave $50
    const decision = engine.checkPositionSize(toAmount("60000000"));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("exceeds_current_equity");
  });

  it("halts when daily loss limit is breached", () => {
    engine.recordLoss(toAmount("21000000")); // $21 > $20 limit
    expect(engine.isHalted()).toBe(true);
    expect(engine.checkPositionSize(toAmount("1000000")).allowed).toBe(false);
    expect(engine.checkPositionSize(toAmount("1000000")).reason).toBe(
      "engine_halted"
    );
  });

  it("halts on drawdown limit", () => {
    // Peak is $1000. Drop by more than $50.
    engine.recordLoss(toAmount("60000000")); // $60 drawdown
    expect(engine.isHalted()).toBe(true);
  });

  it("records profit and updates equity", () => {
    engine.recordProfit(toAmount("5000000")); // +$5
    expect(engine.getCurrentEquity()).toBe(toAmount("1005000000"));
  });

  it("clearHalt requires explicit call", () => {
    engine.recordLoss(toAmount("21000000"));
    expect(engine.isHalted()).toBe(true);
    engine.clearHalt();
    expect(engine.isHalted()).toBe(false);
  });

  it("resetDailyLoss does not clear halt", () => {
    engine.recordLoss(toAmount("21000000"));
    engine.resetDailyLoss();
    expect(engine.getDailyLoss()).toBe(0n);
    expect(engine.isHalted()).toBe(true); // still halted
  });

  it("rejects negative working capital at construction", () => {
    expect(
      () =>
        new RiskEngine({
          workingCapital: toAmount("0"),
          maxPositionSize: toAmount("1"),
          maxDailyLoss: toAmount("1"),
          drawdownLimit: toAmount("1"),
        })
    ).toThrow("workingCapital must be positive");
  });
});
