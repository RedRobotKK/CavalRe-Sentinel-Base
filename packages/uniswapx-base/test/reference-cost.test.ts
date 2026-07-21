import { describe, it, expect } from "vitest";
import { createUniswapV3ReferenceCost } from "../src/reference-cost.js";
import { BASE_USDC, BASE_WETH, BASE_CHAIN_ID } from "../src/constants.js";
import type { ParsedOrder } from "../src/types.js";

const sampleOrder: ParsedOrder = {
  orderHash: "0xabc",
  chainId: BASE_CHAIN_ID,
  orderStatus: "open",
  orderType: "Dutch_V2",
  decayStartTime: 0,
  decayEndTime: 100,
  deadline: 200,
  inputToken: BASE_USDC,
  inputStart: 1_000000n,
  inputEnd: 1_000000n,
  outputToken: BASE_WETH,
  outputStart: 1n,
  outputEnd: 1n,
  outputRecipient: "0x1234567890123456789012345678901234567890",
  exclusiveFiller: null,
  createdAt: null,
};

describe("createUniswapV3ReferenceCost", () => {
  it("returns 0 for zero input", async () => {
    const fn = createUniswapV3ReferenceCost({
      fetchFn: async () => new Response("{}"),
    });
    expect(await fn(sampleOrder, 0n)).toBe(0n);
  });

  it("parses amountOut from eth_call result", async () => {
    // 1000 as uint256 word + padding words
    const amountOut = 1000n;
    const word = amountOut.toString(16).padStart(64, "0");
    const result = "0x" + word + "0".repeat(192);

    const fetchFn = async () =>
      new Response(JSON.stringify({ result }), {
        headers: { "Content-Type": "application/json" },
      });

    const fn = createUniswapV3ReferenceCost({ fetchFn });
    const out = await fn(sampleOrder, 1_000000n);
    expect(out).toBe(1000n);
  });

  it("returns 0 when all tiers revert", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ error: { message: "execution reverted" } }), {
        headers: { "Content-Type": "application/json" },
      });
    const fn = createUniswapV3ReferenceCost({ fetchFn });
    expect(await fn(sampleOrder, 1_000000n)).toBe(0n);
  });
});
