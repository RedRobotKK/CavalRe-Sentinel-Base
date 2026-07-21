/**
 * Amount primitive — FloatLib discipline off-chain.
 * bigint only for value; never JS number in arithmetic.
 */

export type Amount = bigint;

/**
 * Coerce wire values from UniswapX API / JSON into a digit string.
 * Live API sometimes emits amounts as JSON numbers (safe for small sizes)
 * or as decimal strings. Reject fractions and negatives.
 */
export function coerceAmountInput(value: string | number | bigint): string {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error("Amount cannot be negative");
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid amount number: ${value}`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(`Amount number must be integer: ${value}`);
    }
    // Prefer exact digit form; avoid scientific notation from String(n)
    return BigInt(Math.trunc(value)).toString();
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Empty amount string");
  }
  // pure digits
  if (/^\d+$/.test(trimmed)) return trimmed;
  // "123.0" / "123.000" from some serializers
  if (/^\d+\.0+$/.test(trimmed)) return trimmed.split(".")[0]!;
  // hex 0x...
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return BigInt(trimmed).toString();
  }
  throw new Error(`Invalid amount string: ${value}`);
}

export function toAmount(value: string | number | bigint): Amount {
  const digits = coerceAmountInput(value);
  return BigInt(digits);
}

export function add(a: Amount, b: Amount): Amount {
  return a + b;
}

export function sub(a: Amount, b: Amount): Amount {
  if (b > a) {
    throw new Error("Insufficient amount for subtraction");
  }
  return a - b;
}

export function isGT(a: Amount, b: Amount): boolean {
  return a > b;
}

export function isGTE(a: Amount, b: Amount): boolean {
  return a >= b;
}

export const ZERO: Amount = 0n;

export function amountToString(a: Amount): string {
  return a.toString();
}

export function amountFromString(s: string): Amount {
  return toAmount(s);
}
