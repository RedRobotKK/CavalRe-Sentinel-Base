import { describe, it, expect } from "vitest";
import { ethPath, assertEthPath, ETH_PATH_PREFIX } from "../src/derivation.js";
import { WalletError } from "../src/errors.js";

describe("ethPath", () => {
  it("builds standard path", () => {
    expect(ethPath(0)).toBe(`${ETH_PATH_PREFIX}/0`);
    expect(ethPath(5)).toBe(`${ETH_PATH_PREFIX}/5`);
  });

  it("rejects negative or non-integer index", () => {
    expect(() => ethPath(-1)).toThrow(WalletError);
    expect(() => ethPath(1.5)).toThrow(WalletError);
    try {
      ethPath(-1);
    } catch (e) {
      expect((e as WalletError).code).toBe("WALLET_INDEX_OUT_OF_RANGE");
    }
  });
});

describe("assertEthPath", () => {
  it("accepts valid ETH paths", () => {
    expect(() => assertEthPath("m/44'/60'/0'/0/0")).not.toThrow();
    expect(() => assertEthPath("m/44'/60'/0'/0/12")).not.toThrow();
  });

  it("rejects non-ETH or malformed paths", () => {
    const bad = [
      "m/44'/0'/0'/0/0",      // wrong coin type
      "m/44'/60'/1'/0/0",      // wrong account
      "m/44'/60'/0'/1/0",      // change = 1
      "44'/60'/0'/0/0",
      "",
    ];
    for (const p of bad) {
      try {
        assertEthPath(p);
        expect.unreachable();
      } catch (e) {
        expect((e as WalletError).code).toBe("WALLET_INVALID_PATH");
      }
    }
  });
});
