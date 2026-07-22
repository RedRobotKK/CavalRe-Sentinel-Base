import { describe, it, expect } from "vitest";
import {
  VirtualBooks,
  VirtualBooksError,
} from "../src/virtual-books.js";
import { PHASE_A_EXTERNAL_ROOTS } from "../src/phase-a-spec.js";

const WETH = PHASE_A_EXTERNAL_ROOTS.WETH;
const USDC = PHASE_A_EXTERNAL_ROOTS.USDC;

describe("VirtualBooks Phase B", () => {
  it("seeds and reports balance", () => {
    const books = new VirtualBooks();
    books.seed(WETH, 1_000000000000000000n);
    expect(books.balance(WETH)).toBe(1_000000000000000000n);
  });

  it("credit increases balance", () => {
    const books = new VirtualBooks();
    books.credit(USDC, 100_000000n);
    books.credit(USDC, 50_000000n);
    expect(books.balance(USDC)).toBe(150_000000n);
  });

  it("debit decreases balance", () => {
    const books = new VirtualBooks();
    books.seed(USDC, 100_000000n);
    books.debit(USDC, 40_000000n);
    expect(books.balance(USDC)).toBe(60_000000n);
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

  it("postAccept debits output and credits input", () => {
    const books = new VirtualBooks();
    // Inventory: WETH to pay out, will receive USDC
    books.seed(WETH, 5_000000000000000000n);
    const { debitOut, creditIn } = books.postAccept({
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
  });

  it("snapshot lists non-zero keys", () => {
    const books = new VirtualBooks();
    books.seed(WETH, 1n);
    const snap = books.snapshot();
    expect(snap.some((r) => r.root === WETH.toLowerCase() && r.balance === "1")).toBe(
      true
    );
  });

  it("journal records seq order", () => {
    const books = new VirtualBooks();
    books.seed(USDC, 10n);
    books.debit(USDC, 3n);
    const j = books.journal();
    expect(j).toHaveLength(2);
    expect(j[0]!.seq).toBe(1);
    expect(j[1]!.seq).toBe(2);
  });
});
