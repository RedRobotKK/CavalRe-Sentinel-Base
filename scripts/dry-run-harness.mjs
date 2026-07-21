#!/usr/bin/env node
/**
 * VIEW mode harness — Base MAINNET real sources, no signing.
 *
 * Sources:
 *   - UniswapX open Dutch_V3 orders (HTTPS)
 *   - Base RPC QuoterV2 eth_call (reference cost)
 *
 * Write mode requires wallet credentials + future live path (not here).
 * Simulations: use `npm run simulate` separately; same decision path.
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import {
  createUniswapV3ReferenceCost,
  DEFAULT_BASE_RPC,
  BASE_DEFAULT_ORDER_TYPE,
  UNISWAPX_ORDERS_URL,
} from "@cavalre/uniswapx-base";
import { runCycle } from "@cavalre/runner";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const INTERVAL_SEC = Number(flag("interval", "20"));
const POLL_LIMIT = Number(flag("limit", "50"));
const JOURNAL_DIR = flag("dir", "journals");
const ORDER_TYPE = flag("orderType", BASE_DEFAULT_ORDER_TYPE);
const RPC = process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC;

const risk = new RiskEngine(defaultSmallCapitalConfig());
const journal = new DecisionJournal();
const referenceCostFn = createUniswapV3ReferenceCost({ rpcUrl: RPC });

let running = true;
let cycles = 0;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const journalPath = join(JOURNAL_DIR, `dry-run-base-mainnet-${stamp()}.jsonl`);

async function ensureDir() {
  await mkdir(JOURNAL_DIR, { recursive: true });
}

async function flushNewRecords(prevSize) {
  const all = journal.all();
  const fresh = all.slice(prevSize);
  if (fresh.length === 0) return;
  const lines = fresh.map((r) => journal.recordToJSONLLine(r)).join("\n") + "\n";
  await appendFile(journalPath, lines, "utf8");
}

async function cycle() {
  const before = journal.size();
  try {
    const result = await runCycle(
      { risk, journal },
      {
        pollLimit: POLL_LIMIT,
        orderType: ORDER_TYPE,
        referenceCostFn,
      }
    );

    journal.append({
      kind: "info",
      reason: "cycle_heartbeat",
      context: {
        dryRun: true,
        mode: "view",
        stage: "poll",
        source: "uniswapx+base_rpc",
        orderType: ORDER_TYPE,
        raw: String(result.rawCount),
        accepted: String(result.accepted),
        rejected: String(result.rejected),
        waited: String(result.waited),
        halted: result.halted,
        cycle: String(cycles + 1),
        requestUrl: result.requestUrl ?? null,
      },
    });

    await flushNewRecords(before);
    cycles += 1;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        mode: "view",
        network: "base-mainnet",
        chainId: 8453,
        orderType: ORDER_TYPE,
        cycle: cycles,
        raw: result.rawCount,
        accepted: result.accepted,
        rejected: result.rejected,
        waited: result.waited,
        halted: result.halted,
        journalSize: journal.size(),
        file: journalPath,
        sources: { uniswapx: UNISWAPX_ORDERS_URL, rpc: RPC },
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        mode: "view",
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

function shutdown(signal) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      message: `shutdown on ${signal}, cycles=${cycles}`,
    })
  );
  running = false;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await ensureDir();
console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    message: "VIEW mode harness — real UniswapX + Base RPC, no signing",
    mode: "view",
    network: "base-mainnet",
    chainId: 8453,
    orderType: ORDER_TYPE,
    sources: {
      uniswapx: UNISWAPX_ORDERS_URL,
      rpc: RPC,
    },
    intervalSec: INTERVAL_SEC,
    pollLimit: POLL_LIMIT,
    journalPath,
    liveCapital: false,
    write: false,
  })
);

while (running) {
  await cycle();
  if (!running) break;
  await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
}
