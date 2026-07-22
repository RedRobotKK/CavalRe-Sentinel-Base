#!/usr/bin/env node
/**
 * VIEW mode — open channel on UniswapX + Base RPC. No signing.
 * Phase B: seeds VirtualBooks so accepts post inventory when edge passes.
 * Resilience: poller retries transient fetch; stdout shows drop reasons.
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DecisionJournal } from "@cavalre/journal";
import { RiskEngine, defaultSmallCapitalConfig } from "@cavalre/risk-engine";
import { VirtualBooks } from "@cavalre/strategy";
import {
  createUniswapV3ReferenceCost,
  DEFAULT_BASE_RPC,
  BASE_DEFAULT_ORDER_TYPE,
  UNISWAPX_ORDERS_URL,
  BASE_WETH,
  BASE_USDC,
} from "@cavalre/uniswapx-base";
import { runCycle } from "@cavalre/runner";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const INTERVAL_SEC = Number(flag("interval", "15"));
const POLL_LIMIT = Number(flag("limit", "50"));
const JOURNAL_DIR = flag("dir", "journals");
const ORDER_TYPE = flag("orderType", BASE_DEFAULT_ORDER_TYPE);
const RPC = process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC;

const risk = new RiskEngine(defaultSmallCapitalConfig());
const journal = new DecisionJournal();
const virtualBooks = new VirtualBooks();
virtualBooks.seed(BASE_WETH, 100_000000000000000000n);
virtualBooks.seed(BASE_USDC, 1_000_000_000000n);

const referenceCostFn = createUniswapV3ReferenceCost({ rpcUrl: RPC });

let running = true;
let cycles = 0;
let consecutiveFetchErrors = 0;

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

function recentDropReasons(limit = 8) {
  const rows = journal
    .all()
    .filter((r) => r.kind === "quote_rejected" || r.kind === "quote_accepted")
    .slice(-limit);
  return rows.map((r) => ({
    kind: r.kind,
    reason: r.reason,
    class: r.context?.orderClass ?? null,
    edgeBps: r.context?.edgeBps ?? null,
    ref: typeof r.ref === "string" ? r.ref.slice(0, 12) : null,
  }));
}

function errorDetail(err) {
  const parts = [];
  let cur = err;
  let d = 0;
  while (cur && d < 4) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else {
      parts.push(String(cur));
      break;
    }
    d += 1;
  }
  return parts.join(" | ");
}

async function cycle() {
  const before = journal.size();
  const t0 = performance.now();
  try {
    const result = await runCycle(
      { risk, journal, virtualBooks },
      {
        pollLimit: POLL_LIMIT,
        orderType: ORDER_TYPE,
        referenceCostFn,
      }
    );
    const latencyMs = Math.round(performance.now() - t0);
    consecutiveFetchErrors = 0;

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
        latencyMs: String(latencyMs),
        requestUrl: result.requestUrl ?? null,
        booksRows: result.booksSnapshot
          ? String(result.booksSnapshot.length)
          : "0",
      },
    });

    await flushNewRecords(before);
    cycles += 1;

    const line = {
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
      latencyMs,
      halted: result.halted,
      journalSize: journal.size(),
      file: journalPath,
    };

    if (result.rawCount > 0 || result.rejected > 0 || result.accepted > 0) {
      line.drops = recentDropReasons(12);
    }
    if (result.booksSnapshot) {
      line.books = result.booksSnapshot;
    }

    console.log(JSON.stringify(line));
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    consecutiveFetchErrors += 1;
    const detail = errorDetail(err);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        mode: "view",
        latencyMs,
        consecutiveFetchErrors,
        message: detail,
      })
    );
    journal.append({
      kind: "info",
      reason: "cycle_error",
      context: {
        dryRun: true,
        mode: "view",
        stage: "poll",
        latencyMs: String(latencyMs),
        consecutiveFetchErrors: String(consecutiveFetchErrors),
        error: detail.slice(0, 200),
      },
    });
    await flushNewRecords(before);
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
    message: "VIEW open channel — UniswapX + Base RPC",
    mode: "view",
    network: "base-mainnet",
    chainId: 8453,
    orderType: ORDER_TYPE,
    sources: { uniswapx: UNISWAPX_ORDERS_URL, rpc: RPC },
    intervalSec: INTERVAL_SEC,
    pollLimit: POLL_LIMIT,
    journalPath,
    liveCapital: false,
    booksSeed: virtualBooks.snapshot(),
  })
);

while (running) {
  await cycle();
  if (!running) break;
  // Back off harder after a streak of transport failures
  const extra =
    consecutiveFetchErrors >= 3
      ? Math.min(60, consecutiveFetchErrors * 5)
      : 0;
  await new Promise((r) => setTimeout(r, (INTERVAL_SEC + extra) * 1000));
}
