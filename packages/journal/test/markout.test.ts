import { describe, it, expect } from "vitest";
import { toAmount } from "@cavalre/core";
import { computeMarkoutBps, makeMarkoutAnnotation } from "../src/markout.js";
import { DecisionJournal } from "../src/journal.js";

describe("computeMarkoutBps", () => {
  it("returns 0 when prices are equal", () => {
    const p = toAmount("1000000");
    expect(computeMarkoutBps(p, p)).toBe("0");
  });

  it("returns positive bps when mark > fill (favorable)", () => {
    // fill 100, mark 101 → +100 bps
    const fill = toAmount("100");
    const mark = toAmount("101");
    expect(computeMarkoutBps(fill, mark)).toBe("100");
  });

  it("returns negative bps when mark < fill (adverse)", () => {
    // fill 100, mark 97 → -300 bps
    const fill = toAmount("100");
    const mark = toAmount("97");
    expect(computeMarkoutBps(fill, mark)).toBe("-300");
  });

  it("handles zero fill price safely", () => {
    expect(computeMarkoutBps(0n, toAmount("100"))).toBe("0");
  });
});

describe("makeMarkoutAnnotation", () => {
  it("flags toxic when adverse beyond threshold", () => {
    const ann = makeMarkoutAnnotation({
      fillPrice: toAmount("100"),
      markPrice: toAmount("96"), // -400 bps
      windowSec: 60,
      toxicThresholdBps: 30,
    });
    expect(ann.toxic).toBe(true);
    expect(ann.markoutBps).toBe("-400");
    expect(ann.windowSec).toBe(60);
  });

  it("does not flag toxic for mild adverse move", () => {
    const ann = makeMarkoutAnnotation({
      fillPrice: toAmount("10000"),
      markPrice: toAmount("9980"), // -20 bps
      windowSec: 30,
      toxicThresholdBps: 30,
    });
    expect(ann.toxic).toBe(false);
    expect(ann.markoutBps).toBe("-20");
  });
});

describe("journal + markout integration", () => {
  it("stores markout on a markout decision and round-trips JSONL", () => {
    const journal = new DecisionJournal();
    const ann = makeMarkoutAnnotation({
      fillPrice: toAmount("1000000"),
      markPrice: toAmount("995000"),
      windowSec: 120,
    });

    journal.append({
      kind: "markout",
      ref: "0xorder1",
      amount: toAmount("1000000"),
      markout: ann,
      reason: "2m_markout",
    });

    const jsonl = journal.toJSONL();
    const restored = new DecisionJournal();
    restored.loadJSONL(jsonl);

    const rec = restored.all()[0];
    expect(rec.kind).toBe("markout");
    expect(rec.markout?.markoutBps).toBe(ann.markoutBps);
    expect(rec.markout?.toxic).toBe(ann.toxic);
    expect(rec.markout?.windowSec).toBe(120);
  });
});
