/**
 * Phase B — Virtual books (off-chain Ledger mirror).
 *
 * TRUST: https://github.com/CavalRe/cavalre-contracts/tree/main/modules/ledger
 *
 * CavalRe Ledger model (off-chain subset):
 * - Each External root is a debit group
 * - SOURCE is the default credit source leaf per root
 * - Inventory sleeves are debit-normal leaves
 * - Mutations are always balanced: every Debit has a matching Credit on that root
 *
 * seed (wrap spirit):
 *   Debit(sleeve) + Credit(Source)  → inventory in from source
 *
 * postAccept Dutch fill:
 *   Pay output:  Credit(sleeve_out) + Debit(Source_out)
 *   Receive input: Debit(sleeve_in) + Credit(Source_in)
 */

import type { Amount } from "@cavalre/core";
import {
  PHASE_A_EXTERNAL_ROOTS,
  mapLedgerErrorToPolicyReason,
  type LedgerTokenKind,
} from "./phase-a-spec.js";

export type SleeveId = string;

/** LedgerLib.SOURCE_ADDRESS analogue — credit-normal per root. */
export const SOURCE_SLEEVE: SleeveId = "Source";

export type LedgerSide = "debit" | "credit";

export interface AccountRef {
  root: string;
  sleeve: SleeveId;
  tokenKind?: LedgerTokenKind;
}

/** One leg of a double-entry batch (mirrors ILedger Credit/Debit events). */
export interface BookEntry {
  seq: number;
  /** Groups the two legs of one balanced transfer. */
  batchId: number;
  ts: string;
  root: string;
  sleeve: SleeveId;
  /** debit-normal inventory sleeve vs credit-normal Source */
  isCreditAccount: boolean;
  side: LedgerSide;
  amount: Amount;
  /** Signed inventory delta on this sleeve (+in / −out for debit-normal). */
  delta: Amount;
  balanceAfter: Amount;
  ref?: string;
  note?: string;
}

export class VirtualBooksError extends Error {
  readonly ledgerError: string;
  readonly policyReason: string;

