import { describe, it, expect } from "vitest";
import { toAmount } from "@cavalre/core";
import { parseOrder, parseOrders } from "../src/parse.js";
import { BASE_CHAIN_ID, BASE_USDC, BASE_WETH } from "../src/constants.js";

function validWire(overrides: Record<string, unknown> = {}) {
  return {
    orderHash: "0xabc123",
    chainId: BASE_CHAIN_ID,
    orderStatus: "open",
    orderType: "Dutch_V3",
    decayStartTime: 1721500000,
    decayEndTime: 1721500300,
    deadline: 1721500600,
    input: {
      token: BASE_USDC,
      startAmount: "1000000000",
      endAmount: "1000000000",
    },
    outputs: [
      {
        token: BASE_WETH,
        startAmount: "385000000000000000",
        endAmount: "382000000000000000",
        recipient: "0x1234567890123456789012345678901234567890",
      },
    ],
    exclusiveFiller: "0x0000000000000000000000000000000000000000",
    createdAt: 1721499980,
    ...overrides,
  };
}

/** Shape observed from live api.uniswap.org (Eth Dutch_V2). */
function liveApiWire(chainId = BASE_CHAIN_ID) {
  return {
    type: "Dutch_V3",
    orderStatus: "open",
    signature: "0xsig",
    encodedOrder: "0xenc",
    chainId,
    orderHash: "0xlivehash",
    swapper: "0xd751257C1e18F06dF9aA9Ff7bD3d8E360c7b63dB",
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
        recipient: "0xd751257C1e18F06dF9aA9Ff7bD3d8E360c7b63dB",
      },
    ],
    cosignerData: {
      decayStartTime: 1784607975,
      decayEndTime: 1784608035,
      exclusiveFiller: "0x52B335fD4d229C4B4FFa6190526e4b5Fb8e3Fb09",
      inputOverride: "0",
      outputOverrides: ["1"],
    },
    createdAt: 1784607952,
  };
}

describe("parseOrder", () => {
  it("parses a valid Dutch order with Amounts", () => {
    const result = parseOrder(validWire());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.inputStart).toBe(toAmount("1000000000"));
    expect(typeof result.order.inputStart).toBe("bigint");
  });

  it("parses live API shape (type + cosignerData)", () => {
    const result = parseOrder(liveApiWire());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.orderType).toBe("Dutch_V3");
    expect(result.order.decayStartTime).toBe(1784607975);
    expect(result.order.decayEndTime).toBe(1784608035);
    expect(result.order.exclusiveFiller?.toLowerCase()).toBe(
      "0x52b335fd4d229c4b4ffa6190526e4b5fb8e3fb09"
    );
    expect(result.order.encodedOrder).toBe("0xenc");
    expect(result.order.signature).toBe("0xsig");
  });

  it("rejects wrong chainId", () => {
    const r = parseOrder(liveApiWire(1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("wrong_chainId:1");
  });

  it("rejects non-object", () => {
    expect(parseOrder(null).ok).toBe(false);
  });

  it("rejects missing outputs", () => {
    const r = parseOrder(validWire({ outputs: [] }));
    expect(r.ok).toBe(false);
  });

  it("rejects invalid amount strings", () => {
    const r = parseOrder(
      validWire({
        input: { token: BASE_USDC, startAmount: "12.34", endAmount: "12.34" },
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_amount_string");
  });

  it("preserves precision", () => {
    const big = "9007199254740993";
    const r = parseOrder(
      validWire({
        input: { token: BASE_USDC, startAmount: big, endAmount: big },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.inputStart.toString()).toBe(big);
  });
});

describe("parseOrders", () => {
  it("separates valid from rejections", () => {
    const { orders, rejections } = parseOrders([
      validWire({ orderHash: "0xgood" }),
      { orderHash: "0xbad", chainId: 1 },
    ]);
    expect(orders).toHaveLength(1);
    expect(rejections).toHaveLength(1);
  });
});
