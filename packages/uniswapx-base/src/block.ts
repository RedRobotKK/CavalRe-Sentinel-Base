/**
 * Base chain block number for Dutch V3 clock.
 * TRUST: V3 reactor uses block numbers for exclusivity + decay.
 */

import { DEFAULT_BASE_RPC } from "./constants.js";

export type RpcFetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<Response>;

/**
 * eth_blockNumber → integer.
 * Optional inclusionLag adds blocks for expected land height.
 */
export async function fetchBaseBlockNumber(options?: {
  rpcUrl?: string;
  fetchFn?: RpcFetchFn;
  /** Add N blocks for inclusion lag (default 0). */
  inclusionLag?: number;
}): Promise<number> {
  const rpc = options?.rpcUrl ?? process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC;
  const fetchFn = options?.fetchFn ?? fetch;
  const lag = options?.inclusionLag ?? 0;

  const res = await fetchFn(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });

  if (!res.ok) {
    throw new Error(`base_block_rpc_failed:${res.status}`);
  }

  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (body.error) {
    throw new Error(`base_block_rpc_error:${body.error.message ?? "unknown"}`);
  }
  if (typeof body.result !== "string") {
    throw new Error("base_block_rpc_bad_result");
  }

  const n = Number.parseInt(body.result, 16);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("base_block_rpc_parse");
  }
  return n + Math.max(0, lag);
}
