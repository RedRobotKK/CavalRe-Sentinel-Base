import { type Amount, amountToString } from "@cavalre/core";
import { WalletError } from "./errors.js";
import { assertAddress } from "./address.js";
import type { Address, Hex } from "./types.js";

/** Keccak-256 function selectors (first 4 bytes). */
const SELECTOR_BALANCE_OF = "70a08231"; // balanceOf(address)
const SELECTOR_TRANSFER = "a9059cbb"; // transfer(address,uint256)
const SELECTOR_APPROVE = "095ea7b3"; // approve(address,uint256)

/**
 * Encode ERC-20 balanceOf(address) calldata.
 * Read-only; no private key required.
 */
export function encodeBalanceOf(account: string): Hex {
  const addr = assertAddress(account);
  return (`0x${SELECTOR_BALANCE_OF}${padAddress(addr)}`) as Hex;
}

/**
 * Encode ERC-20 transfer(address to, uint256 amount) calldata.
 * amount must be Amount (bigint). No Number allowed.
 */
export function encodeTransfer(to: string, amount: Amount): Hex {
  if (amount < 0n) {
    throw new WalletError("ERC20_INVALID_AMOUNT", "amount cannot be negative");
  }
  const toAddr = assertAddress(to);
  try {
    return (`0x${SELECTOR_TRANSFER}${padAddress(toAddr)}${padUint256(amount)}`) as Hex;
  } catch {
    throw new WalletError("ERC20_ENCODE_FAILED", "failed to encode transfer");
  }
}

/**
 * Encode ERC-20 approve(address spender, uint256 amount) calldata.
 */
export function encodeApprove(spender: string, amount: Amount): Hex {
  if (amount < 0n) {
    throw new WalletError("ERC20_INVALID_AMOUNT", "amount cannot be negative");
  }
  const spenderAddr = assertAddress(spender);
  try {
    return (`0x${SELECTOR_APPROVE}${padAddress(spenderAddr)}${padUint256(amount)}`) as Hex;
  } catch {
    throw new WalletError("ERC20_ENCODE_FAILED", "failed to encode approve");
  }
}

function padAddress(addr: Address): string {
  // strip 0x, left-pad to 32 bytes (64 hex chars)
  return addr.slice(2).toLowerCase().padStart(64, "0");
}

function padUint256(amount: Amount): string {
  // Amount is bigint; convert to hex without Number.
  const hex = amountToString(amount); // decimal string
  // Convert decimal string to hex carefully for large values.
  const asHex = BigInt(hex).toString(16);
  return asHex.padStart(64, "0");
}
