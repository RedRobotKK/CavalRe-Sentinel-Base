import { describe, it, expect } from "vitest";
import {
  classifyOrder,
  isExclusiveWindowOpen,
  isTradableClass,
} from "../src/classify.js";

const FILLER = "0x1234567890123456789012345678901234567890";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("isExclusiveWindowOpen", () => {
  it("false when no exclusive filler", () => {
    expect(
      isExclusiveWindowOpen(
        { exclusiveFiller: null, decayStartTime: 100 },
        50
      )
    ).toBe(false);
  });

  it("false when exclusive filler is zero address", () => {
    expect(
      isExclusiveWindowOpen(
        { exclusiveFiller: ZERO, decayStartTime: 100 },
        50
      )
    ).toBe(false);
  });

  it("true when before decayStartTime (proxy exclusivity end)", () => {
    expect(
      isExclusiveWindowOpen(
        { exclusiveFiller: FILLER, decayStartTime: 1_000 },
        999
      )
    ).toBe(true);
  });

  it("false at decayStartTime (post-exclusive opens)", () => {
    expect(
      isExclusiveWindowOpen(
        { exclusiveFiller: FILLER, decayStartTime: 1_000 },
        1_000
      )
    ).toBe(false);
  });

  it("false after decayStartTime", () => {
    expect(
      isExclusiveWindowOpen(
        { exclusiveFiller: FILLER, decayStartTime: 1_000 },
        1_500
      )
    ).toBe(false);
  });

  it("fail-closed true when decayStartTime missing", () => {
    expect(
      isExclusiveWindowOpen(
        { exclusiveFiller: FILLER, decayStartTime: null },
        999
      )
    ).toBe(true);
  });
});

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

  it("classifies exclusive while window open", () => {
    expect(
      classifyOrder(
        {
          orderType: "Dutch_V2",
          exclusiveFiller: FILLER,
          decayStartTime: 1_000,
          decayEndTime: 2_000,
        },
        500
      )
    ).toBe("exclusive");
  });

  it("reclassifies post-exclusive as dutch at decay start", () => {
    expect(
      classifyOrder(
        {
          orderType: "Dutch_V3",
          exclusiveFiller: FILLER,
          decayStartTime: 1_000,
          decayEndTime: 2_000,
        },
        1_000
      )
    ).toBe("dutch");
  });

  it("reclassifies post-exclusive as dutch after decay start", () => {
    expect(
      classifyOrder(
        {
          orderType: "Dutch_V3",
          exclusiveFiller: FILLER,
          decayStartTime: 1_000,
          decayEndTime: 2_000,
        },
        1_250
      )
    ).toBe("dutch");
  });

  it("stays exclusive when filler set but no decayStartTime", () => {
    expect(
      classifyOrder(
        {
          orderType: "Dutch_V3",
          exclusiveFiller: FILLER,
          decayStartTime: null,
          decayEndTime: null,
        },
        1_000
      )
    ).toBe("exclusive");
  });

  it("classifies dutch by type without filler", () => {
    expect(
      classifyOrder({
        orderType: "Dutch_V3",
        exclusiveFiller: null,
        decayStartTime: 1,
        decayEndTime: 2,
      })
    ).toBe("dutch");
  });

  it("classifies dutch by decay window with zero filler", () => {
    expect(
      classifyOrder({
        orderType: "unknown",
        exclusiveFiller: ZERO,
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

  it("post-exclusive is tradable", () => {
    const c = classifyOrder(
      {
        orderType: "Dutch_V3",
        exclusiveFiller: FILLER,
        decayStartTime: 100,
        decayEndTime: 200,
      },
      150
    );
    expect(c).toBe("dutch");
    expect(isTradableClass(c)).toBe(true);
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
