import { describe, it, expect } from "vitest";
import { resolveOrderAmounts } from "../src/resolve.js";

describe("resolveOrderAmounts", () => {
  it("uses start amounts when no decay window", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 100n,
        inputEnd: 200n,
        outputStart: 1000n,
        outputEnd: 500n,
        decayStartTime: null,
        decayEndTime: null,
      },
      50
    );
    expect(r.input).toBe(100n);
    expect(r.output).toBe(1000n);
    expect(r.decayProgressBps).toBe(0);
  });

  it("applies midpoint decay", () => {
    const r = resolveOrderAmounts(
      {
        inputStart: 0n,
        inputEnd: 1000n,
        outputStart: 1000n,
        outputEnd: 0n,
        decayStartTime: 0,
        decayEndTime: 100,
      },
      50
    );
    expect(r.input).toBe(500n);
    expect(r.output).toBe(500n);
    expect(r.decayProgressBps).toBe(5000);
  });
});
