import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { WalletError } from "./errors.js";
import { publicKeyToAddress } from "./address.js";
import type { Address, Signer } from "./types.js";

/**
 * LocalSigner — HIGH RISK
 *
 * Holds a private key in memory for automated signing.
 * Intended only for controlled environments (dry-run, dedicated hot wallet
 * with minimal capital, or tests).
 *
 * Security rules:
 * - Private key is never logged, stringified, or included in errors.
 * - Prefer injecting an external Signer (hardware / remote) in production.
 * - Zeroization of JS memory is best-effort only.
 */
export class LocalSigner implements Signer {
  private readonly privateKey: Uint8Array;
  readonly address: Address;

  /**
   * @param privateKeyHex 32-byte private key as 0x-hex or bare hex.
   *                       Must be a valid secp256k1 scalar.
   */
  constructor(privateKeyHex: string) {
    const cleaned = privateKeyHex.startsWith("0x")
      ? privateKeyHex.slice(2)
      : privateKeyHex;

    if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
      throw new WalletError(
        "WALLET_INVALID_PRIVATE_KEY",
        "private key must be 32 bytes hex"
      );
    }

    const key = hexToBytes(cleaned);

    if (!secp.utils.isValidPrivateKey(key)) {
      throw new WalletError(
        "WALLET_INVALID_PRIVATE_KEY",
        "private key is not a valid secp256k1 scalar"
      );
    }

    this.privateKey = key;

    // Derive uncompressed public key (64 bytes) then address.
    const pub = secp.getPublicKey(key, false); // false = uncompressed (65 bytes with 04)
    this.address = publicKeyToAddress(pub);
  }

  async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    if (digest.length !== 32) {
      throw new WalletError(
        "WALLET_SIGN_FAILED",
        "digest must be 32 bytes"
      );
    }

    try {
      // noble-secp256k1 v2 returns Signature object; we need compact + recovery.
      const sig = await secp.signAsync(digest, this.privateKey, {
        extraEntropy: true,
      });

      // Convert to 65-byte Ethereum signature (r || s || v)
      const r = sig.r;
      const s = sig.s;
      // noble v2 Signature has recovery bit via recoverPublicKey or options.
      // For v0.1 we produce a deterministic 64-byte compact and append v=27/28 later if needed.
      // Simpler path: use signature to compact bytes.
      const compact = sig.toCompactRawBytes(); // 64 bytes
      const recovery = (sig as unknown as { recovery?: number }).recovery ?? 0;
      const v = 27 + recovery;

      const out = new Uint8Array(65);
      out.set(compact, 0);
      out[64] = v;
      return out;
    } catch {
      // Never include key material in the error.
      throw new WalletError("WALLET_SIGN_FAILED", "signature generation failed");
    }
  }

  /** Best-effort wipe of the private key bytes. */
  destroy(): void {
    this.privateKey.fill(0);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Ethereum-style personal message digest helper (for completeness).
 * Most on-chain flows sign the transaction hash directly, not this.
 */
export function ethMessageHash(message: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(
    `\x19Ethereum Signed Message:\n${message.length}`
  );
  const joined = new Uint8Array(prefix.length + message.length);
  joined.set(prefix, 0);
  joined.set(message, prefix.length);
  return keccak_256(joined);
}
