/**
 * Mainnet reference cost via Uniswap v3 QuoterV2 on Base.
 * Inventory-light model: swap resolvedInput of tokenIn → tokenOut on AMM;
 * amountOut is refOutput for computeEdgeBps.
 *
 * No private keys. eth_call only.
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
  /** Optional fetch override (tests). */
  fetchFn?: typeof fetch;
}

/**
 * Build referenceCostFn for runCycle against Base mainnet QuoterV2.
 */
export function createUniswapV3ReferenceCost(options: ReferenceCostOptions = {}) {
  const rpcUrl = options.rpcUrl ?? process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC;
  const fetchFn = options.fetchFn ?? fetch;

  return async function referenceCost(
    order: ParsedOrder,
    resolvedInput: Amount
  ): Promise<Amount> {
    if (resolvedInput === 0n) return 0n;

    let best: Amount = 0n;

    for (const fee of V3_FEE_TIERS) {
      try {
        const out = await quoteExactInputSingle(fetchFn, rpcUrl, {
          tokenIn: order.inputToken,
          tokenOut: order.outputToken,
          amountIn: resolvedInput,
          fee,
        });
        if (out > best) best = out;
      } catch {
        // tier missing or revert — try next
      }
    }

    return best;
  };
}

async function quoteExactInputSingle(
  fetchFn: typeof fetch,
  rpcUrl: string,
  p: {
    tokenIn: string;
    tokenOut: string;
    amountIn: Amount;
    fee: number;
  }
): Promise<Amount> {
  // quoteExactInputSingle((address,address,uint256,uint24,uint160))
  // selector 0xc6a5026a (QuoterV2)
  const selector = "c6a5026a";
  const data =
    "0x" +
    selector +
    encodeAddress(p.tokenIn) +
    encodeAddress(p.tokenOut) +
    encodeUint256(p.amountIn) +
    encodeUint24(p.fee) +
    encodeUint160(0n);

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

  if (!res.ok) {
    throw new Error(`rpc_http_${res.status}`);
  }

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error || !json.result || json.result === "0x") {
    throw new Error(json.error?.message ?? "quote_empty");
  }

  // amountOut is first 32-byte word
  const hex = json.result.slice(2);
  if (hex.length < 64) throw new Error("quote_short");
  return BigInt("0x" + hex.slice(0, 64));
}

function encodeAddress(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, "");
  return a.padStart(64, "0");
}

function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function encodeUint24(n: number): string {
  // uint24 in ABI is still 32-byte word
  return n.toString(16).padStart(64, "0");
}

function encodeUint160(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}
