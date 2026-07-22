import { describe, it, expect, vi } from "vitest";
import { pollOpenOrders, type FetchFn } from "../src/poller.js";
import { BASE_CHAIN_ID, BASE_USDC, BASE_WETH } from "../src/constants.js";

function mockFetch(body: unknown, status = 200): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("pollOpenOrders", () => {
  it("parses a successful response", async () => {
    const wire = {
      orders: [
        {
          orderHash: "0xorder1",
          chainId: BASE_CHAIN_ID,
          orderStatus: "open",
          orderType: "Dutch_V2",
          input: {
            token: BASE_USDC,
            startAmount: "1000000",
            endAmount: "1000000",
          },
          outputs: [
            {
              token: BASE_WETH,
              startAmount: "500000000000000",
              endAmount: "490000000000000",
              recipient: "0xabc",
            },
          ],
        },
      ],
    };

    const result = await pollOpenOrders({ fetchFn: mockFetch(wire) });

    expect(result.rawCount).toBe(1);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].orderHash).toBe("0xorder1");
    expect(result.rejections).toHaveLength(0);
    expect(typeof result.orders[0].inputStart).toBe("bigint");
    expect(result.attempts).toBe(1);
  });

  it("surfaces rejections for malformed orders", async () => {
    const wire = {
      orders: [
        { orderHash: "0xbad", chainId: 1, orderStatus: "open" },
        {
          orderHash: "0xgood",
          chainId: BASE_CHAIN_ID,
          orderStatus: "open",
          input: {
            token: BASE_USDC,
            startAmount: "1",
            endAmount: "1",
          },
          outputs: [
            {
              token: BASE_WETH,
              startAmount: "1",
              endAmount: "1",
              recipient: "0x1",
            },
          ],
        },
      ],
    };

    const result = await pollOpenOrders({ fetchFn: mockFetch(wire) });
    expect(result.orders).toHaveLength(1);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0].orderHash).toBe("0xbad");
  });

  it("throws on non-2xx response", async () => {
    await expect(
      pollOpenOrders({ fetchFn: mockFetch({}, 500), maxAttempts: 1 })
    ).rejects.toThrow("uniswapx_poll_failed:500");
  });

  it("retries transient network failure then succeeds", async () => {
    let n = 0;
    const wire = { orders: [] };
    const fetchFn: FetchFn = async () => {
      n += 1;
      if (n === 1) {
        throw new Error("fetch failed");
      }
      return new Response(JSON.stringify(wire), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await pollOpenOrders({
      fetchFn,
      maxAttempts: 3,
      retryBackoffMs: 1,
    });
    expect(result.rawCount).toBe(0);
    expect(result.attempts).toBe(2);
    expect(n).toBe(2);
  });

  it("exhausts retries and surfaces cause", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("fetch failed");
    };
    await expect(
      pollOpenOrders({ fetchFn, maxAttempts: 2, retryBackoffMs: 1 })
    ).rejects.toThrow(/uniswapx_poll_exhausted:fetch failed/);
  });

  it("handles empty orders array", async () => {
    const result = await pollOpenOrders({
      fetchFn: mockFetch({ orders: [] }),
    });
    expect(result.rawCount).toBe(0);
    expect(result.orders).toHaveLength(0);
  });
});
