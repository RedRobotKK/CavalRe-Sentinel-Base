import { describe, it, expect } from "vitest";
import { computeEdgeBps } from "../src/edge.js";

describe("computeEdgeBps", () => {
  it("positive when we owe less than ref cost", () => {
    // ref 1000, resolved 990 → 100 bps favorable
    const r = computeEdgeBps({ resolvedOutput: 990n, refOutput: 1000n });
    expect(r.undefined).toBe(false);
    expect(r.edgeBps).toBe(100);
  });

  it("negative when we owe more than ref", () => {
    const r = computeEdgeBps({ resolvedOutput: 1010n, refOutput: 1000n });
    expect(r.edgeBps).toBe(-100);
  });

  it("undefined when ref is zero", () => {
    const r = computeEdgeBps({ resolvedOutput: 100n, refOutput: 0n });
    expect(r.undefined).toBe(true);
    expect(r.edgeBps).toBe(0);
  });
});
