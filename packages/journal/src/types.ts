import type { Amount } from "@cavalre/core";

/**
 * Decision kinds the journal understands.
 * Keep this closed and explicit — every new kind requires a test.
 */
export type DecisionKind =
  | "quote_accepted"
  | "quote_rejected"
  | "fill"
  | "halt"
  | "markout"
  | "info";

/**
 * Optional markout / toxicity annotation.
 * All monetary values remain Amount (bigint) at runtime.
 */
export interface MarkoutAnnotation {
  /** Markout in basis points (can be negative). Stored as string on the wire. */
  markoutBps: string;
  /** Observation window in seconds. */
  windowSec: number;
  /** True if markout is considered toxic (policy-defined threshold). */
  toxic: boolean;
}

/**
 * A single decision record.
 *
 * Rules:
 * - All monetary values are Amount (bigint) at runtime.
 * - When serialized to JSONL they become decimal strings via amountToString.
 * - No JavaScript number is ever stored for value-bearing fields.
 */
export interface DecisionRecord {
  /** Monotonic sequence number assigned by the journal */
  seq: number;
  /** ISO-8601 timestamp (string, not Date object, for stable serialization) */
  ts: string;
  /** Schema version for forward compatibility */
  version: 1;
  kind: DecisionKind;
  /** Human / machine readable reason or note */
  reason?: string;
  /** Optional correlation id (orderHash, quoteId, etc.) */
  ref?: string;
  /** Optional notional or size (Amount) */
  amount?: Amount;
  /** Optional secondary amount (e.g. realized edge, markout absolute) */
  amount2?: Amount;
  /** Markout / toxicity annotation when kind === "markout" or attached to fills */
  markout?: MarkoutAnnotation;
  /** Free-form but JSON-serializable context. Must not contain raw numbers for money. */
  context?: Record<string, string | boolean | null>;
}

/**
 * Wire format of a DecisionRecord (what lands in JSONL).
 * Amounts are decimal strings.
 */
export interface DecisionRecordWire {
  seq: number;
  ts: string;
  version: 1;
  kind: DecisionKind;
  reason?: string;
  ref?: string;
  amount?: string;
  amount2?: string;
  markout?: MarkoutAnnotation;
  context?: Record<string, string | boolean | null>;
}
