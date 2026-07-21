import type { Amount } from "@cavalre/core";

/** 20-byte Ethereum address as 0x-prefixed hex string. */
export type Address = `0x${string}`;

/** Hex string (0x-prefixed or not, depending on context). */
export type Hex = `0x${string}`;

/**
 * Narrow Signer interface.
 * Implementations must never log or expose the private key.
 */
export interface Signer {
  /** Checksummed or lowercase address controlled by this signer. */
  readonly address: Address;
  /** Sign a 32-byte digest. Returns 65-byte signature (r+s+v). */
  signDigest(digest: Uint8Array): Promise<Uint8Array>;
}

export interface TransferParams {
  to: Address;
  amount: Amount;
}

export interface ApproveParams {
  spender: Address;
  amount: Amount;
}
