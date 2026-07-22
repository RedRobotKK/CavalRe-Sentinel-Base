import { describe, it, expect } from "vitest";
import {
  dutchAuctionPhase,
  evaluateDutchAuction,
} from "../src/dutch-auction.js";

const BASE = {
  inputStart: 50_000000n,
  inputEnd: 50_000000n,
  outputStart: 20_000000000000000n, // 0.02 ETH
  outputEnd: 18_000000000000000n,
  decayStartTime: 1_000,
  decayEndTime: 2_000,
};

describe("dutchAuctionPhase", () => {
  it("pre_decay before start", () => {
    expect(dutchAuctionPhase(1_000, 2_000, 999)).toBe("pre_decay");
  });
  it("decaying inside window", () => {
    expect(dutchAuctionPhase(1_000, 2_000, 1_500)).toBe("decaying");
  });
  it("finished at end", () => {
    expect(dutchAuctionPhase(1_000, 2_000, 2_000)).toBe("finished");
  });
  it("finished after end", () => {
    expect(dutchAuctionPhase(1_000, 2_000, 3_000)).toBe("finished");
  });
});

describe("evaluateDutchAuction", () => {
  it("accepts when edge fat vs ref in mid decay", () => {
    const r = evaluateDutchAuction({
      ...BASE,
      now: 1_500,
      refOutput: 22_000000000000000n,
      riskAllowed: true,
    });
    expect(r.phase).toBe("decaying");
    expect(r.edge.undefined).toBe(false);
    expect(r.edge.edgeBps).toBeGreaterThan(5);
    expect(r.decision.action).toBe("accept");
    expect(r.decision.reason).toBe("edge_ok");
  });

  it("rejects negative edge late in curve", () => {
    // Mildly underwater late: |edge| small so toxicity stays under maxToxicity
    // and the edge_negative branch is the reject reason.
    const r = evaluateDutchAuction({
      ...BASE,
      now: 1_900,
      refOutput: 18_100000000000000n,
      riskAllowed: true,
    });
    expect(r.edge.edgeBps).toBeLessThan(0);
    expect(r.decision.action).toBe("reject");
    expect(r.decision.reason).toBe("edge_negative");
  });

  it("waits on negative edge early in curve", () => {
    const r = evaluateDutchAuction({
      ...BASE,
      now: 1_100,
      refOutput: 15_000000000000000n,
      riskAllowed: true,
    });
    expect(r.decayProgressBps).toBeLessThan(2000);
    expect(r.decision.action).toBe("wait");
    expect(r.decision.reason).toBe("edge_negative_wait_decay");
  });

  it("fail-closed when ref is zero", () => {
    const r = evaluateDutchAuction({
      ...BASE,
      now: 1_500,
      refOutput: 0n,
      riskAllowed: true,
    });
    expect(r.edge.undefined).toBe(true);
    expect(r.decision.action).toBe("reject");
    expect(r.decision.reason).toBe("edge_undefined");
  });

  it("rejects when risk blocks", () => {
    const r = evaluateDutchAuction({
      ...BASE,
      now: 1_500,
      refOutput: 22_000000000000000n,
      riskAllowed: false,
      riskReason: "exceeds_max_position_size",
    });
    expect(r.decision.action).toBe("reject");
    expect(r.decision.reason).toBe("exceeds_max_position_size");
  });

  it("resolves start amounts in pre_decay", () => {
    const r = evaluateDutchAuction({
      ...BASE,
      now: 500,
      refOutput: 25_000000000000000n,
      riskAllowed: true,
    });
    expect(r.phase).toBe("pre_decay");
    expect(r.resolved.output).toBe(BASE.outputStart);
    expect(r.resolved.input).toBe(BASE.inputStart);
    expect(r.decayProgressBps).toBe(0);
  });

  it("resolves end amounts when finished", () => {
    const r = evaluateDutchAuction({
      ...BASE,
      now: 2_500,
      refOutput: 25_000000000000000n,
      riskAllowed: true,
    });
    expect(r.phase).toBe("finished");
    expect(r.resolved.output).toBe(BASE.outputEnd);
    expect(r.decayProgressBps).toBe(10000);
  });
});
