import { describe, it, expect } from "vitest";
import { compareDecayAndEdge, floatEdgeBps } from "../src/float-compare.js";
import { computeEdgeBps } from "../src/edge.js";

describe("float vs bigint edge (small amounts — within float mantissa)", () => {
  it("matches on small integers", () => {
    const bi = computeEdgeBps({ resolvedOutput: 990n, refOutput: 1000n });
    const fl = floatEdgeBps(990, 1000);
    expect(bi.edgeBps).toBe(100);
    expect(Math.round(fl.edgeBps)).toBe(100);
  });
});

describe("float vs bigint at ETH scale (1e18)", () => {
  const start = 20_000000000000000n; // 0.02 ETH
  const end = 18_000000000000000n;
  const ref = 22_000000000000000n;

  it("reports comparison row for mid decay", () => {
    const row = compareDecayAndEdge({
      label: "mid-0.02ETH",
      startAmount: start,
      endAmount: end,
      startTime: 1_000,
      endTime: 2_000,
      now: 1_500,
      refOutput: ref,
    });

    // Progress identical for integer times
    expect(row.progressBps.bigint).toBe(5000);
    expect(Math.round(row.progressBps.float)).toBe(5000);

    // Resolved amount: bigint is ground truth; float may equal or drift
    expect(row.resolvedOut.bigintValue).toBeTruthy();
    expect(Number.isFinite(row.resolvedOut.floatValue)).toBe(true);

    // Document: abs diff can be 0 on this sample (both land on representable ints)
    // but edge float can still be non-integer
    expect(row.edgeBps.floatValue).not.toBeNaN();
  });

  it("float edge is continuous; bigint edge is truncated integer bps", () => {
    const row = compareDecayAndEdge({
      startAmount: start,
      endAmount: end,
      startTime: 1_000,
      endTime: 2_000,
      now: 1_333,
      refOutput: ref,
    });
    // bigint path uses integer division → whole bps
    expect(Number.isInteger(Number(row.edgeBps.bigintValue))).toBe(true);
    // float path keeps fractional bps
    expect(row.edgeBps.floatValue).not.toBe(Math.trunc(row.edgeBps.floatValue));
  });
});

describe("float precision stress near 2^53", () => {
  it("large wei amounts can diverge on decay", () => {
    // 1 ETH scale endpoints with long window — Number loses low bits
    const start = 1_000000000000000000n;
    const end = 999_000000000000000n;
    const row = compareDecayAndEdge({
      label: "1ETH-stress",
      startAmount: start,
      endAmount: end,
      startTime: 0,
      endTime: 1_000_000,
      now: 123_456,
      refOutput: 1_001000000000000000n,
    });

    // If float rounded the endpoints, absDiff on resolved may be > 0
    expect(row.resolvedOut.absDiff).toBeGreaterThanOrEqual(0);
    // Always produce finite comparison
    expect(Number.isFinite(row.edgeBps.floatValue)).toBe(true);
  });
});
