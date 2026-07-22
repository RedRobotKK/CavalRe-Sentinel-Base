import { describe, it, expect } from "vitest";
import {
  VirtualBooks,
  VirtualBooksError,
  SOURCE_SLEEVE,
} from "../src/virtual-books.js";
import { PHASE_A_EXTERNAL_ROOTS } from "../src/phase-a-spec.js";

const WETH = PHASE_A_EXTERNAL_ROOTS.WETH;
const USDC = PHASE_A_EXTERNAL_ROOTS.USDC;

describe("VirtualBooks Phase B — double-entry", () => {
  it("seeds and reports balance", () => {
    const books = new VirtualBooks();
    books.seed(WETH, 1_000000000000000000n);
    expect(books.balance(WETH)).toBe(1_000000000000000000n);
    expect(books.sourceBalance(WETH)).toBe(1_000000000000000000n);
  });

  it("seed is balanced Debit(sleeve)+Credit(Source)", () => {
    const books = new VirtualBooks();
    books.seed(USDC, 100_000000n);
    expect(books.isFullyBalanced()).toBe(true);
    const j = books.journal();
    expect(j).toHaveLength(2);
    expect(j[0]!.side).toBe("debit");
    expect(j[0]!.sleeve).toBe("uniswapx-filler");
    expect(j[1]!.side).toBe("credit");
    expect(j[1]!.sleeve).toBe(SOURCE_SLEEVE);
    expect(j[0]!.amount).toBe(j[1]!.amount);
    expect(j[0]!.batchId).toBe(j[1]!.batchId);
  });

  it("credit increases sleeve and Source together", () => {
    const books = new VirtualBooks();
    books.credit(USDC, 100_000000n);
    books.credit(USDC, 50_000000n);
    expect(books.balance(USDC)).toBe(150_000000n);
    expect(books.sourceBalance(USDC)).toBe(150_000000n);
    expect(books.isFullyBalanced()).toBe(true);
  });

  it("debit decreases sleeve and Source together", () => {
    const books = new VirtualBooks();
    books.seed(USDC, 100_000000n);
    books.debit(USDC, 40_000000n);
    expect(books.balance(USDC)).toBe(60_000000n);
    expect(books.sourceBalance(USDC)).toBe(60_000000n);
    expect(books.isFullyBalanced()).toBe(true);
  });

  it("fail-closed InsufficientBalance maps to exceeds_current_equity", () => {
    const books = new VirtualBooks();
    books.seed(WETH, 1n);
    try {
      books.debit(WETH, 2n);
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(VirtualBooksError);
      const err = e as VirtualBooksError;
      expect(err.ledgerError).toBe("InsufficientBalance");
      expect(err.policyReason).toBe("exceeds_current_equity");
    }
  });

  it("rejects zero root address", () => {
    const books = new VirtualBooks();
    expect(() =>
      books.credit("0x0000000000000000000000000000000000000000", 1n)
    ).toThrow(VirtualBooksError);
  });

  it("postAccept posts two balanced batches (pay out + receive in)", () => {
    const books = new VirtualBooks();
    books.seed(WETH, 5_000000000000000000n);
    const { debitOut, creditIn, outputBatchId, inputBatchId } = books.postAccept({
      inputRoot: USDC,
      outputRoot: WETH,
      inputAmount: 10_000000n,
      outputAmount: 1_000000000000000000n,
      ref: "0xabc",
    });

    expect(debitOut.delta).toBe(-1_000000000000000000n);
    expect(creditIn.delta).toBe(10_000000n);
    expect(books.balance(WETH)).toBe(4_000000000000000000n);
    expect(books.balance(USDC)).toBe(10_000000n);
    expect(books.isFullyBalanced()).toBe(true);

    const outBatch = books.batch(outputBatchId);
    expect(outBatch).toHaveLength(2);
    expect(outBatch[0]!.amount).toBe(outBatch[1]!.amount);

    const inBatch = books.batch(inputBatchId);
    expect(inBatch).toHaveLength(2);
    expect(inBatch[0]!.amount).toBe(inBatch[1]!.amount);
  });

  it("postAccept fails if output inventory missing", () => {
    const books = new VirtualBooks();
    expect(() =>
      books.postAccept({
        inputRoot: USDC,
        outputRoot: WETH,
        inputAmount: 1n,
        outputAmount: 1n,
      })
    ).toThrow(VirtualBooksError);
  });

  it("isolates sleeves", () => {
    const books = new VirtualBooks();
    books.seed(USDC, 100n, "uniswapx-filler");
    books.seed(USDC, 50n, "hedge");
    expect(books.balance(USDC, "uniswapx-filler")).toBe(100n);
    expect(books.balance(USDC, "hedge")).toBe(50n);
    // Source is shared per root — both seeds credit the same Source
    expect(books.sourceBalance(USDC)).toBe(150n);
  });

  it("snapshot lists sleeve and Source", () => {
    const books = new VirtualBooks();
    books.seed(WETH, 1n);
    const snap = books.snapshot();
    expect(snap.some((r) => r.sleeve === SOURCE_SLEEVE && r.isCreditAccount)).toBe(
      true
    );
    expect(
      snap.some(
        (r) => r.root === WETH.toLowerCase() && r.sleeve === "uniswapx-filler"
      )
    ).toBe(true);
  });

  it("journal records seq order with batch linkage", () => {
    const books = new VirtualBooks();
    books.seed(USDC, 10n);
    books.debit(USDC, 3n);
    const j = books.journal();
    // seed 2 legs + debit 2 legs
    expect(j).toHaveLength(4);
    expect(j[0]!.seq).toBe(1);
    expect(j[3]!.seq).toBe(4);
    expect(books.isFullyBalanced()).toBe(true);
  });
});
