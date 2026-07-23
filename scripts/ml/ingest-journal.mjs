#!/usr/bin/env node
/**
 * Ingest any Sentinel JSONL journal into the ML feature path.
 *
 * Usage:
 *   node scripts/ml/ingest-journal.mjs --file journals/some.jsonl
 *   node scripts/ml/ingest-journal.mjs --file journals/ml/synthetic-....jsonl --train
 *
 * If labeled rows exist and --train is passed, runs walk-forward and prints the report.
 * NEVER TRUST — only uses explicit fields; fails closed on garbage.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { journalToMatrix } from "./src/journal-adapter.js";
import { walkForward } from "./src/train-baseline.js";
import { featureNames } from "./src/features.js";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback === undefined ? null : fallback;
  if (fallback === true) return true;
  if (i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const FILE = flag("file");
const DO_TRAIN = args.includes("--train");
const OUT_DIR = flag("dir", "journals/ml");

if (!FILE) {
  console.error(
    JSON.stringify({
      error: "missing --file path/to/journal.jsonl",
      usage: "node scripts/ml/ingest-journal.mjs --file journals/xxx.jsonl [--train]",
    })
  );
  process.exit(1);
}

const text = await readFile(FILE, "utf8");
const rawLines = text
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

const result = journalToMatrix(rawLines);

const coverage = {
  ts: new Date().toISOString(),
  kind: "journal_ingest_coverage",
  file: FILE,
  rawLines: rawLines.length,
  nLabeled: result.nLabeled,
  nUnlabeled: result.nUnlabeled,
  toxicRate: result.toxicRate,
  features: featureNames(),
  sampleLabeled: result.labeled.slice(0, 3),
  sampleUnlabeled: result.unlabeled.slice(0, 3),
};

console.log(JSON.stringify(coverage, null, 2));

await mkdir(OUT_DIR, { recursive: true });
const stem = basename(FILE).replace(/\.jsonl$/i, "");
await writeFile(
  join(OUT_DIR, `ingest-${stem}-coverage.json`),
  JSON.stringify(coverage, null, 2),
  "utf8"
);

if (DO_TRAIN) {
  if (result.nLabeled < 50) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "not enough labeled rows for walk-forward",
        nLabeled: result.nLabeled,
        minimum: 50,
      })
    );
    process.exit(2);
  }

  const wf = walkForward(result.matrix, result.labels, 5);
  const report = {
    ts: new Date().toISOString(),
    kind: "walk_forward_report",
    source: FILE,
    nLabeled: result.nLabeled,
    toxicRate: result.toxicRate,
    folds: wf.folds,
    summary: wf.summary,
  };
  console.log(JSON.stringify(report, null, 2));
  await writeFile(
    join(OUT_DIR, `ingest-${stem}-walkforward.json`),
    JSON.stringify(report, null, 2),
    "utf8"
  );
}
