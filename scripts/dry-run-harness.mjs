#!/usr/bin/env node
/**
 * Base MAINNET dry-run harness (research book only).
 *
 * - Polls LIVE UniswapX open orders on Base (chainId 8453)
 * - Reference cost via Uniswap v3 QuoterV2 eth_call (BASE_RPC_URL)
 * - RiskEngine + FillPolicy + feature journal
 * - NO private keys, NO signing, NO broadcast
 * - Live capital remains disabled in runner
 *
 * Usage:
 *   export BASE_RPC_URL=https://mainnet.base.org   # or your provider
 *   npm run dry-run
 *   npm run dry-run -- --interval 15 --limit 30
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import { createUniswapV3ReferenceCost, DEFAULT_BASE_RPC } from "@cavalre/uniswapx-base";
import { runCycle } from "@cavalre/runner";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const INTERVAL_SEC = Number(flag("interval", "20"));
const POLL_LIMIT = Number(flag("limit", "25"));
const JOURNAL_DIR = flag("dir", "journals");
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
        referenceCostFn,
      }
    );
    await flushNewRecords(before);
    cycles += 1;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        network: "base-mainnet",
        chainId: 8453,
        cycle: cycles,
        raw: result.rawCount,
        accepted: result.accepted,
        rejected: result.rejected,
        waited: result.waited,
        halted: result.halted,
        journalSize: journal.size(),
        file: journalPath,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
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
    message: "base mainnet dry-run harness started",
    network: "base-mainnet",
    chainId: 8453,
    rpc: RPC,
    intervalSec: INTERVAL_SEC,
    pollLimit: POLL_LIMIT,
    journalPath,
    liveCapital: false,
  })
);

while (running) {
  await cycle();
  if (!running) break;
  await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
}
