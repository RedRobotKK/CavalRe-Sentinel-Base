#!/usr/bin/env node
/**
 * Shadow markout labeler for research production (Phase 0.5).
 *
 * Usage:
 *   export BASE_RPC_URL=https://mainnet.base.org
 *   npm run shadow-markout
 *   npm run shadow-markout -- --windows 30,120
 *   npm run shadow-markout -- --window 120 --dir journals
 */

import { readdir, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { toAmount } from "@cavalre/core";
import { makeMarkoutAnnotation } from "@cavalre/journal";
import {
  createUniswapV3ReferenceCost,
  DEFAULT_BASE_RPC,
} from "@cavalre/uniswapx-base";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const JOURNAL_DIR = flag("dir", "journals");
const windowsRaw = flag("windows", "") || flag("window", "120");
const WINDOWS = windowsRaw
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const RPC = process.env.BASE_RPC_URL ?? DEFAULT_BASE_RPC;
const referenceCostFn = createUniswapV3ReferenceCost({ rpcUrl: RPC });

async function listJsonl() {
  try {
    const names = await readdir(JOURNAL_DIR);
    return names.filter((n) => n.endsWith(".jsonl")).sort();
  } catch {
    return [];
  }
}

async function loadAll(path) {
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

function alreadyMarked(records, ref, windowSec) {
  return records.some(
    (r) =>
      r.kind === "markout" &&
      r.ref === ref &&
      (r.markout?.windowSec === windowSec ||
        r.context?.windowSec === String(windowSec))
  );
}

function wireMarkout(seq, accept, annotation, markOut) {
  return {
    seq,
    ts: new Date().toISOString(),
    version: 1,
    kind: "markout",
    reason: annotation.toxic ? "shadow_toxic" : "shadow_ok",
    ref: accept.ref,
    amount: accept.amount,
    amount2: markOut.toString(),
    markout: annotation,
    markoutBps: annotation.markoutBps,
    context: {
      dryRun: true,
      stage: "shadow_markout",
      windowSec: String(annotation.windowSec),
      toxic: annotation.toxic,
      markoutBps: annotation.markoutBps,
      fillOutput: accept.context?.resolvedOutput ?? null,
      markOutput: markOut.toString(),
      inputToken: accept.context?.inputToken ?? null,
      outputToken: accept.context?.outputToken ?? null,
      policyAction: "accept",
      orderClass: accept.context?.orderClass ?? null,
    },
  };
}

async function processFile(name, windowSec) {
  const path = join(JOURNAL_DIR, name);
  const records = await loadAll(path);
  const accepts = records.filter((r) => r.kind === "quote_accepted" && r.ref);
  let written = 0;
  let nextSeq = records.reduce((m, r) => Math.max(m, r.seq ?? 0), 0) + 1;

  for (const acc of accepts) {
    if (alreadyMarked(records, acc.ref, windowSec)) continue;

    const resolvedIn = acc.context?.resolvedInput ?? acc.amount;
    const resolvedOut = acc.context?.resolvedOutput;
    const inputToken = acc.context?.inputToken;
    const outputToken = acc.context?.outputToken;
    if (!resolvedIn || !resolvedOut || !inputToken || !outputToken) continue;

    let fillOut;
    let inputAmt;
    try {
      fillOut = toAmount(resolvedOut);
      inputAmt = toAmount(resolvedIn);
    } catch {
      continue;
    }

    let markOut;
    try {
      markOut = await referenceCostFn({ inputToken, outputToken }, inputAmt);
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          ref: acc.ref,
          message: e instanceof Error ? e.message : String(e),
        })
      );
      continue;
    }

    if (markOut === 0n) {
      console.error(
        JSON.stringify({
          level: "warn",
          ref: acc.ref,
          message: "mark_quote_zero_skip",
        })
      );
      continue;
    }

    const annotation = makeMarkoutAnnotation({
      fillPrice: fillOut,
      markPrice: markOut,
      windowSec,
      toxicThresholdBps: 30,
    });

    const row = wireMarkout(nextSeq++, acc, annotation, markOut);
    await appendFile(path, JSON.stringify(row) + "\n", "utf8");
    records.push(row);
    written += 1;

    console.log(
      JSON.stringify({
        file: name,
        ref: acc.ref,
        markoutBps: annotation.markoutBps,
        toxic: annotation.toxic,
        windowSec,
      })
    );
  }

  return written;
}

const files = await listJsonl();
if (files.length === 0) {
  console.error(
    JSON.stringify({
      level: "info",
      message: "no journals found",
      dir: JOURNAL_DIR,
    })
  );
  process.exit(0);
}

if (WINDOWS.length === 0) WINDOWS.push(120);

console.error(
  JSON.stringify({
    level: "info",
    message: "shadow-markout start",
    rpc: RPC,
    windows: WINDOWS,
    files: files.length,
  })
);

let total = 0;
for (const w of WINDOWS) {
  for (const f of files) {
    total += await processFile(f, w);
  }
}

console.error(
  JSON.stringify({
    level: "info",
    message: "shadow-markout done",
    labeled: total,
    windows: WINDOWS,
  })
);
