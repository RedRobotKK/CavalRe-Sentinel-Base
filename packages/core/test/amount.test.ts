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
} from "../src/amount.js";

describe("Amount (core money primitive)", () => {
  describe("toAmount", () => {
    it("accepts a valid integer string", () => {
      const a = toAmount("1000000");
      expect(a).toBe(1000000n);
    });

    it("accepts a bigint", () => {
      const a = toAmount(500n);
      expect(a).toBe(500n);
    });

    it("rejects negative bigint", () => {
      expect(() => toAmount(-1n)).toThrow("Amount cannot be negative");
    });

    it("rejects non-integer string", () => {
      expect(() => toAmount("12.34")).toThrow("Invalid amount string");
      expect(() => toAmount("-5")).toThrow("Invalid amount string");
      expect(() => toAmount("abc")).toThrow("Invalid amount string");
      expect(() => toAmount("")).toThrow("Invalid amount string");
    });

    it("trims whitespace on strings", () => {
      expect(toAmount("  42  ")).toBe(42n);
    });
  });

  describe("add", () => {
    it("adds two positive amounts", () => {
      const result = add(toAmount("100"), toAmount("50"));
      expect(result).toBe(150n);
    });

    it("handles zero", () => {
      expect(add(ZERO, toAmount("10"))).toBe(10n);
      expect(add(toAmount("10"), ZERO)).toBe(10n);
    });
  });

  describe("sub", () => {
    it("subtracts when sufficient", () => {
      expect(sub(toAmount("100"), toAmount("40"))).toBe(60n);
    });

    it("throws on insufficient amount (fail-closed)", () => {
      expect(() => sub(toAmount("10"), toAmount("11"))).toThrow(
        "Insufficient amount for subtraction"
      );
    });

    it("allows subtracting to zero", () => {
      expect(sub(toAmount("10"), toAmount("10"))).toBe(0n);
    });
  });

  describe("comparisons", () => {
    it("isGT works", () => {
      expect(isGT(toAmount("10"), toAmount("5"))).toBe(true);
      expect(isGT(toAmount("5"), toAmount("10"))).toBe(false);
      expect(isGT(toAmount("5"), toAmount("5"))).toBe(false);
    });

    it("isGTE works", () => {
      expect(isGTE(toAmount("10"), toAmount("5"))).toBe(true);
      expect(isGTE(toAmount("5"), toAmount("5"))).toBe(true);
      expect(isGTE(toAmount("4"), toAmount("5"))).toBe(false);
    });
  });

  describe("ZERO", () => {
    it("is the zero amount", () => {
      expect(ZERO).toBe(0n);
    });
  });

  describe("serialization (journal safety)", () => {
    it("amountToString preserves full precision", () => {
      const big = toAmount("9007199254740993"); // > Number.MAX_SAFE_INTEGER
      expect(amountToString(big)).toBe("9007199254740993");
      // Prove Number would have lost precision
      expect(Number(big.toString())).not.toBe(9007199254740993);
    });

    it("amountFromString round-trips", () => {
      const original = toAmount("12345678901234567890");
      const restored = amountFromString(amountToString(original));
      expect(restored).toBe(original);
    });
  });
});
