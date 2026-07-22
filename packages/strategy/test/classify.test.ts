import { describe, it, expect } from "vitest";
import {
  classifyOrder,
  isExclusiveWindowOpen,
  isTradableClass,
} from "../src/classify.js";

const base = {
  orderType: "Dutch_V3",
  exclusiveFiller: null as string | null,
  decayStartTime: 1_700_000_100 as number | null,
  decayEndTime: 1_700_000_600 as number | null,
};

describe("classifyOrder", () => {
  it("dutch when no exclusive filler", () => {
    expect(classifyOrder({ ...base }, 1_700_000_200)).toBe("dutch");
  });

  it("priority by type", () => {
    expect(
      classifyOrder({ ...base, orderType: "Priority" }, 1_700_000_200)
    ).toBe("priority");
  });

  it("exclusive while time window open", () => {
    expect(
      classifyOrder(
        {
          ...base,
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
        },
        1_700_000_050
      )
    ).toBe("exclusive");
  });

  it("post-exclusive time → dutch", () => {
    expect(
      classifyOrder(
        {
          ...base,
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
        },
        1_700_000_200
      )
    ).toBe("dutch");
  });

  it("PASS V3 block exclusivity: open before decayStartBlock", () => {
    expect(
      isExclusiveWindowOpen(
        {
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
          decayStartTime: null,
          decayStartBlock: 1000,
        },
        0,
        999
      )
    ).toBe(true);
    expect(
      classifyOrder(
        {
          orderType: "Dutch_V3",
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
          decayStartTime: null,
          decayEndTime: null,
          decayStartBlock: 1000,
        },
        0,
        999
      )
    ).toBe("exclusive");
  });

  it("PASS V3 block exclusivity: closed at/after decayStartBlock", () => {
    expect(
      isExclusiveWindowOpen(
        {
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
          decayStartTime: null,
          decayStartBlock: 1000,
        },
        0,
        1000
      )
    ).toBe(false);
    expect(
      classifyOrder(
        {
          orderType: "Dutch_V3",
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
          decayStartTime: null,
          decayEndTime: null,
          decayStartBlock: 1000,
        },
        0,
        1000
      )
    ).toBe("dutch");
  });

  it("FAIL-closed: exclusive without timing stays exclusive", () => {
    expect(
      isExclusiveWindowOpen(
        {
          exclusiveFiller: "0x1111111111111111111111111111111111111111",
          decayStartTime: null,
        },
        999
      )
    ).toBe(true);
  });

  it("zero address exclusive filler is not exclusive", () => {
    expect(
      isExclusiveWindowOpen(
        {
          exclusiveFiller: "0x0000000000000000000000000000000000000000",
          decayStartTime: 1_700_000_100,
        },
        1_700_000_050
      )
    ).toBe(false);
  });

  it("isTradableClass only dutch", () => {
    expect(isTradableClass("dutch")).toBe(true);
    expect(isTradableClass("exclusive")).toBe(false);
    expect(isTradableClass("priority")).toBe(false);
    expect(isTradableClass("unknown")).toBe(false);
  });
});
