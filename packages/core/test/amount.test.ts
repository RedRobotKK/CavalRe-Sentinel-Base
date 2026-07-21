import { describe, it, expect } from "vitest";
import {
  toAmount,
  add,
  sub,
  isGT,
  isGTE,
  ZERO,
  amountToString,
  amountFromString,
  coerceAmountInput,
} from "../src/amount.js";

describe("Amount (core money primitive)", () => {
  describe("toAmount", () => {
    it("accepts a valid integer string", () => {
      expect(toAmount("123")).toBe(123n);
    });
    it("accepts a bigint", () => {
      expect(toAmount(99n)).toBe(99n);
    });
    it("accepts a JSON number (live API)", () => {
      expect(toAmount(1000000)).toBe(1000000n);
    });
    it("accepts hex string", () => {
      expect(toAmount("0xff")).toBe(255n);
    });
    it("accepts trailing .0 strings", () => {
      expect(toAmount("42.0")).toBe(42n);
    });
    it("rejects negative bigint", () => {
      expect(() => toAmount(-1n)).toThrow(/negative/);
    });
    it("rejects non-integer string", () => {
      expect(() => toAmount("12.5")).toThrow();
    });
    it("trims whitespace on strings", () => {
      expect(toAmount("  7  ")).toBe(7n);
    });
  });

  describe("coerceAmountInput", () => {
    it("maps number to digits", () => {
      expect(coerceAmountInput(1e6)).toBe("1000000");
    });
  });

  describe("add", () => {
    it("adds two positive amounts", () => {
      expect(add(1n, 2n)).toBe(3n);
    });
    it("handles zero", () => {
      expect(add(ZERO, 5n)).toBe(5n);
    });
  });

  describe("sub", () => {
    it("subtracts when sufficient", () => {
      expect(sub(5n, 3n)).toBe(2n);
    });
    it("throws on insufficient amount (fail-closed)", () => {
      expect(() => sub(1n, 2n)).toThrow(/Insufficient/);
    });
    it("allows subtracting to zero", () => {
      expect(sub(3n, 3n)).toBe(0n);
    });
  });

  describe("comparisons", () => {
    it("isGT works", () => {
      expect(isGT(2n, 1n)).toBe(true);
      expect(isGT(1n, 1n)).toBe(false);
    });
    it("isGTE works", () => {
      expect(isGTE(1n, 1n)).toBe(true);
    });
  });

  describe("ZERO", () => {
    it("is the zero amount", () => {
      expect(ZERO).toBe(0n);
    });
  });

  describe("serialization (journal safety)", () => {
    it("amountToString preserves full precision beyond MAX_SAFE_INTEGER", () => {
      const big = 10n ** 30n;
      expect(amountToString(big)).toBe("1000000000000000000000000000000");
    });
    it("amountFromString round-trips", () => {
      expect(amountFromString("999")).toBe(999n);
    });
  });
});
