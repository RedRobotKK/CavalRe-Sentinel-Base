#!/usr/bin/env node
/**
 * Simulate UniswapX order flow through the REAL decision path.
 * Seeds VirtualBooks so quote_accepted posts inventory.
 *
 * V3 mode: cosigner carries decayStartBlock + piecewise curve.
 * currentBlock is fixed so resolvePath = v3_block in journals.
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import { VirtualBooks } from "@cavalre/strategy";
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
const EMPTY_EVERY = Number(flag("emptyEvery", "4"));

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

const IN_USDC = "50000000";
/** Start outputs — good stays under REF, bad above. */
const OUT_GOOD_START = "20000000000000000"; // 0.02 ETH
const OUT_BAD_START = "25000000000000000"; // 0.025 ETH
const REF_OUT = 22000000000000000n; // 0.022 ETH

/** Simulated Base head — mid-curve for open Dutch. */
const SIM_BLOCK = 1_000_010;
const DECAY_START = 1_000_000;
/** Exclusive window still open at SIM_BLOCK. */
const EXCL_DECAY_START = 1_000_100;

const risk = new RiskEngine(defaultSmallCapitalConfig());
const journal = new DecisionJournal();
const virtualBooks = new VirtualBooks();
virtualBooks.seed(WETH, 100_000000000000000000n);
virtualBooks.seed(USDC, 1_000_000_000000n);

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const journalPath = join(JOURNAL_DIR, `sim-base-dutch-${stamp()}.jsonl`);

function makeDutch({ hash, edgeGood }) {
  const now = Math.floor(Date.now() / 1000);
  const outStart = edgeGood ? OUT_GOOD_START : OUT_BAD_START;
  // Curve: by relative block 20, drop 10% of start (floor path via relativeAmounts)
  const drop = edgeGood ? "2000000000000000" : "2000000000000000";

  return {
    orderHash: hash,
    chainId: 8453,
    orderStatus: "open",
    type: "Dutch_V3",
    orderType: "Dutch_V3",
    cosignerData: {
      decayStartBlock: DECAY_START,
      exclusiveFiller: "0x0000000000000000000000000000000000000000",
      exclusivityOverrideBps: 0,
      relativeBlocks: [10, 40],
      relativeAmounts: [drop, String(BigInt(drop) * 2n)],
      // keep time fields as secondary fallback only
      decayStartTime: now - 120,
      decayEndTime: now + 480,
    },
    deadline: now + 900,
    input: {
      token: USDC,
      startAmount: IN_USDC,
      endAmount: IN_USDC,
    },
    outputs: [
      {
        token: WETH,
        startAmount: outStart,
        endAmount: outStart, // V3 obligation comes from curve, not endAmount
        recipient: "0x0000000000000000000000000000000000000001",
      },
    ],
    createdAt: now - 180,
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
  o.cosignerData.exclusiveFiller =
    "0x1111111111111111111111111111111111111111";
  o.cosignerData.decayStartBlock = EXCL_DECAY_START;
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
  if (cycle % 3 === 1) return orders.slice(0, 1);
  return orders;
}

function mockFetch(cycle) {
  return async () => {
    const orders = scenarioOrders(cycle);
    return {
      ok: true,
      status: 200,
      json: async () => ({ orders }),
      text: async () => JSON.stringify({ orders }),
    };
  };
}

async function simReferenceCost() {
  return REF_OUT;
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
    note: "synthetic Dutch_V3 block curve · real pipeline · VirtualBooks",
    simBlock: SIM_BLOCK,
    decayStartBlock: DECAY_START,
    liveCapital: false,
    booksSeed: virtualBooks.snapshot(),
  })
);

for (let c = 1; c <= CYCLES; c++) {
  const before = journal.size();
  const result = await runCycle(
    { risk, journal, virtualBooks },
    {
      pollLimit: 20,
      orderType: "Dutch_V3",
      fetchFn: mockFetch(c),
      referenceCostFn: simReferenceCost,
      currentBlock: SIM_BLOCK,
      skipBlockNumber: true,
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
      resolveClock: "v3_block",
      currentBlock: String(SIM_BLOCK),
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
      currentBlock: result.currentBlock ?? SIM_BLOCK,
      journalSize: journal.size(),
      file: journalPath,
      books: result.booksSnapshot ?? null,
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
    booksFinal: virtualBooks.snapshot(),
  })
);
