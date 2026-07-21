import {
  type Amount,
  amountToString,
  amountFromString,
} from "@cavalre/core";
import type {
  DecisionKind,
  DecisionRecord,
  DecisionRecordWire,
} from "./types.js";

export interface AppendInput {
  kind: DecisionKind;
  reason?: string;
  ref?: string;
  amount?: Amount;
  amount2?: Amount;
  context?: Record<string, string | boolean | null>;
}

/**
 * In-memory append-only DecisionJournal.
 *
 * Design rules:
 * - Append only. No mutation or deletion of past records.
 * - All money fields are Amount (bigint).
 * - Serialization uses decimal strings so precision is never lost.
 * - seq is assigned by the journal (monotonic).
 */
export class DecisionJournal {
  private readonly records: DecisionRecord[] = [];
  private nextSeq = 1;

  append(input: AppendInput): DecisionRecord {
    const record: DecisionRecord = {
      seq: this.nextSeq++,
      ts: new Date().toISOString(),
      version: 1,
      kind: input.kind,
      reason: input.reason,
      ref: input.ref,
      amount: input.amount,
      amount2: input.amount2,
      context: input.context,
    };
    this.records.push(record);
    return record;
  }

  /** Return a snapshot of all records (newest last). */
  all(): readonly DecisionRecord[] {
    return this.records;
  }

  /** Number of records currently held. */
  size(): number {
    return this.records.length;
  }

  /** Filter by kind. */
  byKind(kind: DecisionKind): DecisionRecord[] {
    return this.records.filter((r) => r.kind === kind);
  }

  /** Serialize the entire journal to JSONL (one DecisionRecordWire per line). */
  toJSONL(): string {
    return this.records.map((r) => JSON.stringify(toWire(r))).join("\n");
  }

  /** Parse a JSONL string back into records (does not clear existing). */
  loadJSONL(jsonl: string): void {
    const lines = jsonl.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const wire = JSON.parse(line) as DecisionRecordWire;
      const record = fromWire(wire);
      // Preserve original seq if loading historical data; advance nextSeq accordingly.
      if (record.seq >= this.nextSeq) {
        this.nextSeq = record.seq + 1;
      }
      this.records.push(record);
    }
  }
}

function toWire(r: DecisionRecord): DecisionRecordWire {
  return {
    seq: r.seq,
    ts: r.ts,
    version: r.version,
    kind: r.kind,
    reason: r.reason,
    ref: r.ref,
    amount: r.amount !== undefined ? amountToString(r.amount) : undefined,
    amount2: r.amount2 !== undefined ? amountToString(r.amount2) : undefined,
    context: r.context,
  };
}

function fromWire(w: DecisionRecordWire): DecisionRecord {
  return {
    seq: w.seq,
    ts: w.ts,
    version: w.version,
    kind: w.kind,
    reason: w.reason,
    ref: w.ref,
    amount: w.amount !== undefined ? amountFromString(w.amount) : undefined,
    amount2: w.amount2 !== undefined ? amountFromString(w.amount2) : undefined,
    context: w.context,
  };
}
