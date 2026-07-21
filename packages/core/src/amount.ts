/** Amount = bigint. Never use Number for money arithmetic. */

export type Amount = bigint;

/**
 * Coerce UniswapX / JSON wire values into a pure digit string.
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
    return BigInt(Math.trunc(value)).toString();
  }

  let trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("Empty amount string");

  // quoted nested
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  if (/^\d+$/.test(trimmed)) return trimmed;
  if (/^\d+\.0+$/.test(trimmed)) return trimmed.split(".")[0]!;
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed).toString();

  // scientific: 1.23e+18 or 1e18
  const sci = trimmed.match(/^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/);
  if (sci) {
    const whole = sci[1]!;
    const frac = sci[2] ?? "";
    const exp = Number(sci[3]);
    if (!Number.isFinite(exp) || exp > 78) {
      throw new Error(`Invalid amount string: ${value}`);
    }
    const digits = whole + frac;
    const zeros = exp - frac.length;
    if (zeros >= 0) return digits + "0".repeat(zeros);
    const cut = digits.length + zeros;
    if (cut <= 0) return "0";
    return digits.slice(0, cut);
  }

  throw new Error(`Invalid amount string: ${value}`);
}

export function toAmount(value: string | number | bigint): Amount {
  return BigInt(coerceAmountInput(value));
}

export function add(a: Amount, b: Amount): Amount {
  return a + b;
}

export function sub(a: Amount, b: Amount): Amount {
  if (b > a) throw new Error("Insufficient amount for subtraction");
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
