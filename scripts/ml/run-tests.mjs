#!/usr/bin/env node
import { extractFeatures, toVector, featureNames, pairBucket, hourEncoding } from "./src/features.js";
import { generateDataset } from "./src/synthetic.js";
import { fitLogistic, predictProba, aucScore, walkForward } from "./src/train-baseline.js";
import { normalizeRecord, journalToMatrix } from "./src/journal-adapter.js";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; process.stdout.write(`  ✓ ${msg}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${msg}\n`); }
}
function assertEq(a, b, msg) { assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

console.log("features");
{
  const rec = {
    notionalUsd: 150,
    decayProgressBps: 4500,
    edgeBpsVsAmm: 12,
    exclusive: false,
    observedAt: 1_700_000_000,
    inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    outputToken: "0x4200000000000000000000000000000000000006",
  };
  const f = extractFeatures(rec);
  assert(f !== null, "extractFeatures returns object");
  assert(f.log_notional_usd > 0, "log_notional positive");
  assertEq(f.decay_progress_bps, 4500, "decay");
  assertEq(f.is_exclusive, 0, "exclusive false → 0");
  assertEq(toVector(f).length, featureNames().length, "vector length matches names");
  assertEq(pairBucket(rec.inputToken, rec.outputToken), 0, "usdc_weth bucket");
}

console.log("\nhourEncoding");
{
  const h0 = hourEncoding(0);
  assert(Math.abs(h0.hour_sin) < 1e-9, "hour 0 sin ~ 0");
  assert(Math.abs(h0.hour_cos - 1) < 1e-9, "hour 0 cos ~ 1");
}

console.log("\nsynthetic");
{
  const ds = generateDataset(200, 7);
  assert(ds.n === 200, "n=200");
  assert(ds.toxicRate > 0.1 && ds.toxicRate < 0.9, "toxic rate in (0.1,0.9)");
  assert(ds.matrix[0].length === featureNames().length, "matrix width");
  assert(ds.labels.every((y) => y === 0 || y === 1), "labels binary");
}

console.log("\nlogistic + auc");
{
  const X = [[0], [0.1], [0.2], [0.8], [0.9], [1.0]];
  const y = [0, 0, 0, 1, 1, 1];
  const model = fitLogistic(X, y, { epochs: 300, lr: 0.2, l2: 0.001 });
  const proba = predictProba(model, X);
  const auc = aucScore(y, proba);
  assert(auc > 0.9, `toy AUC > 0.9 (got ${auc.toFixed(3)})`);
}

console.log("\nwalkForward on synthetic");
{
  const ds = generateDataset(400, 99);
  const res = walkForward(ds.matrix, ds.labels, 4);
  assert(res.folds.length >= 2, "at least 2 folds");
  assert(res.summary.meanAuc > 0.55, `meanAuc > 0.55 on synthetic (got ${res.summary.meanAuc})`);
}

console.log("\njournal-adapter");
{
  const syn = {
    notionalUsd: 120,
    decayProgressBps: 6000,
    edgeBpsVsAmm: -20,
    exclusive: false,
    observedAt: 1700000000,
    inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    outputToken: "0x4200000000000000000000000000000000000006",
    markout2mBps: -40,
  };
  const n1 = normalizeRecord(syn);
  assert(n1 !== null, "normalize synthetic");
  assertEq(n1.toxic, 1, "toxic from markout2m ≤ -30");

  const desk = {
    kind: "quote_accepted",
    ref: "0xabc",
    context: {
      edgeBps: "15",
      decayProgressBps: "3000",
      inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      policyAction: "accept",
    },
    amount: "100000000",
  };
  const n2 = normalizeRecord(desk);
  assert(n2 !== null, "normalize desk record");
  assert(n2.notionalUsd > 50 && n2.notionalUsd < 150, "USDC notional ~100");

  const mat = journalToMatrix([syn, desk, { garbage: true }]);
  assert(mat.nLabeled >= 1, "at least one labeled");
  assert(mat.nUnlabeled >= 1, "desk without markout is unlabeled");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
