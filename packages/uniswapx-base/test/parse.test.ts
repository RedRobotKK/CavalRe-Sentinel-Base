import { describe, it, expect } from "vitest";
import { parseOrder, parseOrders } from "../src/parse.js";

const baseWire = {
  orderHash: "0xabc",
  chainId: 8453,
  orderStatus: "open",
  orderType: "Dutch_V3",
  decayStartTime: 1_700_000_000,
  decayEndTime: 1_700_000_600,
  deadline: 1_700_001_000,
  input: {
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    startAmount: "1000000",
    endAmount: "1000000",
  },
  outputs: [
    {
      token: "0x4200000000000000000000000000000000000006",
      startAmount: "500000000000000000",
      endAmount: "450000000000000000",
      recipient: "0x0000000000000000000000000000000000000001",
    },
  ],
};

describe("parseOrder", () => {
  it("parses a valid Dutch order with Amounts", () => {
    const r = parseOrder(baseWire);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.inputStart).toBe(1000000n);
      expect(r.order.outputStart).toBe(500000000000000000n);
      expect(r.order.relativeBlocks).toEqual([]);
      expect(r.order.decayStartBlock).toBeNull();
    }
  });

  it("parses live API shape (type + cosignerData)", () => {
    const live = {
      orderHash: "0xdef",
      chainId: 8453,
      orderStatus: "open",
      type: "Dutch_V3",
      cosignerData: {
        decayStartTime: 1_700_000_000,
        decayEndTime: 1_700_000_600,
        exclusiveFiller: "0x0000000000000000000000000000000000000000",
      },
      input: baseWire.input,
      outputs: baseWire.outputs,
    };
    const r = parseOrder(live);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.orderType).toBe("Dutch_V3");
      expect(r.order.decayStartTime).toBe(1_700_000_000);
    }
  });

  it("parses V3 cosigner decayStartBlock + curve", () => {
    const wire = {
      ...baseWire,
      cosignerData: {
        decayStartBlock: 12_345_678,
        exclusiveFiller: "0x1111111111111111111111111111111111111111",
        exclusivityOverrideBps: 25,
        relativeBlocks: [4, 10],
        relativeAmounts: ["40", "70"],
      },
    };
    const r = parseOrder(wire);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.decayStartBlock).toBe(12_345_678);
      expect(r.order.relativeBlocks).toEqual([4, 10]);
      expect(r.order.relativeAmounts).toEqual([40n, 70n]);
      expect(r.order.exclusivityOverrideBps).toBe(25);
      expect(r.order.exclusiveFiller).toBe(
        "0x1111111111111111111111111111111111111111"
      );
    }
  });

  it("FAIL: curve length mismatch", () => {
    const r = parseOrder({
      ...baseWire,
      relativeBlocks: [4, 10],
      relativeAmounts: ["40"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("curve_length_mismatch");
  });

  it("FAIL: invalid relativeBlocks entry", () => {
    const r = parseOrder({
      ...baseWire,
      relativeBlocks: [4, "nope"],
      relativeAmounts: ["40", "50"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/relativeBlocks/);
  });

  it("FAIL: curve longer than 16", () => {
    const r = parseOrder({
      ...baseWire,
      relativeBlocks: Array.from({ length: 17 }, (_, i) => i + 1),
      relativeAmounts: Array.from({ length: 17 }, () => "1"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("InvalidDecayCurve");
  });

  it("parses JSON number amounts (live API)", () => {
    const wire = {
      ...baseWire,
      input: { ...baseWire.input, startAmount: 1000000, endAmount: 1000000 },
    };
    const r = parseOrder(wire);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order.inputStart).toBe(1000000n);
  });

  it("rejects wrong chainId", () => {
    const r = parseOrder({ ...baseWire, chainId: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/wrong_chainId/);
  });

  it("rejects non-object", () => {
    expect(parseOrder(null).ok).toBe(false);
  });

  it("rejects missing outputs", () => {
    const r = parseOrder({ ...baseWire, outputs: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid amount strings with field path", () => {
    const r = parseOrder({
      ...baseWire,
      input: { ...baseWire.input, startAmount: "12.34" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/input\.startAmount/);
  });

  it("preserves precision", () => {
    const big = "123456789012345678901234567890";
    const r = parseOrder({
      ...baseWire,
      input: { ...baseWire.input, startAmount: big, endAmount: big },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order.inputStart.toString()).toBe(big);
  });
});

describe("parseOrders", () => {
  it("separates valid from rejections", () => {
    const { orders, rejections } = parseOrders([
      baseWire,
      { orderHash: "0xbad" },
    ]);
    expect(orders.length).toBe(1);
    expect(rejections.length).toBe(1);
  });
});
