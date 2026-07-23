#!/usr/bin/env node
import { extractFeatures, toVector, featureNames, pairBucket, hourEncoding } from "./src/features.js";
import { generateDataset } from "./src/synthetic.js";
import { fitLogistic, predictProba, aucScore, walkForward } from "./src/train-baseline.js";
import { normalizeRecord, journalToMatrix, joinMarkouts } from "./src/journal-adapter.js";
import { scoreSoftPrior, DISABLED_PRIOR, modelFromWeights, policyHint } from "./src/soft-prior.js";

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
    notionalUsd: 150, decayProgressBps: 4500, edgeBpsVsAmm: 12, exclusive: false,
    observedAt: 1_700_000_000,
    inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    outputToken: "0x4200000000000000000000000000000000000006",
  };
  const f = extractFeatures(rec);
  assert(f !== null, "extractFeatures returns object");
  assert(f.log_notional_usd > 0, "log_notional positive");
  assertEq(f.decay_progress_bps, 4500, "decay");
  assertEq(f.is_exclusive, 0, "exclusive false → 0");
  assertEq(toVector(f).length, featureNames().length, "vector length");
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
  assert(ds.toxicRate > 0.1 && ds.toxicRate < 0.9, "toxic rate band");
  assert(ds.labels.every((y) => y === 0 || y === 1), "labels binary");
}

console.log("\nlogistic + auc");
{
  const X = [[0], [0.1], [0.2], [0.8], [0.9], [1.0]];
  const y = [0, 0, 0, 1, 1, 1];
  const model = fitLogistic(X, y, { epochs: 300, lr: 0.2, l2: 0.001 });
  const auc = aucScore(y, predictProba(model, X));
  assert(auc > 0.9, `toy AUC > 0.9 (got ${auc.toFixed(3)})`);
}

console.log("\nwalkForward");
{
  const ds = generateDataset(400, 99);
  const res = walkForward(ds.matrix, ds.labels, 4);
  assert(res.folds.length >= 2, "≥2 folds");
  assert(res.summary.meanAuc > 0.55, `meanAuc > 0.55 (got ${res.summary.meanAuc})`);
}

console.log("\njournal-adapter");
{
  const syn = {
    notionalUsd: 120, decayProgressBps: 6000, edgeBpsVsAmm: -20, exclusive: false,
    observedAt: 1700000000,
    inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    outputToken: "0x4200000000000000000000000000000000000006",
    markout2mBps: -40,
  };
  assertEq(normalizeRecord(syn).toxic, 1, "toxic from markout");
  const desk = {
    kind: "quote_accepted", ref: "0xabc",
    context: { edgeBps: "15", decayProgressBps: "3000", inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    amount: "100000000",
  };
  assert(normalizeRecord(desk) !== null, "desk normalize");
  const joined = joinMarkouts([
    desk,
    { kind: "markout", ref: "0xabc", markoutBps: -55, markout: { toxic: true, windowSec: 120 } },
  ]);
  const mat = journalToMatrix(joined);
  assert(mat.nLabeled >= 1, "joined markout produces label");
}

console.log("\nsoft-prior");
{
  const disabled = scoreSoftPrior(DISABLED_PRIOR, { notionalUsd: 100, decayProgressBps: 5000, edgeBpsVsAmm: 10 });
  assertEq(disabled.opinion, "no_opinion", "disabled → no_opinion");
  assertEq(policyHint("likely_toxic"), "raise_edge_floor_or_wait", "toxic hint soft");
  assertEq(policyHint("likely_clean"), "no_change", "clean does not relax");
  const m = modelFromWeights([0.1, 0, 0, 0, 0, 0, 0], -1, { meanAuc: 0.7 });
  assertEq(m.enabled, false, "fromWeights still disabled");
  const scored = scoreSoftPrior({ ...m, enabled: true }, {
    notionalUsd: 200, decayProgressBps: 8000, edgeBpsVsAmm: -40, exclusive: false,
    observedAt: 1700000000,
    inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    outputToken: "0x4200000000000000000000000000000000000006",
  });
  assert(scored.pToxic !== null, "enabled returns pToxic");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
