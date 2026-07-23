#!/usr/bin/env node
/**
 * Export Phase 0 order_seen / order_gone events to CSV for analysis.
 *
 *   npm run phase0:csv
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const DIR = flag("dir", "journals/phase0");
const OUT = flag("out", DIR);

async function loadAll() {
  let names = [];
  try {
    names = (await readdir(DIR)).filter(
      (n) => n.startsWith("phase0-") && n.endsWith(".jsonl")
    );
  } catch {
    return [];
  }
  const rows = [];
  for (const n of names.sort()) {
    const text = await readFile(join(DIR, n), "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        rows.push(JSON.parse(t));
      } catch {
        /* skip */
      }
    }
  }
  return rows;
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, records) {
  const lines = [headers.join(",")];
  for (const r of records) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

const all = await loadAll();
const seen = all.filter((r) => r.kind === "order_seen");
const gone = all.filter((r) => r.kind === "order_gone");

const seenHeaders = [
  "ts", "orderHash", "pair", "sizeBucket", "notionalUsd", "exclusive",
  "decayProgressBps", "inputToken", "outputToken", "inputStart", "outputStart",
  "decayStartTime", "decayEndTime", "orderType",
];
const goneHeaders = [
  "ts", "orderHash", "pair", "sizeBucket", "exclusive", "lifetimeSec",
  "maxProgressBps", "reached30", "reached50", "reached80", "finished",
  "firstSeenAt", "lastSeenAt", "observationCount",
];

await mkdir(OUT, { recursive: true });
const seenPath = join(OUT, "residual-seen.csv");
const gonePath = join(OUT, "residual-gone.csv");
await writeFile(seenPath, toCsv(seenHeaders, seen));
await writeFile(gonePath, toCsv(goneHeaders, gone));

console.log(
  JSON.stringify(
    {
      ts: new Date().toISOString(),
      kind: "phase0_csv_export",
      seen: seen.length,
      gone: gone.length,
      seenPath,
      gonePath,
    },
    null,
    2
  )
);
