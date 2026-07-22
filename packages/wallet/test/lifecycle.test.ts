import { describe, it, expect } from "vitest";
import {
  resolveWalletSession,
  walletPublicContext,
  assertCanSign,
  WALLET_USE_CASES,
} from "../src/lifecycle.js";
import type { Signer, Address } from "../src/types.js";
import { WalletError } from "../src/errors.js";

const ADDR = "0x1234567890123456789012345678901234567890" as Address;

function mockSigner(address: Address = ADDR): Signer {
  return {
    address,
    async signDigest() {
      return new Uint8Array(65);
    },
  };
}

describe("Wallet lifecycle — phases A–C", () => {
  it("UC1 anonymous research → none", () => {
    const s = resolveWalletSession({ phase: "A" });
    expect(s.posture).toBe("none");
    expect(s.liveCapitalAllowed).toBe(false);
    expect(s.hasSigner).toBe(false);
  });

  it("UC2 display address → view", () => {
    const s = resolveWalletSession({
      phase: "B",
      displayAddress: ADDR,
    });
    expect(s.posture).toBe("view");
    expect(s.address).toBe(ADDR.toLowerCase() as Address);
    expect(s.liveCapitalAllowed).toBe(false);
  });

  it("UC3 signer on phase C → ready, not live", () => {
    const s = resolveWalletSession({
      phase: "C",
      signer: mockSigner(),
      goNoGoSatisfied: true, // ignored for A–C
    });
    expect(s.posture).toBe("ready");
    expect(s.liveCapitalAllowed).toBe(false);
  });
});

describe("Wallet lifecycle — phases D–E", () => {
  it("UC4 signer without Go → ready, assertCanSign throws", () => {
    const s = resolveWalletSession({
      phase: "D",
      signer: mockSigner(),
      goNoGoSatisfied: false,
    });
    expect(s.posture).toBe("ready");
    expect(s.liveCapitalAllowed).toBe(false);
    expect(() => assertCanSign(s)).toThrow(WalletError);
  });

  it("UC5 Go + signer → live", () => {
    const s = resolveWalletSession({
      phase: "D",
      signer: mockSigner(),
      goNoGoSatisfied: true,
    });
    expect(s.posture).toBe("live");
    expect(s.liveCapitalAllowed).toBe(true);
    expect(() => assertCanSign(s)).not.toThrow();
  });

  it("UC6 phase E same live rules", () => {
    const s = resolveWalletSession({
      phase: "E",
      signer: mockSigner(),
      goNoGoSatisfied: true,
    });
    expect(s.posture).toBe("live");
  });

  it("Go without signer cannot go live", () => {
    const s = resolveWalletSession({
      phase: "D",
      displayAddress: ADDR,
      goNoGoSatisfied: true,
    });
    expect(s.posture).toBe("view");
    expect(s.liveCapitalAllowed).toBe(false);
  });
});

describe("walletPublicContext", () => {
  it("never exposes signer material", () => {
    const s = resolveWalletSession({
      phase: "D",
      signer: mockSigner(),
      goNoGoSatisfied: true,
    });
    const pub = walletPublicContext(s);
    expect(pub.walletAddress).toBeTruthy();
    expect(JSON.stringify(pub)).not.toMatch(/private|mnemonic|key/i);
    expect(Object.keys(pub).sort()).toEqual([
      "liveCapitalAllowed",
      "phase",
      "walletAddress",
      "walletPosture",
    ]);
  });
});

describe("WALLET_USE_CASES catalog", () => {
  it("documents six lifecycle use-cases", () => {
    expect(WALLET_USE_CASES.length).toBe(6);
    expect(WALLET_USE_CASES.map((u) => u.id)).toContain("UC5_live_unlocked");
  });
});
