import { BASE_CHAIN_ID, UNISWAPX_ORDERS_URL } from "./constants.js";
import { parseOrders } from "./parse.js";
import type { ParsedOrder } from "./types.js";

export type FetchFn = (url: string) => Promise<Response>;

export interface PollResult {
  orders: ParsedOrder[];
  rejections: { orderHash?: string; reason: string }[];
  fetchedAt: string;
  rawCount: number;
  requestUrl: string;
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
}

/** Default order type for Base mainnet per Uniswap filler docs. */
export const BASE_DEFAULT_ORDER_TYPE = "Dutch_V3";

/**
 * Fetch open UniswapX orders for Base and parse them.
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

  return {
    orders,
    rejections,
    fetchedAt: new Date().toISOString(),
    rawCount: rawList.length,
    requestUrl,
  };
}
