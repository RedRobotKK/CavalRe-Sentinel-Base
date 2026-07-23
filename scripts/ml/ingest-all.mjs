#!/usr/bin/env node
/**
 * Batch ingest: scan journals/ + journals/phase0, report coverage,
 * optionally walk-forward on all labeled rows combined.
 *
 *   npm run ml:ingest-all
 *   npm run ml:ingest-all -- --train
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { journalToMatrix } from "./src/journal-adapter.js";
import { walkForward } from "./src/train-baseline.js";
import { featureNames } from "./src/features.js";

const args = process.argv.slice(2);
const DO_TRAIN = args.includes("--train");
const OUT_DIR = "journals/ml";

async function listJsonl(dir, pred = () => true) {
  try {
    return (await readdir(dir))
      .filter((n) => n.endsWith(".jsonl") && pred(n))
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
}

const files = [
  ...(await listJsonl("journals", (n) => n.startsWith("sim-") || n.startsWith("dry-run"))),
  ...(await listJsonl("journals/phase0", (n) => n.startsWith("phase0-"))),
  ...(await listJsonl("journals/ml", (n) => n.startsWith("synthetic-"))),
].sort();

const allRaw = [];
const perFile = [];

for (const f of files) {
  let text;
  try {
    text = await readFile(f, "utf8");
  } catch {
    continue;
  }
  const lines = text
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

  const local = journalToMatrix(lines);
  perFile.push({
    file: f,
    rawLines: lines.length,
    nLabeled: local.nLabeled,
    nUnlabeled: local.nUnlabeled,
    toxicRate: local.toxicRate,
  });
  allRaw.push(...lines);
}

const combined = journalToMatrix(allRaw);

const report = {
  ts: new Date().toISOString(),
  kind: "ingest_all_coverage",
  filesScanned: files.length,
  perFile,
  combined: {
    rawLines: allRaw.length,
    nLabeled: combined.nLabeled,
    nUnlabeled: combined.nUnlabeled,
    toxicRate: combined.toxicRate,
    features: featureNames(),
  },
};

console.log(JSON.stringify(report, null, 2));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "ingest-all-coverage.json"), JSON.stringify(report, null, 2));

if (DO_TRAIN) {
  if (combined.nLabeled < 50) {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "not enough labeled rows for walk-forward",
        nLabeled: combined.nLabeled,
        minimum: 50,
      })
    );
    process.exit(0);
  }
  const wf = walkForward(combined.matrix, combined.labels, 5);
  const trainReport = {
    ts: new Date().toISOString(),
    kind: "walk_forward_report",
    source: "ml:ingest-all",
    nLabeled: combined.nLabeled,
    toxicRate: combined.toxicRate,
    folds: wf.folds,
    summary: wf.summary,
    gate: {
      liveUseAllowed: false,
      reason: "batch may include sim labels — real residual gates still required",
    },
  };
  console.log(JSON.stringify(trainReport, null, 2));
  await writeFile(join(OUT_DIR, "ingest-all-walkforward.json"), JSON.stringify(trainReport, null, 2));
}
