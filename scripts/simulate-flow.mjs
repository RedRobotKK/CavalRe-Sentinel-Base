#!/usr/bin/env node
/**
 * Simulate UniswapX order flow through the REAL decision path.
 *
 * - Does not call mainnet UniswapX API
 * - Does not broadcast txs or use keys
 * - Uses parse → classify → decay → edge → risk → policy → journal
 *
 * Usage:
 *   npm run simulate
 *   npm run simulate -- --cycles 20 --interval 2
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import { runCycle } from "@cavalre/runner";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const CYCLES = Number(flag("cycles", "15"));
const INTERVAL_SEC = Number(flag("interval", "2"));
const JOURNAL_DIR = flag("dir", "journals");
const EMPTY_EVERY = Number(flag("emptyEvery", "4")); // every Nth cycle: empty book

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

const risk = new RiskEngine(defaultSmallCapitalConfig());
const journal = new DecisionJournal();

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const journalPath = join(
  JOURNAL_DIR,
  `sim-base-dutch-${stamp()}.jsonl`
);

function makeDutch({ hash, edgeGood }) {
  const now = Math.floor(Date.now() / 1000);
  // input: fixed USDC in
  const inputStart = "1000000000"; // 1000 USDC 6dp
  const inputEnd = "1000000000";
  // output WETH 18dp — if edgeGood, resolved out is low vs ref
  const outStart = edgeGood ? "400000000000000000" : "500000000000000000"; // 0.4 / 0.5 ETH
  const outEnd = edgeGood ? "350000000000000000" : "450000000000000000";

  return {
    orderHash: hash,
    chainId: 8453,
    orderStatus: "open",
    type: "Dutch_V3",
    cosignerData: {
      decayStartTime: now - 30,
      decayEndTime: now + 600,
      exclusiveFiller: "0x0000000000000000000000000000000000000000",
    },
    deadline: now + 900,
    input: {
      token: USDC,
      startAmount: inputStart,
      endAmount: inputEnd,
    },
    outputs: [
      {
        token: WETH,
        startAmount: outStart,
        endAmount: outEnd,
        recipient: "0x0000000000000000000000000000000000000001",
      },
    ],
    createdAt: now - 60,
  };
}

function makePriority(hash) {
  const o = makeDutch({ hash, edgeGood: true });
  o.type = "Priority";
  o.orderType = "Priority";
  return o;
}

function makeExclusive(hash) {
  const o = makeDutch({ hash, edgeGood: true });
  o.cosignerData.exclusiveFiller = "0x1111111111111111111111111111111111111111";
  return o;
}

function scenarioOrders(cycle) {
  if (cycle % EMPTY_EVERY === 0) return [];

  const n = cycle + 1;
  const orders = [
    makeDutch({ hash: `0xsimdutch${n}a`.padEnd(66, "0"), edgeGood: true }),
    makeDutch({ hash: `0xsimdutch${n}b`.padEnd(66, "0"), edgeGood: false }),
    makePriority(`0xsimprio${n}`.padEnd(66, "0")),
    makeExclusive(`0xsimexcl${n}`.padEnd(66, "0")),
  ];
  // sometimes only one tradable
  if (cycle % 3 === 1) return orders.slice(0, 1);
  return orders;
}

function mockFetch(cycle) {
  return async (url) => {
    const orders = scenarioOrders(cycle);
    return {
      ok: true,
      status: 200,
      json: async () => ({ orders }),
      text: async () => JSON.stringify({ orders }),
    };
  };
}

/** Favorable ref so edgeGood orders can accept; tight for edgeBad. */
async function simReferenceCost(order, resolvedInput) {
  // ~0.45 ETH out for 1000 USDC → good edge vs 0.4 start out
  if (order.outputStart <= 400000000000000000n) {
    return 450000000000000000n;
  }
  // bad edge: ref below obligation
  return 420000000000000000n;
}

async function flushNew(prev) {
  const all = journal.all();
  const fresh = all.slice(prev);
  if (fresh.length === 0) return;
  const lines = fresh.map((r) => journal.recordToJSONLLine(r)).join("\n") + "\n";
  await appendFile(journalPath, lines, "utf8");
}

await mkdir(JOURNAL_DIR, { recursive: true });

console.error(
  JSON.stringify({
    level: "info",
    message: "simulate-flow start",
    cycles: CYCLES,
    intervalSec: INTERVAL_SEC,
    journalPath,
    note: "synthetic orders · real pipeline · not mainnet",
    liveCapital: false,
  })
);

for (let c = 1; c <= CYCLES; c++) {
  const before = journal.size();
  const result = await runCycle(
    { risk, journal },
    {
      pollLimit: 20,
      orderType: "Dutch_V3",
      fetchFn: mockFetch(c),
      referenceCostFn: simReferenceCost,
    }
  );

  journal.append({
    kind: "info",
    reason: "cycle_heartbeat",
    context: {
      dryRun: true,
      stage: "poll",
      simulated: true,
      orderType: "Dutch_V3",
      raw: String(result.rawCount),
      accepted: String(result.accepted),
      rejected: String(result.rejected),
      waited: String(result.waited),
      halted: result.halted,
      cycle: String(c),
    },
  });

  await flushNew(before);

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      sim: true,
      cycle: c,
      raw: result.rawCount,
      accepted: result.accepted,
      rejected: result.rejected,
      waited: result.waited,
      journalSize: journal.size(),
      file: journalPath,
    })
  );

  if (c < CYCLES) {
    await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
  }
}

console.error(
  JSON.stringify({
    level: "info",
    message: "simulate-flow done",
    journalPath,
    journalSize: journal.size(),
  })
);
