/**
 * Minimal amount primitive for CavalRe-Sentinel-Base.
 *
 * Rules:
 * - All token amounts and USD notionals are represented as bigint (raw units or scaled).
 * - No JavaScript `number` is used for value-bearing quantities.
 * - This is the seed of the FloatLib discipline carried from CavalRe contracts.
 */

export type Amount = bigint;

/**
 * Create an Amount from a raw integer string or bigint.
 * Rejects negative values and non-integer inputs.
 */
export function toAmount(value: string | bigint): Amount {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error("Amount cannot be negative");
    }
    return value;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid amount string: ${value}`);
  }

  return BigInt(trimmed);
}

/**
 * Add two amounts. Overflow is left to native bigint behavior.
 */
export function add(a: Amount, b: Amount): Amount {
  return a + b;
}

/**
 * Subtract b from a. Throws if result would be negative (fail-closed for balances).
 */
export function sub(a: Amount, b: Amount): Amount {
  if (b > a) {
    throw new Error("Insufficient amount for subtraction");
  }
  return a - b;
}

/**
 * Returns true if a is strictly greater than b.
 */
export function isGT(a: Amount, b: Amount): boolean {
  return a > b;
}

/**
 * Returns true if a is greater than or equal to b.
 */
export function isGTE(a: Amount, b: Amount): boolean {
  return a >= b;
}

/**
 * Zero amount constant.
 */
export const ZERO: Amount = 0n;
