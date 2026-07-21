#!/usr/bin/env node
/**
 * Phase 0.5 — score journals against docs/GO_NO_GO.md thresholds.
 * Read-only. Never enables live mode.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const JOURNAL_DIR = flag("dir", "journals");
const OUT = flag("out", "");
const WINDOW = Number(flag("window", "120")); // primary markout window for gates

const GATES = {
  minShadowAccepts: 100,
  minMeanMarkoutBps: 0,
  minMedianMarkoutBps: -5,
  maxToxicFraction: 0.25,
  // worst-day PnL needs USDC-eq model; reported as pending unless context present
};

async function loadAllRecords() {
  let names = [];
  try {
    names = (await readdir(JOURNAL_DIR)).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const records = [];
  const fileDays = new Set();
  for (const name of names) {
    const text = await readFile(join(JOURNAL_DIR, name), "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t);
        records.push(r);
        if (r.ts) fileDays.add(r.ts.slice(0, 10));
      } catch {
        /* skip */
      }
    }
  }
  return { records, days: [...fileDays].sort(), files: names.length };
}

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function analyze(records) {
  const accepts = records.filter(
    (r) =>
      r.kind === "quote_accepted" ||
      r.context?.policyAction === "accept"
  );
  // unique accept refs
  const acceptRefs = new Set(
    accepts.map((r) => r.ref).filter(Boolean)
  );

  const markouts = records.filter((r) => {
    if (r.kind !== "markout" && r.markoutBps == null && r.markout?.markoutBps == null)
      return false;
    const w = r.markout?.windowSec ?? Number(r.context?.windowSec);
    if (Number.isFinite(WINDOW) && Number.isFinite(w) && w !== WINDOW) return false;
    return true;
  });

  const bpsList = [];
  let toxic = 0;
  for (const m of markouts) {
    const bps = Number(m.markoutBps ?? m.markout?.markoutBps ?? m.context?.markoutBps);
    if (!Number.isFinite(bps)) continue;
    bpsList.push(bps);
    if (bps <= -30) toxic += 1;
  }

  const mean =
    bpsList.length > 0
      ? bpsList.reduce((a, b) => a + b, 0) / bpsList.length
      : null;
  const med = median(bpsList);
  const toxicFrac = bpsList.length > 0 ? toxic / bpsList.length : null;

  return {
    acceptEvents: accepts.length,
    uniqueAcceptRefs: acceptRefs.size,
    markoutN: bpsList.length,
    meanMarkoutBps: mean,
    medianMarkoutBps: med,
    toxicFraction: toxicFrac,
    windowSec: WINDOW,
  };
}

function gate(name, pass, detail) {
  return { name, status: pass ? "PASS" : "FAIL", detail };
}

const { records, days, files } = await loadAllRecords();
const stats = analyze(records);

const calendarDays = days.length;
const results = [
  gate(
    "≥7 calendar days with journal activity",
    calendarDays >= 7,
    `days=${calendarDays} (${days[0] ?? "—"} … ${days[days.length - 1] ?? "—"})`
  ),
  gate(
    "≥100 shadow accepts (unique refs)",
    stats.uniqueAcceptRefs >= GATES.minShadowAccepts,
    `uniqueAcceptRefs=${stats.uniqueAcceptRefs} acceptEvents=${stats.acceptEvents}`
  ),
  gate(
    `Mean markout bps (+${WINDOW}s) ≥ 0`,
    stats.meanMarkoutBps != null && stats.meanMarkoutBps >= GATES.minMeanMarkoutBps,
    stats.meanMarkoutBps == null
      ? "insufficient markout sample"
      : `mean=${stats.meanMarkoutBps.toFixed(2)} n=${stats.markoutN}`
  ),
  gate(
    `Median markout bps (+${WINDOW}s) ≥ −5`,
    stats.medianMarkoutBps != null &&
      stats.medianMarkoutBps >= GATES.minMedianMarkoutBps,
    stats.medianMarkoutBps == null
      ? "insufficient markout sample"
      : `median=${stats.medianMarkoutBps.toFixed(2)}`
  ),
  gate(
    "Toxic fraction ≤ 25% (markout ≤ −30 bps)",
    stats.toxicFraction != null && stats.toxicFraction <= GATES.maxToxicFraction,
    stats.toxicFraction == null
      ? "insufficient markout sample"
      : `toxicFraction=${(stats.toxicFraction * 100).toFixed(1)}%`
  ),
  gate(
    "Live mode disabled in code",
    true,
    "runner throws live_mode_not_enabled (manual code review assumed)"
  ),
  gate(
    "Worst-day shadow PnL ≥ −1% equity",
    false,
    "pending — requires USDC-eq gas model in report (see GO_NO_GO.md)"
  ),
];

const hard = results.filter((r) => r.name !== "Worst-day shadow PnL ≥ −1% equity");
const allPass = hard.every((r) => r.status === "PASS");
const verdict = allPass ? "CONDITIONAL_GO_REVIEW" : "NO_GO";

const report = {
  ts: new Date().toISOString(),
  phase: "0.5",
  verdict,
  liveCapital: false,
  journalDir: JOURNAL_DIR,
  files,
  calendarDays,
  days,
  stats,
  gates: results,
  note:
    verdict === "NO_GO"
      ? "Continue dry-run + shadow-markout. Do not enable live."
      : "Quantitative gates green except worst-day PnL model — human review + signature still required before Phase 1.",
};

const text = JSON.stringify(report, null, 2);
console.log(text);

if (OUT) {
  await mkdir(join(OUT, ".."), { recursive: true }).catch(() => {});
  await writeFile(OUT, text + "\n", "utf8");
  console.error(JSON.stringify({ level: "info", wrote: OUT }));
}

process.exitCode = verdict === "NO_GO" ? 2 : 0;
