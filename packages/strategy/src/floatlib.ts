/**
 * Phase C — FloatLib-aligned fixed-point (TypeScript).
 *
 * TRUST:
 *   https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol
 *
 * Subset: normalize, from components, toFloat/toUInt, plus/minus/times/divide,
 * edgeBps. Not a full port of exp/log/pow — those stay on-chain until needed.
 *
 * Representation: { mantissa: bigint (signed), exponent: number (base-10) }
 * Normalized |mantissa| in [10^20, 10^21 - 1] when non-zero (21 sig digits).
 */

import type { Amount } from "@cavalre/core";
import {
  FLOATLIB_SIGNIFICANT_DIGITS,
  FLOATLIB_NORMALIZED_MANTISSA_MIN,
  FLOATLIB_NORMALIZED_MANTISSA_MAX,
} from "./phase-a-spec.js";

export interface Float {
  readonly mantissa: bigint;
  readonly exponent: number;
}

export const FLOAT_ZERO: Float = Object.freeze({ mantissa: 0n, exponent: 0 });

const DIGITS = FLOATLIB_SIGNIFICANT_DIGITS; // 21
const MIN_MAG = FLOATLIB_NORMALIZED_MANTISSA_MIN; // 10n**20n
const MAX_MAG = FLOATLIB_NORMALIZED_MANTISSA_MAX; // 10n**21n - 1n
const SCALE = 10n ** BigInt(DIGITS); // 10^21 for times/divide intermediate

export class FloatLibError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FloatLibError";
  }
}

function mag(m: bigint): bigint {
  return m < 0n ? -m : m;
}

/** Normalize to 21 significant digits (FloatLib.normalize spirit). */
export function normalize(mantissa: bigint, exponent: number): Float {
  if (mantissa === 0n) return FLOAT_ZERO;

  let m = mantissa;
  let e = exponent;
  let abs = mag(m);

  while (abs > MAX_MAG) {
    m = m / 10n;
    e += 1;
    abs = mag(m);
  }
  while (abs < MIN_MAG) {
    m = m * 10n;
    e -= 1;
    abs = mag(m);
  }

  return { mantissa: m, exponent: e };
}

export function from(mantissa: bigint, exponent: number): Float {
  return normalize(mantissa, exponent);
}

/** uint token units at `decimals` → Float (FloatLib.toFloat). */
export function toFloat(amount: Amount | bigint, decimals: number = 18): Float {
  if (amount < 0n) throw new FloatLibError("FloatNegativeValue");
  if (amount === 0n) return FLOAT_ZERO;
  return normalize(amount, -decimals);
}

/** Float → uint token units (trunc toward zero). Reverts if negative. */
export function toUInt(a: Float, decimals: number = 18): bigint {
  if (a.mantissa < 0n) throw new FloatLibError("FloatNegativeValue");
  if (a.mantissa === 0n) return 0n;

  let e = a.exponent + decimals;
  let m = a.mantissa;
  if (e >= 0) {
    return m * 10n ** BigInt(e);
  }
  const div = 10n ** BigInt(-e);
  return m / div;
}

export function isZero(a: Float): boolean {
  return a.mantissa === 0n;
}

export function isEQ(a: Float, b: Float): boolean {
  const [x, y] = align(a, b);
  return x.mantissa === y.mantissa;
}

export function isGT(a: Float, b: Float): boolean {
  const [x, y] = align(a, b);
  return x.mantissa > y.mantissa;
}

/** Align exponents for add/sub (shift smaller toward larger). */
export function align(a: Float, b: Float): [Float, Float] {
  if (isZero(a) && isZero(b)) return [FLOAT_ZERO, FLOAT_ZERO];
  if (isZero(a)) return [from(0n, b.exponent), normalize(b.mantissa, b.exponent)];
  if (isZero(b)) return [normalize(a.mantissa, a.exponent), from(0n, a.exponent)];

  const na = normalize(a.mantissa, a.exponent);
  const nb = normalize(b.mantissa, b.exponent);
  const delta = na.exponent - nb.exponent;

  if (delta === 0) return [na, nb];
  if (delta > 0) {
    if (delta > DIGITS) return [na, from(0n, na.exponent)];
    // shift b up in exponent space by reducing mantissa
    return [na, shift(nb, delta)];
  }
  if (-delta > DIGITS) return [from(0n, nb.exponent), nb];
  return [shift(na, -delta), nb];
}

/** shift by i: increase exponent by i, divide mantissa by 10^i (FloatLib.shift spirit). */
export function shift(a: Float, i: number): Float {
  if (i === 0 || a.mantissa === 0n) return a;
  let m = a.mantissa;
  let e = a.exponent + i;
  if (i > 0) {
    m = m / 10n ** BigInt(i);
  } else {
    m = m * 10n ** BigInt(-i);
  }
  return from(m, e);
}

export function plus(a: Float, b: Float): Float {
  const [x, y] = align(a, b);
  return normalize(x.mantissa + y.mantissa, x.exponent);
}

export function minus(a: Float, b: Float): Float {
  const [x, y] = align(a, b);
  return normalize(x.mantissa - y.mantissa, x.exponent);
}

export function times(a: Float, b: Float): Float {
  if (isZero(a) || isZero(b)) return FLOAT_ZERO;
  const na = normalize(a.mantissa, a.exponent);
  const nb = normalize(b.mantissa, b.exponent);
  // (ma * mb) / 10^DIGITS , exp = DIGITS + ea + eb — matches FloatLib.times spirit
  const m = (na.mantissa * nb.mantissa) / SCALE;
  const e = DIGITS + na.exponent + nb.exponent;
  return normalize(m, e);
}

export function divide(a: Float, b: Float): Float {
  if (isZero(b)) throw new FloatLibError("division_by_zero");
  if (isZero(a)) return FLOAT_ZERO;
  const na = normalize(a.mantissa, a.exponent);
  const nb = normalize(b.mantissa, b.exponent);
  const m = (na.mantissa * SCALE) / nb.mantissa;
  const e = na.exponent - nb.exponent - DIGITS;
  return normalize(m, e);
}

/**
 * Edge in bps using FloatLib-style divide:
 *   (ref - resolved) / ref * 10_000
 * Returns truncated integer bps (toward zero) for policy thresholds.
 */
export function edgeBpsFloat(resolvedOutput: Amount, refOutput: Amount): {
  edgeBps: number;
  undefined: boolean;
  asFloat: Float;
} {
  if (refOutput === 0n) {
    return { edgeBps: 0, undefined: true, asFloat: FLOAT_ZERO };
  }
  const ref = toFloat(refOutput, 0); // already raw units — treat as dimensionless integer scale
  const res = toFloat(resolvedOutput, 0);
  const diff = minus(ref, res);
  const ratio = divide(diff, ref);
  const bpsFloat = times(ratio, toFloat(10_000n, 0));
  // integer bps: toUInt at decimals 0 truncates
  let edgeBps: number;
  try {
    const u = toUInt(bpsFloat, 0);
    edgeBps = Number(u);
    // handle negative edge
    if (bpsFloat.mantissa < 0n) edgeBps = -Number(toUInt(from(-bpsFloat.mantissa, bpsFloat.exponent), 0));
  } catch {
    // negative path
    if (bpsFloat.mantissa < 0n) {
      const abs = from(-bpsFloat.mantissa, bpsFloat.exponent);
      edgeBps = -Number(toUInt(abs, 0));
    } else {
      edgeBps = 0;
    }
  }
  return { edgeBps, undefined: false, asFloat: bpsFloat };
}
