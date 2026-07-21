import { describe, it, expect } from "vitest";
import { publicKeyToAddress, assertAddress } from "../src/address.js";
import { WalletError } from "../src/errors.js";

describe("publicKeyToAddress", () => {
  it("rejects wrong length keys", () => {
    expect(() => publicKeyToAddress(new Uint8Array(32))).toThrow(WalletError);
    try {
      publicKeyToAddress(new Uint8Array(32));
    } catch (e) {
      expect((e as WalletError).code).toBe("WALLET_INVALID_PUBLIC_KEY");
    }
  });

  it("rejects compressed keys in v0.1", () => {
    const compressed = new Uint8Array(33);
    compressed[0] = 0x02;
    expect(() => publicKeyToAddress(compressed)).toThrow(WalletError);
  });
});

describe("assertAddress", () => {
  it("accepts valid address", () => {
    const a = assertAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(a).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  });

  it("rejects invalid formats", () => {
    const bad = ["", "0x123", "833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0xZZ"];
    for (const v of bad) {
      try {
        assertAddress(v);
        expect.unreachable();
      } catch (e) {
        expect((e as WalletError).code).toBe("WALLET_INVALID_ADDRESS");
      }
    }
  });
});
