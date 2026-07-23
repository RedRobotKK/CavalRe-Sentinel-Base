#!/usr/bin/env node
/**
 * Offline sim markout labeler.
 *
 * For research/sim journals only. Does NOT call RPC.
 * Uses edge + decay to drive a residual-like toxicity process so every
 * quote_accepted becomes a labeled training row immediately.
 *
 * Real (live) journals must continue to use `npm run shadow-markout` (age-gated + RPC).
 *
 * Usage:
 *   node scripts/ml/sim-markout.mjs --dir journals
 *   node scripts/ml/sim-markout.mjs --file journals/sim-base-dutch-....jsonl
 *
 * NEVER TRUST these labels for live capital — pipeline verification only.
 */

import { readdir, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const JOURNAL_DIR = flag("dir", "journals");
const SINGLE = flag("file", null);
const WINDOW_SEC = Number(flag("window", "120"));

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng, mean, std) {
  const u = 1 - rng();
  const v = 1 - rng();
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std;
}

async function listTargets() {
  if (SINGLE) return [SINGLE];
  try {
    const names = await readdir(JOURNAL_DIR);
    return names
      .filter((n) => n.endsWith(".jsonl") && n.startsWith("sim-"))
      .map((n) => join(JOURNAL_DIR, n))
      .sort();
  } catch {
    return [];
  }
}

async function load(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function alreadyMarked(records, ref) {
  return records.some(
    (r) =>
      r.kind === "markout" &&
      r.ref === ref &&
      (r.markout?.windowSec === WINDOW_SEC ||
        r.context?.windowSec === String(WINDOW_SEC))
  );
}

function syntheticMarkoutBps(accept, rng) {
  const edge = Number(accept.context?.edgeBps ?? accept.edgeBps ?? 0);
  const decay = Number(accept.context?.decayProgressBps ?? 5000);
  const late = Math.min(1, Math.max(0, decay / 10000));
  const juicy = Math.min(1, Math.abs(edge) / 120);
  const pToxic = Math.min(
    0.85,
    0.12 + 0.4 * late + 0.3 * juicy + (edge < 0 ? 0.15 : 0)
  );
  const toxic = rng() < pToxic;
  if (toxic) return { bps: normal(rng, -48, 20), toxic: true };
  return { bps: normal(rng, 14, 15), toxic: false };
}

async function processFile(path) {
  const records = await load(path);
  const accepts = records.filter((r) => r.kind === "quote_accepted" && r.ref);
  let written = 0;
  let nextSeq = records.reduce((m, r) => Math.max(m, r.seq ?? 0), 0) + 1;
  const rng = mulberry32(path.split("").reduce((a, c) => a + c.charCodeAt(0), 0));

  for (const acc of accepts) {
    if (alreadyMarked(records, acc.ref)) continue;

    const { bps, toxic } = syntheticMarkoutBps(acc, rng);
    const markoutBps = Math.round(bps * 10) / 10;

    const row = {
      seq: nextSeq++,
      ts: new Date().toISOString(),
      version: 1,
      kind: "markout",
      reason: toxic ? "sim_toxic" : "sim_ok",
      ref: acc.ref,
      amount: acc.amount,
      markoutBps,
      markout: {
        markoutBps,
        windowSec: WINDOW_SEC,
        toxic,
        source: "sim_offline_v1",
      },
      context: {
        dryRun: true,
        simulated: true,
        stage: "sim_markout",
        windowSec: String(WINDOW_SEC),
        toxic,
        markoutBps,
        acceptTs: acc.ts ?? null,
        edgeBps: acc.context?.edgeBps ?? null,
        decayProgressBps: acc.context?.decayProgressBps ?? null,
        inputToken: acc.context?.inputToken ?? null,
        outputToken: acc.context?.outputToken ?? null,
        policyAction: "accept",
        orderClass: acc.context?.orderClass ?? null,
        note: "OFFLINE SIM LABEL — not for live capital",
      },
    };

    await appendFile(path, JSON.stringify(row) + "\n", "utf8");
    records.push(row);
    written += 1;

    console.log(
      JSON.stringify({
        file: path,
        ref: acc.ref,
        markoutBps,
        toxic,
        windowSec: WINDOW_SEC,
        source: "sim_offline_v1",
      })
    );
  }

  return { written, accepts: accepts.length };
}

const targets = await listTargets();
if (targets.length === 0) {
  console.error(
    JSON.stringify({
      level: "info",
      message: "no sim journals found",
      dir: JOURNAL_DIR,
      hint: "run: npm run simulate",
    })
  );
  process.exit(0);
}

console.error(
  JSON.stringify({
    level: "info",
    message: "sim-markout start (offline, no RPC)",
    files: targets.length,
    windowSec: WINDOW_SEC,
    warning: "labels are synthetic — pipeline verification only",
  })
);

let total = 0;
for (const f of targets) {
  const r = await processFile(f);
  total += r.written;
}

console.error(
  JSON.stringify({
    level: "info",
    message: "sim-markout done",
    labeled: total,
    files: targets.length,
  })
);
