import { describe, it, expect, beforeEach } from "vitest";
import { toAmount } from "@cavalre/core";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import { BASE_CHAIN_ID, BASE_USDC, BASE_WETH } from "@cavalre/uniswapx-base";
import type { FetchFn } from "@cavalre/uniswapx-base";
import { runCycle } from "../src/runner.js";

function mockFetch(body: unknown, status = 200): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function makeOrder(hash: string, inputStart: string) {
  return {
    orderHash: hash,
    chainId: BASE_CHAIN_ID,
    orderStatus: "open",
    orderType: "Dutch_V2",
    input: {
      token: BASE_USDC,
      startAmount: inputStart,
      endAmount: inputStart,
    },
    outputs: [
      {
        token: BASE_WETH,
        startAmount: "1000000000000000",
        endAmount: "990000000000000",
        recipient: "0x1234567890123456789012345678901234567890",
      },
    ],
  };
}

describe("runCycle (dry-run)", () => {
  let risk: RiskEngine;
  let journal: DecisionJournal;

  beforeEach(() => {
    risk = new RiskEngine(defaultSmallCapitalConfig());
    journal = new DecisionJournal();
  });

  it("defaults to dry-run and accepts orders within risk limits", async () => {
    const body = {
      orders: [
        makeOrder("0xsmall", "50000000"), // $50 < $80 max
      ],
    };

    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body) }
    );

    expect(result.mode).toBe("dry-run");
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.halted).toBe(false);
    expect(result.acceptedOrders).toHaveLength(1);

    const accepted = journal.byKind("quote_accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0].amount).toBe(toAmount("50000000"));
    expect(accepted[0].context?.dryRun).toBe(true);
  });

  it("rejects orders that exceed max position size", async () => {
    const body = {
      orders: [
        makeOrder("0xbig", "90000000"), // $90 > $80 max
      ],
    };

    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body) }
    );

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);

    const rejected = journal.byKind("quote_rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("exceeds_max_position_size");
  });

  it("journals parse rejections", async () => {
    const body = {
      orders: [
        { orderHash: "0xwrongchain", chainId: 1, orderStatus: "open" },
      ],
    };

    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body) }
    );

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    const rejected = journal.byKind("quote_rejected");
    expect(rejected[0].reason).toContain("wrong_chainId");
  });

  it("short-circuits when risk engine is already halted", async () => {
    risk.recordLoss(toAmount("21000000")); // trip daily loss
    expect(risk.isHalted()).toBe(true);

    const body = {
      orders: [makeOrder("0xany", "1000000")],
    };

    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body) }
    );

    expect(result.halted).toBe(true);
    expect(result.accepted).toBe(0);
    expect(journal.byKind("halt")).toHaveLength(1);
  });

  it("refuses live mode for now", async () => {
    await expect(
      runCycle({ risk, journal }, { mode: "live" })
    ).rejects.toThrow("live_mode_not_enabled");
  });
});
