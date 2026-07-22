/**
 * Base chain block number for Dutch V3 clock.
 * TRUST: V3 reactor uses block numbers for exclusivity + decay.
 *
 * Inclusion lag
 * -------------
 * Resolve-at-head (lag=0): accurate for desk / dry-run observation.
 * Resolve-at-land (lag=1..2): expected block when a fill tx would include
 * on Base (~2s blocks). Never guess more than a few blocks ahead — curve
 * moves every block and over-lag makes obligation look cheaper than reality.
 *
 * Clamped to [0, MAX_INCLUSION_LAG]. Non-integers rejected.
 */

import { DEFAULT_BASE_RPC } from "./constants.js";

/** Hard cap — beyond this, edge math is fiction. */
export const MAX_INCLUSION_LAG = 5;

export type RpcFetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<Response>;

export class BlockClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockClockError";
  }
}

/** Normalize lag: integer in [0, MAX_INCLUSION_LAG]. */
export function normalizeInclusionLag(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new BlockClockError("inclusion_lag_not_number");
  }
  if (!Number.isInteger(raw)) {
    throw new BlockClockError("inclusion_lag_not_integer");
  }
  if (raw < 0) {
    throw new BlockClockError("inclusion_lag_negative");
  }
  if (raw > MAX_INCLUSION_LAG) {
    throw new BlockClockError(`inclusion_lag_exceeds_max:${MAX_INCLUSION_LAG}`);
  }
  return raw;
}

/**
 * eth_blockNumber → integer + optional inclusion lag.
 */
export async function fetchBaseBlockNumber(options?: {
  rpcUrl?: string;
  fetchFn?: RpcFetchFn;
  /** Add N blocks for expected inclusion (default 0). */
  inclusionLag?: number;
}): Promise<number> {
  const rpc = options?.rpcUrl ?? process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC;
  const fetchFn = options?.fetchFn ?? fetch;
  const lag = normalizeInclusionLag(options?.inclusionLag ?? 0);

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
    throw new BlockClockError(`base_block_rpc_failed:${res.status}`);
  }

  const body = (await res.json()) as {
    result?: string;
    error?: { message?: string };
  };
  if (body.error) {
    throw new BlockClockError(
      `base_block_rpc_error:${body.error.message ?? "unknown"}`
    );
  }
  if (typeof body.result !== "string") {
    throw new BlockClockError("base_block_rpc_bad_result");
  }

  const n = Number.parseInt(body.result, 16);
  if (!Number.isFinite(n) || n < 0) {
    throw new BlockClockError("base_block_rpc_parse");
  }
  return n + lag;
}
