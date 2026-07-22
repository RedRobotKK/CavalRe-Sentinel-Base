import { describe, it, expect } from "vitest";
import { resolveOrderAmounts, canResolveV3 } from "../src/resolve.js";

describe("resolveOrderAmounts", () => {
  it("uses start amounts when no decay window (static)", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 100n,
        inputEnd: 200n,
        outputStart: 1000n,
        outputEnd: 500n,
        decayStartTime: null,
        decayEndTime: null,
      },
      50
    );
    expect(r.input).toBe(100n);
    expect(r.output).toBe(1000n);
    expect(r.decayProgressBps).toBe(0);
    expect(r.path).toBe("static");
  });

  it("PASS V2: applies midpoint time decay", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 0n,
        inputEnd: 1000n,
        outputStart: 1000n,
        outputEnd: 0n,
        decayStartTime: 0,
        decayEndTime: 100,
      },
      50
    );
    expect(r.input).toBe(500n);
    expect(r.output).toBe(500n);
    expect(r.decayProgressBps).toBe(5000);
    expect(r.path).toBe("v2_time");
  });

  it("PASS V3: block curve preferred when currentBlock set", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 100n,
        inputEnd: 100n,
        outputStart: 100n,
        outputEnd: 50n,
        decayStartTime: 0,
        decayEndTime: 100,
        decayStartBlock: 1000,
        relativeBlocks: [4],
        relativeAmounts: [40n],
      },
      { nowSec: 50, currentBlock: 1002 }
    );
    // +2 of 4 blocks, drop 40 → drop 20 → 80
    expect(r.output).toBe(80n);
    expect(r.path).toBe("v3_block");
    expect(r.decayProgressBps).toBe(5000);
  });

  it("PASS V3 before decay: start amount", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 1n,
        inputEnd: 1n,
        outputStart: 100n,
        outputEnd: 60n,
        decayStartTime: null,
        decayEndTime: null,
        decayStartBlock: 1000,
        relativeBlocks: [4],
        relativeAmounts: [40n],
      },
      { nowSec: 0, currentBlock: 999 }
    );
    expect(r.output).toBe(100n);
    expect(r.path).toBe("v3_block");
    expect(r.decayProgressBps).toBe(0);
  });

  it("FALLBACK V2 when curve present but no currentBlock", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 0n,
        inputEnd: 1000n,
        outputStart: 1000n,
        outputEnd: 0n,
        decayStartTime: 0,
        decayEndTime: 100,
        decayStartBlock: 1000,
        relativeBlocks: [4],
        relativeAmounts: [40n],
      },
      { nowSec: 50 }
    );
    expect(r.path).toBe("v2_time");
    expect(r.output).toBe(500n);
  });

  it("canResolveV3 requires curve + block", () => {
    expect(
      canResolveV3(
        {
          inputStart: 1n,
          inputEnd: 1n,
          outputStart: 1n,
          outputEnd: 1n,
          decayStartTime: null,
          decayEndTime: null,
          decayStartBlock: 10,
          relativeBlocks: [4],
          relativeAmounts: [1n],
        },
        12
      )
    ).toBe(true);
    expect(
      canResolveV3(
        {
          inputStart: 1n,
          inputEnd: 1n,
          outputStart: 1n,
          outputEnd: 1n,
          decayStartTime: null,
          decayEndTime: null,
          decayStartBlock: 10,
          relativeBlocks: [4],
          relativeAmounts: [1n],
        },
        undefined
      )
    ).toBe(false);
  });
});
