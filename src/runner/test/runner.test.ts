import { describe, it, expect, beforeEach } from "vitest";
import { toAmount } from "@cavalre/core";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import { BASE_CHAIN_ID, BASE_USDC, BASE_WETH } from "@cavalre/uniswapx-base";
import type { FetchFn } from "@cavalre/uniswapx-base";
import { VirtualBooks, LIVE_MODE_ERROR, type GoNoGoEvidence } from "@cavalre/strategy";
import { runCycle } from "../src/runner.js";

function mockFetch(body: unknown, status = 200): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function makeDutch(hash: string, inputStart: string, outputStart: string) {
  return {
    orderHash: hash,
    chainId: BASE_CHAIN_ID,
    orderStatus: "open",
    orderType: "Dutch_V2",
    decayStartTime: 0,
    decayEndTime: 1_000_000_000,
    input: {
      token: BASE_USDC,
      startAmount: inputStart,
      endAmount: inputStart,
    },
    outputs: [
      {
        token: BASE_WETH,
        startAmount: outputStart,
        endAmount: outputStart,
        recipient: "0x1234567890123456789012345678901234567890",
      },
    ],
  };
}

const FULL_GO: GoNoGoEvidence = {
  dryRunDaysGte7: true,
  shadowAcceptsGte100: true,
  meanMarkoutBpsGte0: true,
  medianMarkoutBpsGteNeg5: true,
  toxicFractionLte25pct: true,
  worstDayPnlWithinBound: true,
  noKeyLeakage: true,
  priorityPolicyOk: true,
  humanSignOff: true,
};

describe("runCycle (compliant dry-run)", () => {
  let risk: RiskEngine;
  let journal: DecisionJournal;

  beforeEach(() => {
    risk = new RiskEngine(defaultSmallCapitalConfig());
    journal = new DecisionJournal();
  });

  it("rejects without reference cost (edge must be computed)", async () => {
    const body = { orders: [makeDutch("0x1", "60000000", "1000000")] };
    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body), nowSec: 100 }
    );
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBeGreaterThan(0);
    const rej = journal.byKind("quote_rejected");
    expect(rej.some((r) => r.reason === "edge_undefined_no_reference_cost")).toBe(
      true
    );
  });

  it("accepts when edge, risk, and policy pass", async () => {
    const body = { orders: [makeDutch("0xgood", "60000000", "1000000")] };
    // ref higher than resolved output → positive edge
    const referenceCostFn = async () => 1_100_000n;

    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body), nowSec: 100, referenceCostFn }
    );

    expect(result.accepted).toBe(1);
    expect(result.mode).toBe("dry-run");
    const acc = journal.byKind("quote_accepted");
    expect(acc).toHaveLength(1);
    expect(acc[0].context?.edgeBps).toBeTruthy();
    expect(acc[0].context?.resolvedInput).toBe("60000000");
    expect(acc[0].context?.orderClass).toBe("dutch");
    expect(acc[0].context?.policyAction).toBe("accept");
  });

  it("classifies and rejects priority orders", async () => {
    const body = {
      orders: [
        {
          ...makeDutch("0xpri", "60000000", "1000000"),
          orderType: "PriorityOrder",
          decayStartTime: undefined,
          decayEndTime: undefined,
        },
      ],
    };
    const result = await runCycle(
      { risk, journal },
      {
        fetchFn: mockFetch(body),
        referenceCostFn: async () => 1n,
      }
    );
    expect(result.accepted).toBe(0);
    expect(
      journal.byKind("quote_rejected").some((r) =>
        (r.reason ?? "").includes("priority")
      )
    ).toBe(true);
  });

  it("rejects over max position using resolved size", async () => {
    const body = { orders: [makeDutch("0xbig", "90000000", "1000000")] };
    const result = await runCycle(
      { risk, journal },
      {
        fetchFn: mockFetch(body),
        nowSec: 100,
        referenceCostFn: async () => 2_000_000n,
      }
    );
    expect(result.accepted).toBe(0);
    expect(
      journal.byKind("quote_rejected").some(
        (r) => r.reason === "exceeds_max_position_size"
      )
    ).toBe(true);
  });

  it("refuses live mode without Go/No-Go evidence (Phase D gate)", async () => {
    await expect(
      runCycle({ risk, journal }, { mode: "live" })
    ).rejects.toThrow(LIVE_MODE_ERROR);
  });

  it("still refuses live when only partial evidence is set", async () => {
    await expect(
      runCycle(
        { risk, journal },
        { mode: "live", goNoGo: { ...FULL_GO, humanSignOff: false } }
      )
    ).rejects.toThrow(LIVE_MODE_ERROR);
  });

  it("allows live mode only when every Go/No-Go gate is true", async () => {
    // Live still needs a fetch; empty book is fine — gate is the point under test
    const result = await runCycle(
      { risk, journal },
      {
        mode: "live",
        goNoGo: FULL_GO,
        fetchFn: mockFetch({ orders: [] }),
      }
    );
    expect(result.mode).toBe("live");
    expect(result.rawCount).toBe(0);
  });

  it("short-circuits when halted", async () => {
    risk.recordLoss(toAmount("21000000"));
    const body = { orders: [makeDutch("0xany", "1000000", "1")] };
    const result = await runCycle(
      { risk, journal },
      { fetchFn: mockFetch(body), referenceCostFn: async () => 1n }
    );
    expect(result.halted).toBe(true);
    expect(result.accepted).toBe(0);
  });
});

describe("runCycle · Phase B VirtualBooks", () => {
  let risk: RiskEngine;
  let journal: DecisionJournal;
  let books: VirtualBooks;

  beforeEach(() => {
    risk = new RiskEngine(defaultSmallCapitalConfig());
    journal = new DecisionJournal();
    books = new VirtualBooks();
  });

  it("posts accept to VirtualBooks (debit output, credit input)", async () => {
    books.seed(BASE_WETH, 10_000_000n); // inventory to pay output
    const body = { orders: [makeDutch("0xbooks", "60000000", "1000000")] };
    const result = await runCycle(
      { risk, journal, virtualBooks: books },
      {
        fetchFn: mockFetch(body),
        nowSec: 100,
        referenceCostFn: async () => 1_100_000n,
      }
    );

    expect(result.accepted).toBe(1);
    const acc = journal.byKind("quote_accepted");
    expect(acc[0].context?.virtualBooks).toBe("posted");

    // Filler paid 1e6 WETH, received 60e6 USDC
    expect(books.balance(BASE_WETH)).toBe(9_000_000n);
    expect(books.balance(BASE_USDC)).toBe(60_000_000n);
    expect(result.booksSnapshot?.some((r) => r.root === BASE_WETH.toLowerCase())).toBe(
      true
    );
  });

  it("still journals accept when books cannot cover (research note)", async () => {
    // no seed → InsufficientBalance → policy reason exceeds_current_equity
    const body = { orders: [makeDutch("0xshort", "60000000", "1000000")] };
    const result = await runCycle(
      { risk, journal, virtualBooks: books },
      {
        fetchFn: mockFetch(body),
        nowSec: 100,
        referenceCostFn: async () => 1_100_000n,
      }
    );

    expect(result.accepted).toBe(1);
    const acc = journal.byKind("quote_accepted");
    expect(acc[0].context?.virtualBooks).toBe("exceeds_current_equity");
    expect(books.balance(BASE_WETH)).toBe(0n);
  });
});
