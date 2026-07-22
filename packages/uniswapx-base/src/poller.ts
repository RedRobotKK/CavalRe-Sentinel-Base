import { BASE_CHAIN_ID, UNISWAPX_ORDERS_URL, DEFAULT_BASE_RPC } from "./constants.js";
import { parseOrders } from "./parse.js";
import { fetchBaseBlockNumber, type RpcFetchFn } from "./block.js";
import type { ParsedOrder } from "./types.js";

export type FetchFn = (url: string) => Promise<Response>;

export interface PollResult {
  orders: ParsedOrder[];
  rejections: { orderHash?: string; reason: string }[];
  fetchedAt: string;
  rawCount: number;
  requestUrl: string;
  /** Base head block at poll time (V3 clock). null if fetch failed. */
  currentBlock: number | null;
}

export interface PollerOptions {
  fetchFn?: FetchFn;
  limit?: number;
  orderStatus?: string;
  /**
   * Required for useful results on many chains.
   * Base: Dutch_V3 (Uniswap filler docs).
   */
  orderType?: string;
  /** RPC for eth_blockNumber (V3). */
  rpcUrl?: string;
  rpcFetchFn?: RpcFetchFn;
  /** Blocks to add for expected inclusion (default 0). */
  inclusionLag?: number;
  /** Skip block fetch (tests). */
  skipBlockNumber?: boolean;
}

/** Default order type for Base mainnet per Uniswap filler docs. */
export const BASE_DEFAULT_ORDER_TYPE = "Dutch_V3";

/**
 * Fetch open UniswapX orders for Base and parse them.
 * Also reads eth_blockNumber for Dutch V3 decay clock.
 * Pure data path — no signing, no execution, safe for dry-run.
 */
export async function pollOpenOrders(
  options: PollerOptions = {}
): Promise<PollResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const limit = options.limit ?? 50;
  const orderStatus = options.orderStatus ?? "open";
  const orderType = options.orderType ?? BASE_DEFAULT_ORDER_TYPE;

  const url = new URL(UNISWAPX_ORDERS_URL);
  url.searchParams.set("chainId", String(BASE_CHAIN_ID));
  url.searchParams.set("orderStatus", orderStatus);
  url.searchParams.set("limit", String(limit));
  if (orderType) {
    url.searchParams.set("orderType", orderType);
  }

  const requestUrl = url.toString();
  const res = await fetchFn(requestUrl);
  if (!res.ok) {
    throw new Error(`uniswapx_poll_failed:${res.status}`);
  }

  const body = (await res.json()) as { orders?: unknown[]; errorCode?: string };
  const rawList = Array.isArray(body.orders) ? body.orders : [];

  const { orders, rejections } = parseOrders(rawList);

  let currentBlock: number | null = null;
  if (!options.skipBlockNumber) {
    try {
      currentBlock = await fetchBaseBlockNumber({
        rpcUrl: options.rpcUrl ?? process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC,
        fetchFn: options.rpcFetchFn,
        inclusionLag: options.inclusionLag ?? 0,
      });
    } catch {
      currentBlock = null;
    }
  }

  return {
    orders,
    rejections,
    fetchedAt: new Date().toISOString(),
    rawCount: rawList.length,
    requestUrl,
    currentBlock,
  };
}
