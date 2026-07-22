import type { Amount } from "@cavalre/core";

export interface WireTokenAmount {
  token: string;
  startAmount: string;
  endAmount: string;
}

export interface WireOutput extends WireTokenAmount {
  recipient: string;
}

/**
 * Cosigner envelope on V2/V3 Dutch orders from the live API.
 * V3 (Base): decayStartBlock + nonlinear curve; V2: decayStartTime/EndTime.
 */
export interface WireCosignerData {
  decayStartTime?: number;
  decayEndTime?: number;
  /** V3: exclusivity ends / decay begins at this block. */
  decayStartBlock?: number;
  exclusiveFiller?: string;
  /** Soft exclusivity: non-exclusive fillers must deliver more output (bps). */
  exclusivityOverrideBps?: number;
  inputOverride?: string;
  outputOverrides?: string[];
  /** Piecewise curve block offsets (API array form). */
  relativeBlocks?: number[] | string[];
  /** Amount reductions from startAmount at each relativeBlocks point. */
  relativeAmounts?: Array<string | number | bigint>;
}

/**
 * Live UniswapX GET /orders wire shape (observed mainnet).
 * Supports both legacy flat fields and cosignerData nesting.
 */
export interface WireOrder {
  orderHash: string;
  chainId: number;
  orderStatus: string;
  /** Live API uses `type`; some docs say orderType. */
  type?: string;
  orderType?: string;
  decayStartTime?: number;
  decayEndTime?: number;
  decayStartBlock?: number;
  deadline?: number;
  input?: WireTokenAmount;
  outputs?: WireOutput[];
  exclusiveFiller?: string;
  exclusivityOverrideBps?: number;
  relativeBlocks?: number[] | string[];
  relativeAmounts?: Array<string | number | bigint>;
  createdAt?: number;
  cosignerData?: WireCosignerData;
  nonce?: string;
  swapper?: string;
  encodedOrder?: string;
  signature?: string;
}

export interface ParsedOrder {
  orderHash: string;
  chainId: number;
  orderStatus: string;
  orderType: string;
  /** V2 time window (unix seconds). */
  decayStartTime: number | null;
  decayEndTime: number | null;
  /** V3 block clock — exclusivity ends / decay starts. */
  decayStartBlock: number | null;
  /** V3 piecewise curve offsets from decayStartBlock. */
  relativeBlocks: number[];
  /** V3 reductions from startAmount (bigint). */
  relativeAmounts: bigint[];
  exclusivityOverrideBps: number;
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
  /** Present when API provided encoded order + sig (needed for future live execute). */
  encodedOrder: string | null;
  signature: string | null;
}

export type ParseResult =
  | { ok: true; order: ParsedOrder }
  | { ok: false; reason: string; orderHash?: string };
