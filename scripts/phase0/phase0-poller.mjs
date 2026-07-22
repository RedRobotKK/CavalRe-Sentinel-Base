#!/usr/bin/env node
/**
 * Phase 0 — Market Reality Check
 * Continuous observation of open UniswapX Dutch_V3 orders on Base.
 *
 * No strategy. No risk. No capital. Pure measurement.
 *
 * Usage:
 *   node scripts/phase0/phase0-poller.mjs [--interval 15] [--limit 100] [--dir journals/phase0]
 *   # or after npm script:
 *   npm run phase0
 *
 * Outputs:
 *   - JSONL event log (order_seen / order_update / order_gone / cycle_summary / error)
 *   - Periodic human-readable summary on stdout
 *
 * TRUST: UniswapX public orders API + Base deployments.
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  pairKey,
  sizeBucket,
  survivalFlags,
  upsertTracked,
  detectGone,
  summarizeLive,
  BASE_USDC,
  BASE_WETH,
} from "./market-metrics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const INTERVAL_SEC = Number(flag("interval", "15"));
const POLL_LIMIT = Number(flag("limit", "100"));
const JOURNAL_DIR = flag("dir", "journals/phase0");
const CHAIN_ID = 8453;
const ORDER_TYPE = "Dutch_V3";
const ORDERS_URL = "https://api.uniswap.org/v2/orders";

// ─── State ──────────────────────────────────────────────────────────────────
const live = new Map(); // orderHash → TrackedOrder
let previousHashes = new Set();
let cycles = 0;
let totalSeen = 0;
let totalGone = 0;
let totalExclusive = 0;
let running = true;

const survivalStats = {
  reached30: 0,
  reached50: 0,
  reached80: 0,
  finished: 0,
  totalGoneWithDecay: 0,
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const journalPath = join(JOURNAL_DIR, `phase0-base-dutchv3-${stamp()}.jsonl`);

async function ensureDir() {
  await mkdir(JOURNAL_DIR, { recursive: true });
}

async function appendEvent(event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
  await appendFile(journalPath, line, "utf8");
}

// ─── Fetch ──────────────────────────────────────────────────────────────────
async function fetchOpenOrders() {
  const url = new URL(ORDERS_URL);
  url.searchParams.set("chainId", String(CHAIN_ID));
  url.searchParams.set("orderStatus", "open");
  url.searchParams.set("orderType", ORDER_TYPE);
  url.searchParams.set("limit", String(POLL_LIMIT));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }
  const body = await res.json();
  const rawList = Array.isArray(body.orders) ? body.orders : [];
  return { rawList, requestUrl: url.toString() };
}

/**
 * Minimal wire → snapshot mapping.
 * Tolerant of both flat and cosignerData shapes (same as parse.ts).
 */
function toSnapshot(raw, nowSec) {
  if (!raw || typeof raw !== "object") return null;
  const w = raw;
  const input = w.input ?? {};
  const outputs = Array.isArray(w.outputs) ? w.outputs : [];
  const out0 = outputs[0] ?? {};
  const cos = w.cosignerData ?? {};

  const orderHash = typeof w.orderHash === "string" ? w.orderHash : null;
  if (!orderHash) return null;

  const inputToken = typeof input.token === "string" ? input.token : null;
  const outputToken = typeof out0.token === "string" ? out0.token : null;
  if (!inputToken || !outputToken) return null;

  const pick = (obj, keys) => {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return String(obj[k]);
    }
    return "0";
  };

  const decayStartTime =
    typeof w.decayStartTime === "number"
      ? w.decayStartTime
      : typeof cos.decayStartTime === "number"
        ? cos.decayStartTime
        : null;
  const decayEndTime =
    typeof w.decayEndTime === "number"
      ? w.decayEndTime
      : typeof cos.decayEndTime === "number"
        ? cos.decayEndTime
        : null;

  const exclusiveFiller =
    typeof w.exclusiveFiller === "string"
      ? w.exclusiveFiller
      : typeof cos.exclusiveFiller === "string"
        ? cos.exclusiveFiller
        : null;

  return {
    orderHash,
    inputToken,
    outputToken,
    inputStart: pick(input, ["startAmount", "start_amount", "amount", "start"]),
    inputEnd: pick(input, ["endAmount", "end_amount", "amount", "end"]),
    outputStart: pick(out0, ["startAmount", "start_amount", "amount", "start"]),
    outputEnd: pick(out0, ["endAmount", "end_amount", "amount", "end"]),
    decayStartTime,
    decayEndTime,
    exclusiveFiller,
    orderType: typeof w.orderType === "string" ? w.orderType : typeof w.type === "string" ? w.type : ORDER_TYPE,
    createdAt: typeof w.createdAt === "number" ? w.createdAt : null,
    observedAt: nowSec,
  };
}

