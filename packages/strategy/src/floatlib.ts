/**
 * Phase C — FloatLib-aligned fixed-point (TypeScript).
 *
 * TRUST:
 *   https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol
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

const DIGITS = FLOATLIB_SIGNIFICANT_DIGITS;
const MIN_MAG = FLOATLIB_NORMALIZED_MANTISSA_MIN;
const MAX_MAG = FLOATLIB_NORMALIZED_MANTISSA_MAX;
const SCALE = 10n ** BigInt(DIGITS);

export class FloatLibError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FloatLibError";
  }
}

function mag(m: bigint): bigint {
  return m < 0n ? -m : m;
}

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

export function toFloat(amount: Amount | bigint, decimals: number = 18): Float {
  if (amount < 0n) throw new FloatLibError("FloatNegativeValue");
  if (amount === 0n) return FLOAT_ZERO;
  return normalize(amount, -decimals);
}

export function toUInt(a: Float, decimals: number = 18): bigint {
  if (a.mantissa < 0n) throw new FloatLibError("FloatNegativeValue");
  if (a.mantissa === 0n) return 0n;

  const e = a.exponent + decimals;
  const m = a.mantissa;
  if (e >= 0) {
    return m * 10n ** BigInt(e);
  }
  return m / 10n ** BigInt(-e);
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
    return [na, shift(nb, delta)];
  }
  if (-delta > DIGITS) return [from(0n, nb.exponent), nb];
  return [shift(na, -delta), nb];
}

export function shift(a: Float, i: number): Float {
  if (i === 0 || a.mantissa === 0n) return a;
  let m = a.mantissa;
  const e = a.exponent + i;
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
 * Edge in bps. Integer result matches computeEdgeBps (bigint truncating div).
 * asFloat is the FloatLib-style ratio * 10000 for research.
 */
export function edgeBpsFloat(resolvedOutput: Amount, refOutput: Amount): {
  edgeBps: number;
  undefined: boolean;
  asFloat: Float;
} {
  if (refOutput === 0n) {
    return { edgeBps: 0, undefined: true, asFloat: FLOAT_ZERO };
  }

  // Production-parity integer bps (same as packages/strategy/src/edge.ts)
  const edgeBps = Number(((refOutput - resolvedOutput) * 10_000n) / refOutput);

  const ref = toFloat(refOutput, 0);
  const res = toFloat(resolvedOutput, 0);
  const asFloat = times(divide(minus(ref, res), ref), toFloat(10_000n, 0));

  return { edgeBps, undefined: false, asFloat };
}
