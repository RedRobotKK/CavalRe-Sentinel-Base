import { describe, it, expect } from "vitest";
import { toAmount } from "@cavalre/core";
import {
  linearDecay,
  decayAmount,
  decayOutput,
  decayInput,
  decayProgressBps,
  DutchDecayError,
} from "../src/dutch-decay.js";

describe("linearDecay", () => {
  it("returns start before window", () => {
    expect(
      linearDecay(100, 200, 50, toAmount("1000"), toAmount("500"))
    ).toBe(1000n);
  });

  it("returns end after window", () => {
    expect(
      linearDecay(100, 200, 250, toAmount("1000"), toAmount("500"))
    ).toBe(500n);
  });

  it("midpoint for decreasing output", () => {
    // 1000 → 500 over 100s, at +50s → 750
    expect(
      linearDecay(0, 100, 50, toAmount("1000"), toAmount("500"))
    ).toBe(750n);
  });

  it("midpoint for increasing input", () => {
    expect(
      linearDecay(0, 100, 50, toAmount("500"), toAmount("1000"))
    ).toBe(750n);
  });

  it("throws if endTime <= startTime", () => {
    expect(() =>
      linearDecay(100, 100, 100, 1n, 1n)
    ).toThrow(DutchDecayError);
  });
});

describe("decayOutput", () => {
  it("rejects start < end", () => {
    expect(() =>
      decayOutput(100n, 200n, 0, 100, 50)
    ).toThrow("IncorrectAmounts");
  });

  it("decays downward", () => {
    const v = decayOutput(1000n, 0n, 0, 100, 25);
    expect(v).toBe(750n);
  });
});

describe("decayInput", () => {
  it("rejects start > end", () => {
    expect(() =>
      decayInput(200n, 100n, 0, 100, 50)
    ).toThrow("IncorrectAmounts");
  });

  it("decays upward", () => {
    const v = decayInput(0n, 1000n, 0, 100, 25);
    expect(v).toBe(250n);
  });
});

describe("decayAmount", () => {
  it("constant when start == end", () => {
    expect(decayAmount(42n, 42n, 0, 100, 50)).toBe(42n);
  });
});

describe("decayProgressBps", () => {
  it("0 before start", () => {
    expect(decayProgressBps(100, 200, 50)).toBe(0);
  });
  it("10000 after end", () => {
    expect(decayProgressBps(100, 200, 300)).toBe(10000);
  });
  it("5000 at midpoint", () => {
    expect(decayProgressBps(0, 100, 50)).toBe(5000);
  });
});
