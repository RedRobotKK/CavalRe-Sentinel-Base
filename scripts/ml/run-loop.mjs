#!/usr/bin/env node
/**
 * One-command ML research loop.
 *
 *   npm run ml:loop
 *   npm run ml:loop -- --cycles 40 --no-simulate
 *
 * NEVER TRUST sim labels for live capital.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { journalToMatrix } from "./src/journal-adapter.js";
import { walkForward } from "./src/train-baseline.js";
import { featureNames } from "./src/features.js";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  if (fallback === true || fallback === false) return true;
  if (i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const CYCLES = Number(flag("cycles", "25"));
const SKIP_SIM = args.includes("--no-simulate");
const JOURNAL_DIR = flag("dir", "journals");
const OUT_DIR = flag("out", "journals/ml");

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit", shell: false });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}`));
    });
  });
}

console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    message: "ml:loop start",
    cycles: CYCLES,
    skipSimulate: SKIP_SIM,
    journalDir: JOURNAL_DIR,
  })
);

if (!SKIP_SIM) {
  await run("npx", ["tsx", "scripts/simulate-flow.mjs", "--cycles", String(CYCLES), "--dir", JOURNAL_DIR]);
}

await run("node", ["scripts/ml/sim-markout.mjs", "--dir", JOURNAL_DIR]);

const names = (await readdir(JOURNAL_DIR)).filter(
  (n) => n.startsWith("sim-") && n.endsWith(".jsonl")
);
const allRaw = [];
for (const n of names) {
  const text = await readFile(join(JOURNAL_DIR, n), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      allRaw.push(JSON.parse(t));
    } catch {
      /* skip */
    }
  }
}

const matrixResult = journalToMatrix(allRaw);

const coverage = {
  ts: new Date().toISOString(),
  kind: "ml_loop_coverage",
  simFiles: names.length,
  rawLines: allRaw.length,
  nLabeled: matrixResult.nLabeled,
  nUnlabeled: matrixResult.nUnlabeled,
  toxicRate: matrixResult.toxicRate,
  features: featureNames(),
};

console.log(JSON.stringify(coverage, null, 2));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "loop-coverage.json"), JSON.stringify(coverage, null, 2));

if (matrixResult.nLabeled < 50) {
  console.error(
    JSON.stringify({
      level: "warn",
      message: "not enough labeled rows for walk-forward",
      nLabeled: matrixResult.nLabeled,
      minimum: 50,
    })
  );
  process.exit(0);
}

const wf = walkForward(matrixResult.matrix, matrixResult.labels, 5);
const report = {
  ts: new Date().toISOString(),
  kind: "walk_forward_report",
  source: "ml:loop batch sim journals",
  nLabeled: matrixResult.nLabeled,
  toxicRate: matrixResult.toxicRate,
  folds: wf.folds,
  summary: wf.summary,
  interpretation: interpret(wf.summary),
  gate: {
    liveUseAllowed: false,
    reason: "sim labels only — require real residual AUC ≥ 0.65 + calibration",
  },
};

console.log(JSON.stringify(report, null, 2));
await writeFile(join(OUT_DIR, "loop-walkforward.json"), JSON.stringify(report, null, 2));

function interpret(s) {
  if (s.meanAuc < 0.55) return "NO_SIGNAL on sim batch";
  if (s.meanAuc < 0.65) return "WEAK — soft prior candidate only after real residual validation";
  if (s.meanAuc < 0.78) return "MODERATE on sim — still blocked for live until real labels confirm";
  return "STRONG on sim — still blocked for live until real residual gates pass";
}

console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    message: "ml:loop done",
    nLabeled: matrixResult.nLabeled,
    meanAuc: wf.summary.meanAuc,
    liveUseAllowed: false,
  })
);
