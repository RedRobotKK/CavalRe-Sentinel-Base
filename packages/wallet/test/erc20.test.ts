import { describe, it, expect } from "vitest";
import { toAmount } from "@cavalre/core";
import {
  encodeBalanceOf,
  encodeTransfer,
  encodeApprove,
} from "../src/erc20.js";
import { WalletError } from "../src/errors.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SPENDER = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

describe("encodeBalanceOf", () => {
  it("produces correct selector and padded address", () => {
    const data = encodeBalanceOf(USDC);
    expect(data.startsWith("0x70a08231")).toBe(true);
    expect(data.length).toBe(2 + 8 + 64); // 0x + selector + 32-byte arg
  });

  it("rejects invalid address", () => {
    try {
      encodeBalanceOf("0x123");
      expect.unreachable();
    } catch (e) {
      expect((e as WalletError).code).toBe("WALLET_INVALID_ADDRESS");
    }
  });
});

describe("encodeTransfer", () => {
  it("encodes transfer with Amount", () => {
    const amount = toAmount("1000000"); // 1 USDC (6 decimals)
    const data = encodeTransfer(USDC, amount);
    expect(data.startsWith("0xa9059cbb")).toBe(true);
    expect(data.length).toBe(2 + 8 + 64 + 64);
  });

  it("rejects negative amount", () => {
    try {
      // Force a negative via type assertion would be caught by toAmount;
      // we test the guard inside encodeTransfer directly.
      encodeTransfer(USDC, -1n as unknown as bigint);
      expect.unreachable();
    } catch (e) {
      expect((e as WalletError).code).toBe("ERC20_INVALID_AMOUNT");
    }
  });

  it("rejects invalid recipient", () => {
    try {
      encodeTransfer("not-an-address", toAmount("1"));
      expect.unreachable();
    } catch (e) {
      expect((e as WalletError).code).toBe("WALLET_INVALID_ADDRESS");
    }
  });
});

describe("encodeApprove", () => {
  it("encodes approve with Amount", () => {
    const data = encodeApprove(SPENDER, toAmount("0"));
    expect(data.startsWith("0x095ea7b3")).toBe(true);
  });
});
