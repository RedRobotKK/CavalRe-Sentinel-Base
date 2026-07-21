#!/usr/bin/env node
/**
 * Long-running dry-run harness for Base UniswapX.
 *
 * - Polls live open orders on Base (chainId 8453)
 * - Runs each cycle through RiskEngine + DecisionJournal
 * - Appends every decision as JSONL under ./journals/
 * - No private keys, no signing, no broadcast
 * - Graceful shutdown on SIGINT / SIGTERM
 *
 * Usage:
 *   node scripts/dry-run-harness.mjs
 *   node scripts/dry-run-harness.mjs --interval 15 --limit 30
 *
 * Requires: Node >= 22, dependencies installed (npm install)
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

const INTERVAL_SEC = Number(flag("interval", "20"));
const POLL_LIMIT = Number(flag("limit", "25"));
const JOURNAL_DIR = flag("dir", "journals");

const risk = new RiskEngine(defaultSmallCapitalConfig());
const journal = new DecisionJournal();

let running = true;
let cycles = 0;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const journalPath = join(JOURNAL_DIR, `dry-run-${stamp()}.jsonl`);

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
      { pollLimit: POLL_LIMIT }
    );
    await flushNewRecords(before);
    cycles += 1;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        cycle: cycles,
        raw: result.rawCount,
        accepted: result.accepted,
        rejected: result.rejected,
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
    message: "dry-run harness started",
    intervalSec: INTERVAL_SEC,
    pollLimit: POLL_LIMIT,
    journalPath,
  })
);

while (running) {
  await cycle();
  if (!running) break;
  await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
}
