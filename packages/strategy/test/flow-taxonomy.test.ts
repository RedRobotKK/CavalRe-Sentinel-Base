import { describe, it, expect } from "vitest";
import { summarizeFlow } from "../src/flow-taxonomy.js";

/** Minimal journal-shaped rows (only fields taxonomy reads). */
function row(
  partial: Record<string, unknown> & { kind: string; reason?: string }
) {
  return {
    ts: "2026-07-22T16:00:00.000Z",
    ref: null as string | null,
    context: {} as Record<string, unknown>,
    ...partial,
  };
}

describe("summarizeFlow (TDD)", () => {
  it("returns zeros on empty journal", () => {
    const s = summarizeFlow([]);
    expect(s.n).toBe(0);
    expect(s.decisions).toBe(0);
    expect(s.byClass).toEqual({});
    expect(s.exclusiveRateBps).toBeNull();
    expect(s.uniqueAcceptRefs).toBe(0);
    expect(s.edgeSample.n).toBe(0);
  });

  it("ignores heartbeats for decision counts", () => {
    const s = summarizeFlow([
      row({
        kind: "info",
        reason: "cycle_heartbeat",
        context: { raw: "1" },
      }),
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        ref: "0xaaa",
        context: { orderClass: "exclusive", policyAction: "reject" },
      }),
    ]);
    expect(s.n).toBe(2);
    expect(s.decisions).toBe(1);
    expect(s.heartbeats).toBe(1);
    expect(s.byClass.exclusive).toBe(1);
  });

  it("computes exclusive rate among classified decisions", () => {
    const s = summarizeFlow([
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: { orderClass: "exclusive" },
      }),
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: { orderClass: "exclusive" },
      }),
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0xgood",
        context: {
          orderClass: "dutch",
          policyAction: "accept",
          edgeBps: "50",
        },
      }),
    ]);
    // 2/3 exclusive → 6667 bps
    expect(s.exclusiveRateBps).toBe(6667);
    expect(s.byClass.dutch).toBe(1);
    expect(s.byClass.exclusive).toBe(2);
  });

  it("counts unique accept refs only once", () => {
    const s = summarizeFlow([
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0xabc",
        context: { orderClass: "dutch", policyAction: "accept", edgeBps: "10" },
      }),
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0xabc",
        context: { orderClass: "dutch", policyAction: "accept", edgeBps: "12" },
      }),
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0xdef",
        context: { orderClass: "dutch", policyAction: "accept", edgeBps: "20" },
      }),
    ]);
    expect(s.accepts).toBe(3);
    expect(s.uniqueAcceptRefs).toBe(2);
  });

  it("aggregates edge sample only when edgeBps is finite", () => {
    const s = summarizeFlow([
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0x1",
        context: { orderClass: "dutch", edgeBps: "100" },
      }),
      row({
        kind: "quote_rejected",
        reason: "edge_negative",
        ref: "0x2",
        context: { orderClass: "dutch", edgeBps: "-50" },
      }),
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: { orderClass: "exclusive", edgeBps: null },
      }),
    ]);
    expect(s.edgeSample.n).toBe(2);
    expect(s.edgeSample.meanBps).toBe(25); // (100-50)/2
    expect(s.edgeSample.minBps).toBe(-50);
    expect(s.edgeSample.maxBps).toBe(100);
  });

  it("buckets pairs as input→output", () => {
    const s = summarizeFlow([
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: {
          orderClass: "exclusive",
          inputToken: "0xWETH",
          outputToken: "0xUSDC",
        },
      }),
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0x1",
        context: {
          orderClass: "dutch",
          inputToken: "0xWETH",
          outputToken: "0xUSDC",
          edgeBps: "5",
        },
      }),
    ]);
    expect(s.byPair["0xWETH→0xUSDC"]).toBe(2);
  });

  it("ranks top reject reasons", () => {
    const s = summarizeFlow([
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: { orderClass: "exclusive" },
      }),
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: { orderClass: "exclusive" },
      }),
      row({
        kind: "quote_rejected",
        reason: "edge_negative",
        context: { orderClass: "dutch", edgeBps: "-10" },
      }),
    ]);
    expect(s.topReasons[0]).toEqual({
      reason: "class_not_tradable:exclusive",
      n: 2,
    });
    expect(s.topReasons[1]).toEqual({ reason: "edge_negative", n: 1 });
  });

  it("splits public dutch vs exclusive vs other", () => {
    const s = summarizeFlow([
      row({
        kind: "quote_accepted",
        reason: "edge_ok",
        ref: "0x1",
        context: { orderClass: "dutch" },
      }),
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:exclusive",
        context: { orderClass: "exclusive" },
      }),
      row({
        kind: "quote_rejected",
        reason: "class_not_tradable:priority",
        context: { orderClass: "priority" },
      }),
    ]);
    expect(s.flowMix.publicDutch).toBe(1);
    expect(s.flowMix.exclusive).toBe(1);
    expect(s.flowMix.other).toBe(1);
  });
});
