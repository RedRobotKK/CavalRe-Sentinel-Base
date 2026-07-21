import type { Amount } from "@cavalre/core";

/** Raw token amount as it appears on the wire (decimal string). */
export interface WireTokenAmount {
  token: string;
  startAmount: string;
  endAmount: string;
}

/** One output leg on the wire. */
export interface WireOutput extends WireTokenAmount {
  recipient: string;
}

/**
 * Minimal wire shape we accept from the UniswapX orders API.
 * We only require the fields needed for a safe dry-run decision.
 */
export interface WireOrder {
  orderHash: string;
  chainId: number;
  orderStatus: string;
  orderType?: string;
  decayStartTime?: number;
  decayEndTime?: number;
  deadline?: number;
  input?: WireTokenAmount;
  outputs?: WireOutput[];
  exclusiveFiller?: string;
  createdAt?: number;
}

/** Parsed, validated internal order. All sizes are Amount (bigint). */
export interface ParsedOrder {
  orderHash: string;
  chainId: number;
  orderStatus: string;
  orderType: string;
  decayStartTime: number | null;
  decayEndTime: number | null;
  deadline: number | null;
  inputToken: string;
  inputStart: Amount;
  inputEnd: Amount;
  outputToken: string;
  outputStart: Amount;
  outputEnd: Amount;
  outputRecipient: string;
  exclusiveFiller: string | null;
  createdAt: number | null;
}

export type ParseResult =
  | { ok: true; order: ParsedOrder }
  | { ok: false; reason: string; orderHash?: string };
