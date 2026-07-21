import { keccak_256 } from "@noble/hashes/sha3";
import { WalletError } from "./errors.js";
import type { Address } from "./types.js";

/**
 * Derive an Ethereum address from an uncompressed public key (64 bytes, no 04 prefix)
 * or a compressed public key (33 bytes).
 *
 * Spec: Keccak-256(pubkey) → take last 20 bytes → 0x-prefixed hex.
 */
export function publicKeyToAddress(publicKey: Uint8Array): Address {
  let key = publicKey;

  // Accept 65-byte uncompressed (0x04 || x || y) by stripping the prefix.
  if (key.length === 65 && key[0] === 0x04) {
    key = key.slice(1);
  }

  if (key.length !== 64 && key.length !== 33) {
    throw new WalletError(
      "WALLET_INVALID_PUBLIC_KEY",
      "public key must be 33 (compressed) or 64/65 (uncompressed) bytes"
    );
  }

  // For compressed keys we would need point decompression first.
  // This first version requires uncompressed 64-byte key for simplicity and auditability.
  if (key.length === 33) {
    throw new WalletError(
      "WALLET_INVALID_PUBLIC_KEY",
      "compressed public keys not supported in v0.1; pass uncompressed 64-byte key"
    );
  }

  const hash = keccak_256(key);
  const addrBytes = hash.slice(-20);
  return (`0x${bytesToHex(addrBytes)}`) as Address;
}

/** Validate and normalize an address string. */
export function assertAddress(value: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new WalletError("WALLET_INVALID_ADDRESS", "invalid address format");
  }
  return value.toLowerCase() as Address;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
