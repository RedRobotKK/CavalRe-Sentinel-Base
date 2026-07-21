import { BASE_CHAIN_ID, UNISWAPX_ORDERS_URL } from "./constants.js";
import { parseOrders } from "./parse.js";
import type { ParsedOrder } from "./types.js";

export type FetchFn = (url: string) => Promise<Response>;

export interface PollResult {
  orders: ParsedOrder[];
  rejections: { orderHash?: string; reason: string }[];
  fetchedAt: string;
  rawCount: number;
}

export interface PollerOptions {
  /** Injectable fetch for tests / dry-run hermeticity. Defaults to global fetch. */
  fetchFn?: FetchFn;
  /** Max orders to request. */
  limit?: number;
  /** Only open orders by default. */
  orderStatus?: string;
}

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

  const url = new URL(UNISWAPX_ORDERS_URL);
  url.searchParams.set("chainId", String(BASE_CHAIN_ID));
  url.searchParams.set("orderStatus", orderStatus);
  url.searchParams.set("limit", String(limit));

  const res = await fetchFn(url.toString());
  if (!res.ok) {
    throw new Error(`uniswapx_poll_failed:${res.status}`);
  }

  const body = (await res.json()) as { orders?: unknown[] };
  const rawList = Array.isArray(body.orders) ? body.orders : [];

  const { orders, rejections } = parseOrders(rawList);

  return {
    orders,
    rejections,
    fetchedAt: new Date().toISOString(),
    rawCount: rawList.length,
  };
}
