/**
 * Synthetic residual Dutch order generator.
 * Produces orders that look like the thin residual left after pros.
 *
 * Ground-truth markout is generated from a simple toxicity process
 * so the training pipeline can be verified end-to-end.
 *
 * Seeded. Deterministic. NEVER TRUST unverified labels.
 */

import { extractFeatures, toVector, featureNames } from "./features.js";

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function normal(rng, mean, std) {
  const u = 1 - rng();
  const v = 1 - rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

/**
 * Generate one residual-like order with ground-truth markout.
 *
 * Toxicity process (simplified but explicit):
 *   base_toxic_prob rises with decay progress and extreme edge
 *   markout2m ~ Normal(-toxic_bias, 25) when toxic, else Normal(+8, 18)
 */
export function generateOne(rng, nowSec) {
  const sizeBucket = pick(rng, ["dust", "small", "small", "medium", "medium", "large"]);
  let notionalUsd;
  if (sizeBucket === "dust") notionalUsd = 20 + rng() * 30;
  else if (sizeBucket === "small") notionalUsd = 50 + rng() * 150;
  else if (sizeBucket === "medium") notionalUsd = 200 + rng() * 800;
  else notionalUsd = 1000 + rng() * 4000;

  const decayProgressBps = Math.floor(2000 + rng() * 7500);
  const exclusive = rng() < 0.08 ? 1 : 0;

  let edgeBpsVsAmm = normal(rng, 5, 40);
  if (rng() < 0.25) edgeBpsVsAmm = normal(rng, -30, 25);
  if (rng() < 0.15) edgeBpsVsAmm = normal(rng, 80, 30);

  const late = decayProgressBps / 10000;
  const juicy = Math.min(1, Math.abs(edgeBpsVsAmm) / 120);
  const pToxic = Math.min(0.85, 0.15 + 0.45 * late + 0.35 * juicy);
  const toxic = rng() < pToxic ? 1 : 0;

  let markout2mBps;
  if (toxic) markout2mBps = normal(rng, -45, 22);
  else markout2mBps = normal(rng, 12, 16);
  const markout30sBps = markout2mBps * 0.55 + normal(rng, 0, 12);

  const side = rng() < 0.55 ? "usdc_in" : "weth_in";
  const inputToken = side === "usdc_in" ? USDC : WETH;
  const outputToken = side === "usdc_in" ? WETH : USDC;

  return {
    orderHash: "0xsim" + Math.floor(rng() * 1e12).toString(16).padStart(12, "0"),
    inputToken,
    outputToken,
    notionalUsd: Math.round(notionalUsd * 100) / 100,
    decayProgressBps,
    edgeBpsVsAmm: Math.round(edgeBpsVsAmm * 10) / 10,
    exclusive: exclusive === 1,
    observedAt: nowSec - Math.floor(rng() * 3600),
    markout30sBps: Math.round(markout30sBps * 10) / 10,
    markout2mBps: Math.round(markout2mBps * 10) / 10,
    toxic,
    sizeBucket,
    source: "synthetic_residual_v1",
  };
}

export function generateDataset(n = 500, seed = 42) {
  const rng = mulberry32(seed);
  const nowSec = Math.floor(Date.now() / 1000);
  const records = [];
  const matrix = [];
  const labels = [];

  for (let i = 0; i < n; i++) {
    const rec = generateOne(rng, nowSec);
    const feats = extractFeatures(rec);
    if (!feats) continue;
    const vec = toVector(feats);
    records.push(rec);
    matrix.push(vec);
    labels.push(rec.toxic);
  }

  return {
    records,
    matrix,
    labels,
    names: featureNames(),
    featureVersion: "v1",
    n: records.length,
    toxicRate: labels.reduce((a, b) => a + b, 0) / labels.length,
  };
}
