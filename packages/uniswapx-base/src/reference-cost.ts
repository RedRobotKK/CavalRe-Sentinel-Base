/**
 * Mainnet reference cost via Uniswap v3 QuoterV2 on Base.
 * eth_call only — no keys.
 */

import type { Amount } from "@cavalre/core";
import type { ParsedOrder } from "./types.js";
import {
  BASE_QUOTER_V2,
  DEFAULT_BASE_RPC,
  V3_FEE_TIERS,
} from "./constants.js";

export interface ReferenceCostOptions {
  rpcUrl?: string;
  fetchFn?: typeof fetch;
}

export type ReferenceCostResult = {
  amountOut: Amount;
  feeUsed: number | null;
  error: string | null;
};

function readBaseRpcFromEnv(): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.BASE_RPC_URL;
}

/**
 * Returns amountOut for best fee tier, or 0n with error diagnostic.
 */
export function createUniswapV3ReferenceCost(options: ReferenceCostOptions = {}) {
  const rpcUrl = options.rpcUrl ?? readBaseRpcFromEnv() ?? DEFAULT_BASE_RPC;
  const fetchFn = options.fetchFn ?? fetch;

  const fn = async function referenceCost(
    order: ParsedOrder,
    resolvedInput: Amount
  ): Promise<Amount> {
    const r = await quoteBest(fetchFn, rpcUrl, order, resolvedInput);
    (fn as { lastError?: string | null }).lastError = r.error;
    (fn as { lastFee?: number | null }).lastFee = r.feeUsed;
    return r.amountOut;
  };

  return fn;
}

export async function quoteBest(
  fetchFn: typeof fetch,
  rpcUrl: string,
  order: ParsedOrder,
  amountIn: Amount
): Promise<ReferenceCostResult> {
  if (amountIn === 0n) {
    return { amountOut: 0n, feeUsed: null, error: "zero_input" };
  }

  const tokenIn = normalizeAddr(order.inputToken);
  const tokenOut = normalizeAddr(order.outputToken);
  if (!tokenIn || !tokenOut) {
    return { amountOut: 0n, feeUsed: null, error: "bad_token_addr" };
  }
  if (tokenIn === tokenOut) {
    return { amountOut: 0n, feeUsed: null, error: "same_token" };
  }

  let best: Amount = 0n;
  let feeUsed: number | null = null;
  const errors: string[] = [];

  for (const fee of V3_FEE_TIERS) {
    try {
      const out = await quoteExactInputSingleV2(fetchFn, rpcUrl, {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
      });
      if (out > best) {
        best = out;
        feeUsed = fee;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // compress common revert noise
      const short = msg
        .replace(/execution reverted:?\s*/i, "rev:")
        .replace(/\s+/g, "_")
        .slice(0, 36);
      errors.push(`${fee}:${short}`);
    }
  }

  if (best === 0n) {
    return {
      amountOut: 0n,
      feeUsed: null,
      error: errors.slice(0, 4).join("|") || "no_pool_or_rpc",
    };
  }

  return { amountOut: best, feeUsed, error: null };
}

/**
 * QuoterV2.quoteExactInputSingle(QuoteExactInputSingleParams)
 * Params are a single *static* struct — encoded in place (no offset word).
 *
 * selector = bytes4(keccak256(
 *   "quoteExactInputSingle((address,address,uint256,uint24,uint160))"
 * )) = 0xc6a5026a
 */
async function quoteExactInputSingleV2(
  fetchFn: typeof fetch,
  rpcUrl: string,
  p: {
    tokenIn: string;
    tokenOut: string;
    amountIn: Amount;
    fee: number;
  }
): Promise<Amount> {
  const selector = "c6a5026a";
  const data =
    "0x" +
    selector +
    encodeAddress(p.tokenIn) +
    encodeAddress(p.tokenOut) +
    encodeUint256(p.amountIn) +
    encodeUint256(BigInt(p.fee)) +
    encodeUint256(0n); // sqrtPriceLimitX96 = 0 (no limit)

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: BASE_QUOTER_V2, data }, "latest"],
  };

  const res = await fetchFn(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`rpc_http_${res.status}`);

  const json = (await res.json()) as {
    result?: string;
    error?: { message: string };
  };
  if (json.error) throw new Error(json.error.message.slice(0, 80));
  if (!json.result || json.result === "0x") throw new Error("quote_empty");

  const hex = json.result.slice(2);
  if (hex.length < 64) throw new Error("quote_short");
  // amountOut is the first return word
  const amountOut = BigInt("0x" + hex.slice(0, 64));
  if (amountOut === 0n) throw new Error("quote_zero");
  return amountOut;
}

function normalizeAddr(addr: string | null | undefined): string | null {
  if (!addr || typeof addr !== "string") return null;
  const a = addr.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
  return a;
}

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeUint256(n: bigint): string {
  if (n < 0n) throw new Error("neg");
  return n.toString(16).padStart(64, "0");
}
