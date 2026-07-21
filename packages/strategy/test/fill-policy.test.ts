import { describe, it, expect } from "vitest";
import {
  decideFill,
  heuristicToxicity,
  DEFAULT_LOW_CAPITAL_POLICY,
} from "../src/fill-policy.js";

describe("decideFill (low capital)", () => {
  const base = {
    notional: 100_000000n, // $100
    edgeBps: 20,
    toxicity: 0.2,
    decayProgressBps: 4000,
    riskAllowed: true,
  };

  it("accepts healthy mid-curve order", () => {
    const d = decideFill(base);
    expect(d.action).toBe("accept");
  });

  it("rejects when risk denies", () => {
    const d = decideFill({ ...base, riskAllowed: false, riskReason: "exceeds_max_position_size" });
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("exceeds_max_position_size");
  });

  it("rejects below min notional", () => {
    const d = decideFill({ ...base, notional: 10_000000n });
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("below_min_notional");
  });

  it("rejects high toxicity", () => {
    const d = decideFill({ ...base, toxicity: 0.9 });
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("toxicity_high");
  });

  it("waits when edge too thin", () => {
    const d = decideFill({ ...base, edgeBps: 2, decayProgressBps: 3000 });
    expect(d.action).toBe("wait");
    expect(d.reason).toBe("edge_below_min");
  });

  it("waits early decay with only thin edge (don't race pros)", () => {
    const d = decideFill({
      ...base,
      edgeBps: 8, // above minEdge 5 but below earlyDecayMinEdge 15
      decayProgressBps: 500,
    });
    expect(d.action).toBe("wait");
    expect(d.reason).toBe("early_decay_thin_edge");
  });

  it("accepts early decay if edge is fat", () => {
    const d = decideFill({
      ...base,
      edgeBps: 40,
      decayProgressBps: 500,
      toxicity: 0.1,
    });
    expect(d.action).toBe("accept");
  });
});

describe("heuristicToxicity", () => {
  it("increases late in decay", () => {
    const early = heuristicToxicity({ decayProgressBps: 1000, edgeBpsVsAmm: 5 });
    const late = heuristicToxicity({ decayProgressBps: 9000, edgeBpsVsAmm: 5 });
    expect(late).toBeGreaterThan(early);
  });

  it("increases when edge vs AMM is suspiciously large", () => {
    const normal = heuristicToxicity({ decayProgressBps: 4000, edgeBpsVsAmm: 5 });
    const juicy = heuristicToxicity({ decayProgressBps: 4000, edgeBpsVsAmm: 80 });
    expect(juicy).toBeGreaterThan(normal);
  });

  it("is bounded in [0,1]", () => {
    const s = heuristicToxicity({
      decayProgressBps: 9999,
      edgeBpsVsAmm: 100,
      recentPairToxicRate: 1,
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("DEFAULT_LOW_CAPITAL_POLICY", () => {
  it("has conservative thresholds", () => {
    expect(DEFAULT_LOW_CAPITAL_POLICY.minEdgeBps).toBeGreaterThan(0);
    expect(DEFAULT_LOW_CAPITAL_POLICY.maxToxicity).toBeLessThan(1);
    expect(DEFAULT_LOW_CAPITAL_POLICY.minNotional).toBeGreaterThan(0n);
  });
});