  constructor(
    ledgerError: keyof typeof import("./phase-a-spec.js").LEDGER_ERROR_TO_POLICY_REASON
  ) {
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
 * In-memory hierarchical balances with CavalRe-style double-entry.
 * Debit-normal sleeves fail-closed on insufficient inventory.
 */
export class VirtualBooks {
  /** Net inventory on debit-normal sleeves (and Source credit balance). */
  private balances = new Map<string, Amount>();
  private entries: BookEntry[] = [];
  private seq = 0;
  private batchSeq = 0;

  constructor(readonly defaultSleeve: SleeveId = "uniswapx-filler") {}

  balance(root: string, sleeve: SleeveId = this.defaultSleeve): Amount {
    return this.balances.get(key(normRoot(root), sleeve)) ?? 0n;
  }

  sourceBalance(root: string): Amount {
    return this.balance(root, SOURCE_SLEEVE);
  }

  /**
   * Balanced transfer on one root.
   * Debit-normal `to` receives; credit-normal `from` (usually Source) supplies.
   * Or: debit-normal `from` pays; credit-normal `to` absorbs.
   */
  transfer(p: {
    root: string;
    fromSleeve: SleeveId;
    toSleeve: SleeveId;
    amount: Amount;
    fromIsCredit: boolean;
    toIsCredit: boolean;
    ref?: string;
    note?: string;
    ts?: string;
  }): { debitLeg: BookEntry; creditLeg: BookEntry; batchId: number } {
    if (p.amount < 0n) throw new VirtualBooksError("InvalidAddress");
    if (p.amount === 0n) throw new VirtualBooksError("InvalidAddress");

    const r = normRoot(p.root);
    const batchId = ++this.batchSeq;

    // Apply inventory math:
    // debit-normal: Debit side → +balance; Credit side → −balance (fail-closed)
    // credit-normal (Source): Credit side → +balance; Debit side → −balance
    const apply = (
      sleeve: SleeveId,
      isCreditAccount: boolean,
      side: LedgerSide
    ): { delta: Amount; balanceAfter: Amount } => {
      const k = key(r, sleeve);
      const cur = this.balances.get(k) ?? 0n;
      let delta: Amount;
      if (!isCreditAccount) {
        // debit-normal inventory
        delta = side === "debit" ? p.amount : -p.amount;
      } else {
        // credit-normal Source
        delta = side === "credit" ? p.amount : -p.amount;
      }
      if (delta < 0n && -delta > cur) {
        throw new VirtualBooksError("InsufficientBalance");
      }
      const next = cur + delta;
      this.balances.set(k, next);
      return { delta, balanceAfter: next };
    };

    // Ledger polarity: from is credited or debited depending on direction.
    // Standard wrap (Source → sleeve): from=Source credit account Credit, to=sleeve Debit
    // Standard unwrap (sleeve → Source): from=sleeve Credit, to=Source Debit
    const fromSide: LedgerSide = p.fromIsCredit ? "credit" : "credit";
    // from always loses economic inventory capacity via Credit on debit-normal
    // or Credit on credit-normal when supplying...
    // Cleaner: explicit legs from call sites via transferFromSource / transferToSource

    const fromApplied = apply(p.fromSleeve, p.fromIsCredit, fromSide);
    const toSide: LedgerSide = p.toIsCredit ? "credit" : "debit";
    const toApplied = apply(p.toSleeve, p.toIsCredit, toSide);

    const debitLeg = this.pushEntry({
      batchId,
      root: r,
      sleeve: p.toIsCredit ? p.fromSleeve : p.toSleeve,
      isCreditAccount: p.toIsCredit ? p.fromIsCredit : p.toIsCredit,
      side: "debit",
      amount: p.amount,
      delta: p.toIsCredit ? fromApplied.delta : toApplied.delta,
      balanceAfter: p.toIsCredit ? fromApplied.balanceAfter : toApplied.balanceAfter,
      ref: p.ref,
      note: p.note ? `${p.note}:debit` : "debit",
      ts: p.ts,
    });

    const creditLeg = this.pushEntry({
      batchId,
      root: r,
      sleeve: p.toIsCredit ? p.toSleeve : p.fromSleeve,
      isCreditAccount: p.toIsCredit ? p.toIsCredit : p.fromIsCredit,
      side: "credit",
      amount: p.amount,
      delta: p.toIsCredit ? toApplied.delta : fromApplied.delta,
      balanceAfter: p.toIsCredit ? toApplied.balanceAfter : fromApplied.balanceAfter,
      ref: p.ref,
      note: p.note ? `${p.note}:credit` : "credit",
      ts: p.ts,
    });

    return { debitLeg, creditLeg, batchId };
  }

  /**
   * Wrap spirit: Source (credit) → inventory sleeve (debit).
   * Debit(sleeve) + Credit(Source).
   */
  credit(
    root: string,
    amount: Amount,
    opts?: { sleeve?: SleeveId; ref?: string; note?: string; ts?: string }
  ): BookEntry {
    const sleeve = opts?.sleeve ?? this.defaultSleeve;
    const { debitLeg } = this.transferFromSource({
      root,
      toSleeve: sleeve,
      amount,
      ref: opts?.ref,
      note: opts?.note ?? "credit",
      ts: opts?.ts,
    });
    return debitLeg;
  }

  /**
   * Reduce inventory sleeve back toward Source (unwrap spirit).
   * Credit(sleeve) + Debit(Source).
   */
  debit(
    root: string,
    amount: Amount,
    opts?: { sleeve?: SleeveId; ref?: string; note?: string; ts?: string }
  ): BookEntry {
    const sleeve = opts?.sleeve ?? this.defaultSleeve;
    const { creditLeg } = this.transferToSource({
      root,
      fromSleeve: sleeve,
      amount,
      ref: opts?.ref,
      note: opts?.note ?? "debit",
      ts: opts?.ts,
    });
    return creditLeg;
  }

  /** Source → debit-normal sleeve (balanced). */
  transferFromSource(p: {
    root: string;
    toSleeve: SleeveId;
    amount: Amount;
    ref?: string;
    note?: string;
    ts?: string;
  }): { debitLeg: BookEntry; creditLeg: BookEntry; batchId: number } {
    if (p.amount <= 0n) throw new VirtualBooksError("InvalidAddress");
    const r = normRoot(p.root);
    const batchId = ++this.batchSeq;

    // Debit inventory sleeve (+)
    const sleeveKey = key(r, p.toSleeve);
    const sleeveCur = this.balances.get(sleeveKey) ?? 0n;
    const sleeveNext = sleeveCur + p.amount;
    this.balances.set(sleeveKey, sleeveNext);

    // Credit Source (+)
    const srcKey = key(r, SOURCE_SLEEVE);
    const srcCur = this.balances.get(srcKey) ?? 0n;
    const srcNext = srcCur + p.amount;
    this.balances.set(srcKey, srcNext);

    const debitLeg = this.pushEntry({
      batchId,
      root: r,
      sleeve: p.toSleeve,
      isCreditAccount: false,
      side: "debit",
      amount: p.amount,
      delta: p.amount,
      balanceAfter: sleeveNext,
      ref: p.ref,
      note: p.note ?? "from_source",
      ts: p.ts,
    });
    const creditLeg = this.pushEntry({
      batchId,
      root: r,
      sleeve: SOURCE_SLEEVE,
      isCreditAccount: true,
      side: "credit",
      amount: p.amount,
      delta: p.amount,
      balanceAfter: srcNext,
      ref: p.ref,
      note: p.note ?? "from_source",
      ts: p.ts,
    });
    return { debitLeg, creditLeg, batchId };
  }

  /** Debit-normal sleeve → Source (balanced). Fail-closed on sleeve. */
  transferToSource(p: {
    root: string;
    fromSleeve: SleeveId;
    amount: Amount;
    ref?: string;
    note?: string;
    ts?: string;
  }): { debitLeg: BookEntry; creditLeg: BookEntry; batchId: number } {
    if (p.amount <= 0n) throw new VirtualBooksError("InvalidAddress");
    const r = normRoot(p.root);
    const batchId = ++this.batchSeq;

    const sleeveKey = key(r, p.fromSleeve);
    const sleeveCur = this.balances.get(sleeveKey) ?? 0n;
    if (p.amount > sleeveCur) {
      throw new VirtualBooksError("InsufficientBalance");
    }
    const sleeveNext = sleeveCur - p.amount;
    this.balances.set(sleeveKey, sleeveNext);

    const srcKey = key(r, SOURCE_SLEEVE);
    const srcCur = this.balances.get(srcKey) ?? 0n;
    if (p.amount > srcCur) {
      // Source must have been credited by prior seed/wrap
      throw new VirtualBooksError("InsufficientBalance");
    }
    const srcNext = srcCur - p.amount;
    this.balances.set(srcKey, srcNext);

    const creditLeg = this.pushEntry({
      batchId,
      root: r,
      sleeve: p.fromSleeve,
      isCreditAccount: false,
      side: "credit",
      amount: p.amount,
      delta: -p.amount,
      balanceAfter: sleeveNext,
      ref: p.ref,
      note: p.note ?? "to_source",
      ts: p.ts,
    });
    const debitLeg = this.pushEntry({
      batchId,
      root: r,
      sleeve: SOURCE_SLEEVE,
      isCreditAccount: true,
      side: "debit",
      amount: p.amount,
      delta: -p.amount,
      balanceAfter: srcNext,
      ref: p.ref,
      note: p.note ?? "to_source",
      ts: p.ts,
    });
    return { debitLeg, creditLeg, batchId };
  }

  /**
   * Dutch accept: filler delivers outputRoot, receives inputRoot.
   * Each root posts a balanced pair against Source.
   */
  postAccept(p: {
    inputRoot: string;
    outputRoot: string;
    inputAmount: Amount;
    outputAmount: Amount;
    ref?: string;
    sleeve?: SleeveId;
    ts?: string;
  }): {
    debitOut: BookEntry;
    creditIn: BookEntry;
    outputBatchId: number;
    inputBatchId: number;
  } {
    const sleeve = p.sleeve ?? this.defaultSleeve;

    // Pay output inventory → Source
    const out = this.transferToSource({
      root: p.outputRoot,
      fromSleeve: sleeve,
      amount: p.outputAmount,
      ref: p.ref,
      note: "dutch_fill_output",
      ts: p.ts,
    });

    // Receive input inventory ← Source
    const inn = this.transferFromSource({
      root: p.inputRoot,
      toSleeve: sleeve,
      amount: p.inputAmount,
      ref: p.ref,
      note: "dutch_fill_input",
      ts: p.ts,
    });

    return {
      debitOut: out.creditLeg, // sleeve credited (inventory down)
      creditIn: inn.debitLeg, // sleeve debited (inventory up)
      outputBatchId: out.batchId,
      inputBatchId: inn.batchId,
    };
  }

  /** Seed inventory (research) — wrap from Source. */
  seed(root: string, amount: Amount, sleeve?: SleeveId): BookEntry {
    return this.credit(root, amount, {
      sleeve,
      note: "seed",
    });
  }

  snapshot(): { root: string; sleeve: string; balance: string; isCreditAccount: boolean }[] {
    return [...this.balances.entries()].map(([k, bal]) => {
      const [root, sleeve] = k.split("::") as [string, string];
      return {
        root,
        sleeve,
        balance: bal.toString(),
        isCreditAccount: sleeve === SOURCE_SLEEVE,
      };
    });
  }

  journal(): readonly BookEntry[] {
    return this.entries;
  }

  /** Legs for one balanced batch (always length 2 when well-formed). */
  batch(batchId: number): BookEntry[] {
    return this.entries.filter((e) => e.batchId === batchId);
  }

  /** True if every batch has equal debit and credit amounts. */
  isFullyBalanced(): boolean {
    const by = new Map<number, { debit: Amount; credit: Amount }>();
    for (const e of this.entries) {
      const row = by.get(e.batchId) ?? { debit: 0n, credit: 0n };
      if (e.side === "debit") row.debit += e.amount;
      else row.credit += e.amount;
      by.set(e.batchId, row);
    }
    for (const row of by.values()) {
      if (row.debit !== row.credit) return false;
    }
    return true;
  }

  static get externalRoots() {
    return PHASE_A_EXTERNAL_ROOTS;
  }

  private pushEntry(
    e: Omit<BookEntry, "seq" | "ts"> & { ts?: string }
  ): BookEntry {
    this.seq += 1;
    const row: BookEntry = {
      seq: this.seq,
      batchId: e.batchId,
      ts: e.ts ?? new Date().toISOString(),
      root: e.root,
      sleeve: e.sleeve,
      isCreditAccount: e.isCreditAccount,
      side: e.side,
      amount: e.amount,
      delta: e.delta,
      balanceAfter: e.balanceAfter,
      ref: e.ref,
      note: e.note,
    };
    this.entries.push(row);
    return row;
  }
}