// ─── Cycle ──────────────────────────────────────────────────────────────────
async function cycle() {
  const nowSec = Math.floor(Date.now() / 1000);
  let rawList = [];
  let fetchError = undefined;
  let requestUrl = "";

  try {
    const result = await fetchOpenOrders();
    rawList = result.rawList;
    requestUrl = result.requestUrl;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const currentHashes = new Set();
  let newOrders = 0;

  for (const raw of rawList) {
    const snap = toSnapshot(raw, nowSec);
    if (!snap) continue;

    currentHashes.add(snap.orderHash);
    const { isNew, tracked } = upsertTracked(live, snap);

    if (isNew) {
      newOrders += 1;
      totalSeen += 1;
      if (snap.exclusiveFiller) totalExclusive += 1;

      await appendEvent({
        kind: "order_seen",
        orderHash: snap.orderHash,
        pair: pairKey(snap.inputToken, snap.outputToken),
        sizeBucket: sizeBucket(snap.inputToken, snap.inputStart, snap.outputToken, snap.outputStart),
        exclusive: Boolean(snap.exclusiveFiller),
        decayProgressBps: tracked.firstDecayProgressBps,
        inputToken: snap.inputToken,
        outputToken: snap.outputToken,
        inputStart: snap.inputStart,
        outputStart: snap.outputStart,
        decayStartTime: snap.decayStartTime,
        decayEndTime: snap.decayEndTime,
        exclusiveFiller: snap.exclusiveFiller,
        orderType: snap.orderType,
        createdAt: snap.createdAt,
      });
    } else {
      if (tracked.lastDecayProgressBps - tracked.firstDecayProgressBps >= 2000) {
        await appendEvent({
          kind: "order_update",
          orderHash: snap.orderHash,
          decayProgressBps: tracked.lastDecayProgressBps,
          maxDecayProgressBps: tracked.maxDecayProgressBps,
          observationCount: tracked.observationCount,
        });
      }
    }
  }

  // Disappeared orders
  const goneHashes = detectGone(previousHashes, currentHashes);
  for (const h of goneHashes) {
    const tracked = live.get(h);
    if (tracked) {
      const flags = survivalFlags(tracked, nowSec);
      totalGone += 1;
      if (tracked.maxDecayProgressBps >= 0) {
        survivalStats.totalGoneWithDecay += 1;
        if (flags.reached30) survivalStats.reached30 += 1;
        if (flags.reached50) survivalStats.reached50 += 1;
        if (flags.reached80) survivalStats.reached80 += 1;
        if (flags.finished) survivalStats.finished += 1;
      }

      await appendEvent({
        kind: "order_gone",
        orderHash: h,
        pair: pairKey(tracked.inputToken, tracked.outputToken),
        sizeBucket: sizeBucket(
          tracked.inputToken,
          tracked.inputStart,
          tracked.outputToken,
          tracked.outputStart
        ),
        exclusive: Boolean(tracked.exclusiveFiller),
        ...flags,
        firstSeenAt: tracked.firstSeenAt,
        lastSeenAt: tracked.lastSeenAt,
        observationCount: tracked.observationCount,
      });

      live.delete(h);
    }
  }

  previousHashes = currentHashes;
  cycles += 1;

  const summary = summarizeLive(
    live,
    cycles,
    rawList.length,
    newOrders,
    goneHashes.length,
    fetchError
  );

  await appendEvent({ kind: "cycle_summary", ...summary, requestUrl });

  const survivalPct = (n) =>
    survivalStats.totalGoneWithDecay > 0
      ? ((n / survivalStats.totalGoneWithDecay) * 100).toFixed(1) + "%"
      : "n/a";

  console.log(
    JSON.stringify({
      ts: summary.ts,
      cycle: cycles,
      raw: rawList.length,
      live: live.size,
      new: newOrders,
      gone: goneHashes.length,
      exclusiveLive: summary.exclusiveLive,
      size: summary.sizeBuckets,
      decay: summary.decayBuckets,
      lifetime: {
        totalSeen,
        totalGone,
        survival30: survivalPct(survivalStats.reached30),
        survival50: survivalPct(survivalStats.reached50),
        survival80: survivalPct(survivalStats.reached80),
        finished: survivalPct(survivalStats.finished),
      },
      error: fetchError ?? null,
      journal: journalPath,
    })
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
function shutdown(signal) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      message: `shutdown on ${signal}`,
      cycles,
      totalSeen,
      totalGone,
      survivalStats,
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
    message: "Phase 0 Market Reality Check — Base Dutch_V3",
    chainId: CHAIN_ID,
    orderType: ORDER_TYPE,
    intervalSec: INTERVAL_SEC,
    pollLimit: POLL_LIMIT,
    journalPath,
    knownTokens: { USDC: BASE_USDC, WETH: BASE_WETH },
  })
);

while (running) {
  try {
    await cycle();
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    );
    await appendEvent({
      kind: "error",
      message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    });
  }
  if (!running) break;
  await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
}
