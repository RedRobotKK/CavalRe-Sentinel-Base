import { describe, it, expect } from "vitest";
import { computeEdgeBps } from "../src/edge.js";
import { edgeBpsFloat } from "../src/floatlib.js";
import { decideFill } from "../src/fill-policy.js";
import { applyExclusivityOverride } from "../src/dutch-block-decay.js";

describe("computeEdgeBps — PASS (favorable / neutral)", () => {
  it("positive when we owe less than ref cost", () => {
    // ref 1000, resolved 990 → 100 bps favorable
    const r = computeEdgeBps({ resolvedOutput: 990n, refOutput: 1000n });
    expect(r.undefined).toBe(false);
    expect(r.edgeBps).toBe(100);
  });

  it("zero edge when resolved equals ref", () => {
    const r = computeEdgeBps({ resolvedOutput: 1000n, refOutput: 1000n });
    expect(r.undefined).toBe(false);
    expect(r.edgeBps).toBe(0);
  });

  it("1 bps thin positive edge (floor division)", () => {
    // (10000 - 9999) * 10000 / 10000 = 1
    const r = computeEdgeBps({ resolvedOutput: 9999n, refOutput: 10_000n });
    expect(r.undefined).toBe(false);
    expect(r.edgeBps).toBe(1);
  });

  it("floors sub-bps dust to 0 (not rounded up)", () => {
    // (1_000_000 - 999_999) * 10000 / 1_000_000 = 10000/1000000 = 0
    const r = computeEdgeBps({
      resolvedOutput: 999_999n,
      refOutput: 1_000_000n,
    });
    expect(r.edgeBps).toBe(0);
  });

  it("ETH-scale mid amounts stay finite and signed correctly", () => {
    const resolved = 19_000000000000000n;
    const ref = 22_000000000000000n;
    const r = computeEdgeBps({ resolvedOutput: resolved, refOutput: ref });
    expect(r.undefined).toBe(false);
    expect(r.edgeBps).toBeGreaterThan(1000); // ~1363 bps
    expect(Number.isFinite(r.edgeBps)).toBe(true);
  });

  it("resolved zero vs positive ref is +10000 bps", () => {
    const r = computeEdgeBps({ resolvedOutput: 0n, refOutput: 1000n });
    expect(r.edgeBps).toBe(10_000);
    expect(r.undefined).toBe(false);
  });
});

describe("computeEdgeBps — FAIL / negative / undefined", () => {
  it("negative when we owe more than ref", () => {
    const r = computeEdgeBps({ resolvedOutput: 1010n, refOutput: 1000n });
    expect(r.undefined).toBe(false);
    expect(r.edgeBps).toBe(-100);
  });

  it("FAIL-closed: undefined when ref is zero (reports edgeBps=0)", () => {
    const r = computeEdgeBps({ resolvedOutput: 100n, refOutput: 0n });
    expect(r.undefined).toBe(true);
    expect(r.edgeBps).toBe(0);
  });

  it("FAIL-closed: both zero → undefined", () => {
    const r = computeEdgeBps({ resolvedOutput: 0n, refOutput: 0n });
    expect(r.undefined).toBe(true);
    expect(r.edgeBps).toBe(0);
  });

  it("large negative stays finite", () => {
    const r = computeEdgeBps({
      resolvedOutput: 50_000000000000000n,
      refOutput: 10_000000000000000n,
    });
    expect(r.edgeBps).toBeLessThan(-10_000);
    expect(Number.isFinite(r.edgeBps)).toBe(true);
  });
});

describe("edge vs exclusivity override (soft exclusivity tax)", () => {
  it("PASS: edge still positive after 25 bps override tax", () => {
    const startOut = 1000n;
    const ref = 1000n;
    // without override: edge 0
    expect(computeEdgeBps({ resolvedOutput: startOut, refOutput: ref }).edgeBps).toBe(
      0
    );
    // with override we must deliver more → edge goes negative
    const taxed = applyExclusivityOverride(startOut, 25);
    const after = computeEdgeBps({ resolvedOutput: taxed, refOutput: ref });
    expect(taxed).toBeGreaterThan(startOut);
    expect(after.edgeBps).toBeLessThan(0);
  });

  it("PASS: fat edge survives 25 bps override", () => {
    const startOut = 990n;
    const ref = 1000n;
    const before = computeEdgeBps({ resolvedOutput: startOut, refOutput: ref });
    expect(before.edgeBps).toBe(100);
    const taxed = applyExclusivityOverride(startOut, 25);
    // 990 * 10025 / 10000 ceil → 993
    const after = computeEdgeBps({ resolvedOutput: taxed, refOutput: ref });
    expect(after.edgeBps).toBeGreaterThan(0);
    expect(after.edgeBps).toBeLessThan(before.edgeBps);
  });
});

describe("edgeBpsFloat parity with integer path", () => {
  it("matches computeEdgeBps on classic sample", () => {
    const bi = computeEdgeBps({ resolvedOutput: 990n, refOutput: 1000n });
    const fl = edgeBpsFloat(990n, 1000n);
    expect(fl.undefined).toBe(false);
    expect(fl.edgeBps).toBe(bi.edgeBps);
  });

  it("undefined on zero ref reports clearly", () => {
    const fl = edgeBpsFloat(100n, 0n);
    expect(fl.undefined).toBe(true);
    expect(fl.edgeBps).toBe(0);
  });
});

describe("edge → decideFill policy mapping", () => {
  const base = {
    notional: 50_000000n,
    toxicity: 0.1,
    riskAllowed: true,
  };

  it("PASS accept on edge_ok (≥ minEdgeBps late)", () => {
    const d = decideFill({
      ...base,
      edgeBps: 20,
      decayProgressBps: 5000,
    });
    expect(d.action).toBe("accept");
    expect(d.reason).toBe("edge_ok");
  });

  it("FAIL reject edge_negative late", () => {
    const d = decideFill({
      ...base,
      edgeBps: -50,
      decayProgressBps: 5000,
    });
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("edge_negative");
  });

  it("WAIT edge_negative_wait_decay early", () => {
    const d = decideFill({
      ...base,
      edgeBps: -50,
      decayProgressBps: 500,
    });
    expect(d.action).toBe("wait");
    expect(d.reason).toBe("edge_negative_wait_decay");
  });

  it("WAIT early_decay_thin_edge when positive but below early min", () => {
    const d = decideFill({
      ...base,
      edgeBps: 8, // < earlyDecayMinEdgeBps 15
      decayProgressBps: 1000,
    });
    expect(d.action).toBe("wait");
    expect(d.reason).toBe("early_decay_thin_edge");
  });

  it("FAIL edge_below_min late thin positive", () => {
    const d = decideFill({
      ...base,
      edgeBps: 3, // < minEdgeBps 5
      decayProgressBps: 6000,
    });
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("edge_below_min");
  });

  it("FAIL-closed risk blocks before edge", () => {
    const d = decideFill({
      ...base,
      edgeBps: 100,
      decayProgressBps: 5000,
      riskAllowed: false,
      riskReason: "exceeds_max_position_size",
    });
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("exceeds_max_position_size");
  });
});
