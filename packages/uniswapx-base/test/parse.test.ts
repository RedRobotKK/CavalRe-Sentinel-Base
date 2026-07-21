import { describe, it, expect } from "vitest";
import { toAmount } from "@cavalre/core";
import { parseOrder, parseOrders } from "../src/parse.js";
import { BASE_CHAIN_ID, BASE_USDC, BASE_WETH } from "../src/constants.js";

function validWire(overrides: Record<string, unknown> = {}) {
  return {
    orderHash: "0xabc123",
    chainId: BASE_CHAIN_ID,
    orderStatus: "open",
    orderType: "Dutch_V2",
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

describe("parseOrder", () => {
  it("parses a valid Dutch order with Amounts", () => {
    const result = parseOrder(validWire());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const o = result.order;
    expect(o.orderHash).toBe("0xabc123");
    expect(o.chainId).toBe(BASE_CHAIN_ID);
    expect(o.inputToken).toBe(BASE_USDC);
    expect(o.outputToken).toBe(BASE_WETH);
    expect(o.inputStart).toBe(toAmount("1000000000"));
    expect(o.outputStart).toBe(toAmount("385000000000000000"));
    expect(o.outputEnd).toBe(toAmount("382000000000000000"));
    expect(typeof o.inputStart).toBe("bigint");
    expect(typeof o.outputEnd).toBe("bigint");
  });

  it("rejects non-object", () => {
    expect(parseOrder(null).ok).toBe(false);
    expect(parseOrder("string").ok).toBe(false);
    expect(parseOrder(42).ok).toBe(false);
  });

  it("rejects missing orderHash", () => {
    const r = parseOrder(validWire({ orderHash: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_orderHash");
  });

  it("rejects wrong chainId", () => {
    const r = parseOrder(validWire({ chainId: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("wrong_chainId:1");
  });

  it("rejects missing input", () => {
    const r = parseOrder(validWire({ input: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_input");
  });

  it("rejects missing outputs", () => {
    const r = parseOrder(validWire({ outputs: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_outputs");
  });

  it("rejects non-integer amount strings (fail-closed)", () => {
    const r = parseOrder(
      validWire({
        input: {
          token: BASE_USDC,
          startAmount: "12.34",
          endAmount: "12.34",
        },
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_amount_string");
  });

  it("rejects negative-looking amount strings", () => {
    const r = parseOrder(
      validWire({
        input: {
          token: BASE_USDC,
          startAmount: "-100",
          endAmount: "-100",
        },
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_amount_string");
  });

  it("preserves full precision of large amounts", () => {
    const big = "9007199254740993";
    const r = parseOrder(
      validWire({
        input: {
          token: BASE_USDC,
          startAmount: big,
          endAmount: big,
        },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.inputStart).toBe(toAmount(big));
    expect(r.order.inputStart.toString()).toBe(big);
  });
});

describe("parseOrders", () => {
  it("separates valid orders from rejections", () => {
    const { orders, rejections } = parseOrders([
      validWire({ orderHash: "0xgood" }),
      { orderHash: "0xbad", chainId: 1 },
      validWire({ orderHash: "0xgood2" }),
    ]);

    expect(orders).toHaveLength(2);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain("wrong_chainId");
  });
});
