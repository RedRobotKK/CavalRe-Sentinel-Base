import { describe, it, expect, beforeEach } from "vitest";
import { toAmount, amountToString } from "@cavalre/core";
import { DecisionJournal } from "../src/journal.js";

describe("DecisionJournal", () => {
  let journal: DecisionJournal;

  beforeEach(() => {
    journal = new DecisionJournal();
  });

  it("starts empty", () => {
    expect(journal.size()).toBe(0);
    expect(journal.all()).toEqual([]);
  });

  it("appends a quote_rejected decision with Amount", () => {
    const amount = toAmount("50000000"); // $50
    const record = journal.append({
      kind: "quote_rejected",
      reason: "exceeds_max_position_size",
      ref: "0xabc",
      amount,
    });

    expect(record.seq).toBe(1);
    expect(record.kind).toBe("quote_rejected");
    expect(record.amount).toBe(amount);
    expect(typeof record.amount).toBe("bigint");
    expect(journal.size()).toBe(1);
  });

  it("assigns monotonic sequence numbers", () => {
    journal.append({ kind: "info", reason: "start" });
    journal.append({ kind: "quote_accepted", amount: toAmount("1000000") });
    journal.append({ kind: "fill", amount: toAmount("1000000") });

    const seqs = journal.all().map((r) => r.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it("filters by kind", () => {
    journal.append({ kind: "quote_rejected", reason: "no_price" });
    journal.append({ kind: "fill", amount: toAmount("2000000") });
    journal.append({ kind: "quote_rejected", reason: "stale" });

    const rejected = journal.byKind("quote_rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.kind === "quote_rejected")).toBe(true);
  });

  it("serializes Amounts as decimal strings (never number)", () => {
    const big = toAmount("9007199254740993"); // beyond MAX_SAFE_INTEGER
    journal.append({
      kind: "fill",
      amount: big,
      amount2: toAmount("42"),
    });

    const jsonl = journal.toJSONL();
    const parsed = JSON.parse(jsonl);

    // Must be strings in the wire format
    expect(typeof parsed.amount).toBe("string");
    expect(parsed.amount).toBe("9007199254740993");
    expect(parsed.amount2).toBe("42");

    // Prove we did not go through Number
    expect(Number(parsed.amount)).not.toBe(9007199254740993);
  });

  it("round-trips through JSONL preserving Amount precision", () => {
    const originalAmount = toAmount("123456789012345678901234567890");
    journal.append({
      kind: "markout",
      amount: originalAmount,
      reason: "5m_markout",
      ref: "order-1",
    });

    const jsonl = journal.toJSONL();

    const restored = new DecisionJournal();
    restored.loadJSONL(jsonl);

    expect(restored.size()).toBe(1);
    const rec = restored.all()[0];
    expect(rec.amount).toBe(originalAmount);
    expect(typeof rec.amount).toBe("bigint");
    expect(amountToString(rec.amount!)).toBe(
      "123456789012345678901234567890"
    );
  });

  it("preserves context as strings/booleans only", () => {
    journal.append({
      kind: "info",
      context: {
        pair: "USDC-WETH",
        dryRun: true,
        note: null,
      },
    });

    const rec = journal.all()[0];
    expect(rec.context).toEqual({
      pair: "USDC-WETH",
      dryRun: true,
      note: null,
    });
  });

  it("is append-only (all() returns a snapshot)", () => {
    journal.append({ kind: "info", reason: "a" });
    const snapshot = journal.all();
    journal.append({ kind: "info", reason: "b" });
    // snapshot must not have grown
    expect(snapshot).toHaveLength(1);
    expect(journal.size()).toBe(2);
  });
});
