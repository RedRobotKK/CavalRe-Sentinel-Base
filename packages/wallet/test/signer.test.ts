import { describe, it, expect } from "vitest";
import { LocalSigner } from "../src/signer.js";
import { WalletError } from "../src/errors.js";

// Well-known test vector (DO NOT use on mainnet).
// Private key 0x01...01 is invalid as a scalar in some libs; use a valid one.
// This is a publicly documented anvil/test key.
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("LocalSigner", () => {
  it("derives a stable address from a valid private key", () => {
    const signer = new LocalSigner(TEST_PK);
    expect(signer.address.startsWith("0x")).toBe(true);
    expect(signer.address.length).toBe(42);
    // Anvil default account 0
    expect(signer.address.toLowerCase()).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    );
  });

  it("rejects malformed private key", () => {
    const bad = ["0x1234", "not-hex", "", "0x" + "zz".repeat(32)];
    for (const k of bad) {
      try {
        new LocalSigner(k);
        expect.unreachable();
      } catch (e) {
        expect((e as WalletError).code).toBe("WALLET_INVALID_PRIVATE_KEY");
      }
    }
  });

  it("signDigest rejects non-32-byte input", async () => {
    const signer = new LocalSigner(TEST_PK);
    await expect(signer.signDigest(new Uint8Array(16))).rejects.toMatchObject({
      code: "WALLET_SIGN_FAILED",
    });
  });

  it("signDigest returns 65-byte signature", async () => {
    const signer = new LocalSigner(TEST_PK);
    const digest = new Uint8Array(32);
    digest[31] = 1;
    const sig = await signer.signDigest(digest);
    expect(sig.length).toBe(65);
  });

  it("destroy does not throw", () => {
    const signer = new LocalSigner(TEST_PK);
    expect(() => signer.destroy()).not.toThrow();
  });
});
