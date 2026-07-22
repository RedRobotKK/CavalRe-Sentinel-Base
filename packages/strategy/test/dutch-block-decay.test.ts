import { describe, it, expect } from "vitest";
import {
  decayAtBlock,
  getBlockDecayedAmount,
  getV3EndAmount,
  linearDecayBlocks,
  applyExclusivityOverride,
  blockDecayProgressBps,
  firstAffordableBlock,
  DutchBlockDecayError,
} from "../src/dutch-block-decay.js";

describe("Dutch V3 block decay", () => {
  it("returns start before decayStartBlock", () => {
    const amt = decayAtBlock(
      { relativeBlocks: [4], relativeAmounts: [40n] },
      100n,
      1000,
      999
    );
    expect(amt).toBe(100n);
  });

  it("matches SDK sample: start 100, relBlocks [4], relAmounts [40] at +4 → 60", () => {
    // SDK test: currentBlock = decayStart + 4 → full first point
    const amt = decayAtBlock(
      { relativeBlocks: [4], relativeAmounts: [40n] },
      100n,
      100,
      104
    );
    expect(amt).toBe(60n);
  });

  it("interpolates mid-segment: +2 of 4 blocks, drop 40 → drop 20 → 80", () => {
    const amt = decayAtBlock(
      { relativeBlocks: [4], relativeAmounts: [40n] },
      100n,
      100,
      102
    );
    expect(amt).toBe(80n);
  });

  it("piecewise: two points", () => {
    // at +5: between 4→40 and 10→70
    // lastAmount = 100-40=60, next=100-70=30
    // elapsed 1 / duration 6 → delta = 30*1/6 = 5 → 55
    const amt = decayAtBlock(
      { relativeBlocks: [4, 10], relativeAmounts: [40n, 70n] },
      100n,
      100,
      105
    );
    expect(amt).toBe(55n);
  });

  it("getV3EndAmount uses last relativeAmount", () => {
    expect(
      getV3EndAmount({ startAmount: 1000n, relativeAmounts: [100n, 250n] })
    ).toBe(750n);
  });

  it("linearDecayBlocks floors like mulDivDown", () => {
    // 100 → 90 over 3 blocks at +1: delta = 10*1/3 = 3 → 97
    expect(linearDecayBlocks(0, 3, 1, 100n, 90n)).toBe(97n);
  });

  it("rejects curves longer than 16", () => {
    expect(() =>
      decayAtBlock(
        {
          relativeBlocks: Array.from({ length: 17 }, (_, i) => i + 1),
          relativeAmounts: Array.from({ length: 17 }, () => 1n),
        },
        100n,
        0,
        5
      )
    ).toThrow(DutchBlockDecayError);
  });

  it("exclusivity override ceils obligation", () => {
    // 1000 * 10025 / 10000 = 1002.5 → ceil 1003
    expect(applyExclusivityOverride(1000n, 25)).toBe(1003n);
  });

  it("blockDecayProgressBps", () => {
    expect(blockDecayProgressBps([10], 100, 100)).toBe(0);
    expect(blockDecayProgressBps([10], 100, 105)).toBe(5000);
    expect(blockDecayProgressBps([10], 100, 110)).toBe(10_000);
  });

  it("firstAffordableBlock finds entry when curve decays into budget", () => {
    // start 100, drops 40 over 4 blocks → at +2 amount=80
    const block = firstAffordableBlock({
      startAmount: 100n,
      relativeBlocks: [4],
      relativeAmounts: [40n],
      decayStartBlock: 1000,
      maxAffordableOutput: 80n,
    });
    expect(block).toBe(1002);
  });

  it("firstAffordableBlock null when never affordable", () => {
    const block = firstAffordableBlock({
      startAmount: 100n,
      relativeBlocks: [4],
      relativeAmounts: [10n],
      decayStartBlock: 1000,
      maxAffordableOutput: 50n,
    });
    expect(block).toBeNull();
  });

  it("getBlockDecayedAmount wrapper", () => {
    expect(
      getBlockDecayedAmount(
        {
          decayStartBlock: 50,
          startAmount: 200n,
          relativeBlocks: [10],
          relativeAmounts: [50n],
        },
        55
      )
    ).toBe(175n);
  });
});
