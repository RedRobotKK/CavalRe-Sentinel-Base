#!/usr/bin/env node
/**
 * ML data flywheel — synthetic residual → features → walk-forward baseline.
 *
 * Usage (from repo root):
 *   npm run ml:pipeline
 *   node scripts/ml/run-pipeline.mjs --n 1000 --seed 7
 *
 * Verifies the entire path end-to-end with known ground-truth labels.
 * NEVER TRUST a model that has not printed the walk-forward report.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateDataset } from "./src/synthetic.js";
import { walkForward } from "./src/train-baseline.js";
import { featureNames } from "./src/features.js";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const N = Number(flag("n", "800"));
const SEED = Number(flag("seed", "42"));
const OUT_DIR = flag("dir", "journals/ml");

await mkdir(OUT_DIR, { recursive: true });

console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    message: "ML residual flywheel — generate → feature → walk-forward logistic",
    n: N,
    seed: SEED,
    featureVersion: "v1",
    features: featureNames(),
  })
);

const ds = generateDataset(N, SEED);

console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    message: "dataset ready",
    n: ds.n,
    toxicRate: Math.round(ds.toxicRate * 1000) / 1000,
  })
);

const recordsPath = join(OUT_DIR, `synthetic-residual-seed${SEED}-n${ds.n}.jsonl`);
const lines = ds.records.map((r) => JSON.stringify(r)).join("\n") + "\n";
await writeFile(recordsPath, lines, "utf8");

const csvHeader = [...featureNames(), "toxic"].join(",");
const csvRows = ds.matrix.map((row, i) => [...row, ds.labels[i]].join(","));
const csvPath = join(OUT_DIR, `features-seed${SEED}-n${ds.n}.csv`);
await writeFile(csvPath, [csvHeader, ...csvRows].join("\n") + "\n", "utf8");

const result = walkForward(ds.matrix, ds.labels, 5);

const report = {
  ts: new Date().toISOString(),
  kind: "walk_forward_report",
  featureVersion: "v1",
  n: ds.n,
  toxicRate: Math.round(ds.toxicRate * 1000) / 1000,
  recordsPath,
  csvPath,
  folds: result.folds,
  summary: result.summary,
  interpretation: interpret(result.summary),
};

console.log(JSON.stringify(report, null, 2));

await writeFile(
  join(OUT_DIR, `walkforward-seed${SEED}-n${ds.n}.json`),
  JSON.stringify(report, null, 2),
  "utf8"
);

function interpret(s) {
  if (s.meanAuc < 0.55) {
    return "NO_SIGNAL — features do not separate toxic vs non-toxic under this synthetic process. Check generator or feature set.";
  }
  if (s.meanAuc < 0.65) {
    return "WEAK — marginal discrimination. Usable only as a soft prior, not a hard gate.";
  }
  if (s.meanAuc < 0.78) {
    return "MODERATE — useful soft filter. Calibrate threshold on real residual before any live use.";
  }
  return "STRONG on synthetic — still requires real residual validation before any policy change.";
}
