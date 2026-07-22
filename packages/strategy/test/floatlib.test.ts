import { describe, it, expect } from "vitest";
import {
  normalize,
  toFloat,
  toUInt,
  plus,
  minus,
  times,
  divide,
  isEQ,
  isGT,
  isZero,
  edgeBpsFloat,
  FLOAT_ZERO,
  FloatLibError,
} from "../src/floatlib.js";
import { computeEdgeBps } from "../src/edge.js";
import {
  FLOATLIB_SIGNIFICANT_DIGITS,
  FLOATLIB_NORMALIZED_MANTISSA_MIN,
} from "../src/phase-a-spec.js";

describe("FloatLib TS — normalize", () => {
  it("zero stays zero", () => {
    expect(isZero(normalize(0n, 5))).toBe(true);
  });

  it("scales small mantissa up to 21 digits", () => {
    const f = normalize(1n, 0);
    expect(f.mantissa).toBe(FLOATLIB_NORMALIZED_MANTISSA_MIN);
    expect(f.exponent).toBe(-(FLOATLIB_SIGNIFICANT_DIGITS - 1));
  });
});

describe("FloatLib TS — toFloat / toUInt roundtrip", () => {
  it("roundtrips small USDC-scale amount", () => {
    const raw = 1_000_000n; // 1 USDC @ 6dp
    const f = toFloat(raw, 6);
    expect(toUInt(f, 6)).toBe(raw);
  });

  it("roundtrips 1e18 wei", () => {
    const raw = 1_000000000000000000n;
    const f = toFloat(raw, 18);
    expect(toUInt(f, 18)).toBe(raw);
  });

  it("rejects negative toFloat", () => {
    expect(() => toFloat(-1n, 18)).toThrow(FloatLibError);
  });
});

describe("FloatLib TS — arithmetic", () => {
  it("plus 1+1 = 2", () => {
    const a = toFloat(1n, 0);
    const b = toFloat(1n, 0);
    expect(toUInt(plus(a, b), 0)).toBe(2n);
  });

  it("minus 5-3 = 2", () => {
    expect(toUInt(minus(toFloat(5n, 0), toFloat(3n, 0)), 0)).toBe(2n);
  });

  it("times 2*3 = 6", () => {
    expect(toUInt(times(toFloat(2n, 0), toFloat(3n, 0)), 0)).toBe(6n);
  });

  it("divide 10/4 truncates toward zero in toUInt", () => {
    const q = divide(toFloat(10n, 0), toFloat(4n, 0));
    // 2.5 → toUInt decimals 0 → 2
    expect(toUInt(q, 0)).toBe(2n);
  });

  it("isGT works across scales", () => {
    expect(isGT(toFloat(2n, 0), toFloat(1n, 0))).toBe(true);
    expect(isEQ(toFloat(1n, 0), toFloat(1n, 0))).toBe(true);
  });
});

describe("FloatLib TS — edgeBps vs bigint path", () => {
  it("matches computeEdgeBps on classic 1000/990 sample", () => {
    const bi = computeEdgeBps({ resolvedOutput: 990n, refOutput: 1000n });
    const fl = edgeBpsFloat(990n, 1000n);
    expect(fl.undefined).toBe(false);
    expect(fl.edgeBps).toBe(bi.edgeBps);
    expect(bi.edgeBps).toBe(100);
  });

  it("undefined on zero ref", () => {
    const fl = edgeBpsFloat(100n, 0n);
    expect(fl.undefined).toBe(true);
    expect(fl.asFloat).toEqual(FLOAT_ZERO);
  });

  it("negative edge when resolved > ref", () => {
    const fl = edgeBpsFloat(1100n, 1000n);
    expect(fl.edgeBps).toBeLessThan(0);
    const bi = computeEdgeBps({ resolvedOutput: 1100n, refOutput: 1000n });
    expect(fl.edgeBps).toBe(bi.edgeBps);
  });

  it("ETH-scale mid amounts stay finite", () => {
    const resolved = 19_000000000000000n;
    const ref = 22_000000000000000n;
    const fl = edgeBpsFloat(resolved, ref);
    const bi = computeEdgeBps({ resolvedOutput: resolved, refOutput: ref });
    expect(fl.undefined).toBe(false);
    // allow 1 bps tolerance on huge integers after float path truncation
    expect(Math.abs(fl.edgeBps - bi.edgeBps)).toBeLessThanOrEqual(1);
  });
});
