import { describe, it, expect } from "vitest";
import { classifyOrder, isTradableClass } from "../src/classify.js";

describe("classifyOrder", () => {
  it("classifies priority", () => {
    expect(
      classifyOrder({
        orderType: "PriorityOrder",
        exclusiveFiller: null,
        decayStartTime: null,
        decayEndTime: null,
      })
    ).toBe("priority");
  });

  it("classifies exclusive filler", () => {
    expect(
      classifyOrder({
        orderType: "Dutch_V2",
        exclusiveFiller: "0x1234567890123456789012345678901234567890",
        decayStartTime: 1,
        decayEndTime: 2,
      })
    ).toBe("exclusive");
  });

  it("classifies dutch by type", () => {
    expect(
      classifyOrder({
        orderType: "Dutch_V3",
        exclusiveFiller: null,
        decayStartTime: 1,
        decayEndTime: 2,
      })
    ).toBe("dutch");
  });

  it("classifies dutch by decay window", () => {
    expect(
      classifyOrder({
        orderType: "unknown",
        exclusiveFiller: "0x0000000000000000000000000000000000000000",
        decayStartTime: 10,
        decayEndTime: 20,
      })
    ).toBe("dutch");
  });

  it("unknown without signals", () => {
    expect(
      classifyOrder({
        orderType: "Limit",
        exclusiveFiller: null,
        decayStartTime: null,
        decayEndTime: null,
      })
    ).toBe("unknown");
  });
});

describe("isTradableClass", () => {
  it("only dutch is tradable in v1", () => {
    expect(isTradableClass("dutch")).toBe(true);
    expect(isTradableClass("priority")).toBe(false);
    expect(isTradableClass("exclusive")).toBe(false);
    expect(isTradableClass("unknown")).toBe(false);
  });
});
