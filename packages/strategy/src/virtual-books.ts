/**
 * Phase B — Virtual books (off-chain Ledger mirror).
 *
 * TRUST: https://github.com/CavalRe/cavalre-contracts/tree/main/modules/ledger
 *
 * Not on-chain. Models External-root inventory sleeves so accepts can be
 * posted as balanced credit/debit pairs before Phase D deploys real Ledger.
 */

import type { Amount } from "@cavalre/core";
import {
  PHASE_A_EXTERNAL_ROOTS,
  mapLedgerErrorToPolicyReason,
  type LedgerTokenKind,
} from "./phase-a-spec.js";

export type SleeveId = string;

export interface AccountRef {
  /** External (or future Internal) token root address */
  root: string;
  /** Strategy sleeve, e.g. uniswapx-filler */
  sleeve: SleeveId;
  tokenKind?: LedgerTokenKind;
}

export interface BookEntry {
  seq: number;
  ts: string;
  root: string;
  sleeve: SleeveId;
  /** +credit (inventory in) / −debit (inventory out) */
  delta: Amount;
  balanceAfter: Amount;
  ref?: string;
  note?: string;
}

export class VirtualBooksError extends Error {
  readonly ledgerError: string;
  readonly policyReason: string;

  constructor(ledgerError: keyof typeof import("./phase-a-spec.js").LEDGER_ERROR_TO_POLICY_REASON) {
    const policyReason = mapLedgerErrorToPolicyReason(ledgerError);
    super(policyReason);
    this.name = "VirtualBooksError";
    this.ledgerError = ledgerError;
    this.policyReason = policyReason;
  }
}

function key(root: string, sleeve: SleeveId): string {
  return `${root.toLowerCase()}::${sleeve}`;
}

function normRoot(root: string): string {
  if (!root || root === "0x0000000000000000000000000000000000000000") {
    throw new VirtualBooksError("ZeroAddress");
  }
  return root.toLowerCase();
}

/**
 * In-memory hierarchical balances: root × sleeve → Amount.
 * Debit requires sufficient balance (Ledger InsufficientBalance spirit).
 */
export class VirtualBooks {
  private balances = new Map<string, Amount>();
  private entries: BookEntry[] = [];
  private seq = 0;

  constructor(readonly defaultSleeve: SleeveId = "uniswapx-filler") {}

  balance(root: string, sleeve: SleeveId = this.defaultSleeve): Amount {
    return this.balances.get(key(normRoot(root), sleeve)) ?? 0n;
  }

  /** Credit inventory into a sleeve (receive tokens). */
  credit(
    root: string,
    amount: Amount,
    opts?: { sleeve?: SleeveId; ref?: string; note?: string; ts?: string }
  ): BookEntry {
    if (amount < 0n) throw new VirtualBooksError("InvalidAddress");
    const sleeve = opts?.sleeve ?? this.defaultSleeve;
    const r = normRoot(root);
    const k = key(r, sleeve);
    const next = (this.balances.get(k) ?? 0n) + amount;
    this.balances.set(k, next);
    return this.pushEntry({
      root: r,
      sleeve,
      delta: amount,
      balanceAfter: next,
      ref: opts?.ref,
      note: opts?.note ?? "credit",
      ts: opts?.ts,
    });
  }

  /** Debit inventory from a sleeve (pay tokens). Fail-closed. */
  debit(
    root: string,
    amount: Amount,
    opts?: { sleeve?: SleeveId; ref?: string; note?: string; ts?: string }
  ): BookEntry {
    if (amount < 0n) throw new VirtualBooksError("InvalidAddress");
    const sleeve = opts?.sleeve ?? this.defaultSleeve;
    const r = normRoot(root);
    const k = key(r, sleeve);
    const cur = this.balances.get(k) ?? 0n;
    if (amount > cur) {
      throw new VirtualBooksError("InsufficientBalance");
    }
    const next = cur - amount;
    this.balances.set(k, next);
    return this.pushEntry({
      root: r,
      sleeve,
      delta: -amount,
      balanceAfter: next,
      ref: opts?.ref,
      note: opts?.note ?? "debit",
      ts: opts?.ts,
    });
  }

  /**
   * Model a Dutch accept: filler delivers outputRoot, receives inputRoot.
   * Debit output first (fail-closed), then credit input.
   */
  postAccept(p: {
    inputRoot: string;
    outputRoot: string;
    inputAmount: Amount;
    outputAmount: Amount;
    ref?: string;
    sleeve?: SleeveId;
    ts?: string;
  }): { debitOut: BookEntry; creditIn: BookEntry } {
    const sleeve = p.sleeve ?? this.defaultSleeve;
    const debitOut = this.debit(p.outputRoot, p.outputAmount, {
      sleeve,
      ref: p.ref,
      note: "dutch_fill_output",
      ts: p.ts,
    });
    const creditIn = this.credit(p.inputRoot, p.inputAmount, {
      sleeve,
      ref: p.ref,
      note: "dutch_fill_input",
      ts: p.ts,
    });
    return { debitOut, creditIn };
  }

  /** Seed inventory (research / sim). */
  seed(
    root: string,
    amount: Amount,
    sleeve?: SleeveId
  ): BookEntry {
    return this.credit(root, amount, {
      sleeve,
      note: "seed",
    });
  }

  snapshot(): { root: string; sleeve: string; balance: string }[] {
    return [...this.balances.entries()].map(([k, bal]) => {
      const [root, sleeve] = k.split("::") as [string, string];
      return { root, sleeve, balance: bal.toString() };
    });
  }

  journal(): readonly BookEntry[] {
    return this.entries;
  }

  /** Known Phase A External roots helper */
  static get externalRoots() {
    return PHASE_A_EXTERNAL_ROOTS;
  }

  private pushEntry(
    e: Omit<BookEntry, "seq" | "ts"> & { ts?: string }
  ): BookEntry {
    this.seq += 1;
    const row: BookEntry = {
      seq: this.seq,
      ts: e.ts ?? new Date().toISOString(),
      root: e.root,
      sleeve: e.sleeve,
      delta: e.delta,
      balanceAfter: e.balanceAfter,
      ref: e.ref,
      note: e.note,
    };
    this.entries.push(row);
    return row;
  }
}
