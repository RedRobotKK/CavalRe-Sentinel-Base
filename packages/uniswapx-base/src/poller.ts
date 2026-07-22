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
  /** Attempts used (1 = first-try success). */
  attempts?: number;
}

export interface PollerOptions {
  fetchFn?: FetchFn;
  limit?: number;
  orderStatus?: string;
  /**
   * Required for useful results on many chains.
   * Base: Dutch_V3 (Uniswap filler docs).
   * Pass empty string to omit orderType filter.
   */
  orderType?: string;
  /** Transient network / 5xx retries (default 3). */
  maxAttempts?: number;
  /** Base backoff ms between attempts (default 400). */
  retryBackoffMs?: number;
}

/** Default order type for Base mainnet per Uniswap filler docs. */
export const BASE_DEFAULT_ORDER_TYPE = "Dutch_V3";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function errorCauseChain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  let depth = 0;
  while (cur && depth < 4) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
    depth += 1;
  }
  return parts.join(" | ") || "unknown";
}

/**
 * Fetch open UniswapX orders for Base and parse them.
 * Pure data path — no signing, no execution, safe for dry-run.
 * Retries transient network failures and 5xx/429.
 */
export async function pollOpenOrders(
  options: PollerOptions = {}
): Promise<PollResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const limit = options.limit ?? 50;
  const orderStatus = options.orderStatus ?? "open";
  const orderType =
    options.orderType === undefined
      ? BASE_DEFAULT_ORDER_TYPE
      : options.orderType;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const backoff = Math.max(0, options.retryBackoffMs ?? 400);

  const url = new URL(UNISWAPX_ORDERS_URL);
  url.searchParams.set("chainId", String(BASE_CHAIN_ID));
  url.searchParams.set("orderStatus", orderStatus);
  url.searchParams.set("limit", String(limit));
  if (orderType) {
    url.searchParams.set("orderType", orderType);
  }

  const requestUrl = url.toString();
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(requestUrl);
      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          await sleep(backoff * attempt);
          continue;
        }
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
        attempts: attempt,
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Non-retryable HTTP errors already thrown above with uniswapx_poll_failed
      if (msg.startsWith("uniswapx_poll_failed:") && !isRetryableStatus(Number(msg.split(":")[1]))) {
        throw e;
      }
      if (attempt < maxAttempts) {
        await sleep(backoff * attempt);
        continue;
      }
    }
  }

  throw new Error(
    `uniswapx_poll_exhausted:${errorCauseChain(lastErr)}`
  );
}
