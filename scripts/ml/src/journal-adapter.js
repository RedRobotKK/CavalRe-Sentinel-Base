/**
 * Journal → feature/label adapter.
 *
 * Accepts records from:
 *   - Phase 0 market-check JSONL (order_seen / order_gone)
 *   - Dry-run / desk journals (quote_accepted / quote_rejected / info)
 *   - Synthetic residual records
 *
 * Fail-closed: returns null when required fields cannot be recovered.
 * NEVER TRUST — every mapped field is explicit.
 */

import { extractFeatures, toVector, featureNames } from "./features.js";

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH = "0x4200000000000000000000000000000000000006";

export function estimateNotionalUsd(rec) {
  if (Number.isFinite(Number(rec.notionalUsd))) return Number(rec.notionalUsd);
  if (Number.isFinite(Number(rec.notional_usd))) return Number(rec.notional_usd);

  const inTok = (rec.inputToken || rec.input_token || "").toLowerCase();
  const outTok = (rec.outputToken || rec.output_token || "").toLowerCase();
  const inAmt = Number(rec.inputStart || rec.resolvedInput || rec.amount || NaN);
  const outAmt = Number(rec.outputStart || rec.resolvedOutput || rec.amount2 || NaN);

  if (inTok === USDC && Number.isFinite(inAmt)) return inAmt / 1e6;
  if (outTok === USDC && Number.isFinite(outAmt)) return outAmt / 1e6;
  if (inTok === WETH && Number.isFinite(inAmt)) return (inAmt / 1e18) * 3000;
  if (outTok === WETH && Number.isFinite(outAmt)) return (outAmt / 1e18) * 3000;
  return null;
}

export function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;

  const ctx = raw.context && typeof raw.context === "object" ? raw.context : {};
  const merged = { ...ctx, ...raw };

  const notionalUsd = estimateNotionalUsd(merged);
  if (notionalUsd === null || notionalUsd <= 0) return null;

  const decay = Number(
    merged.decayProgressBps ??
      merged.decay_progress_bps ??
      merged.decayProgress ??
      NaN
  );
  const edge = Number(
    merged.edgeBps ??
      merged.edgeBpsVsAmm ??
      merged.edge_bps_vs_amm ??
      merged.edge ??
      NaN
  );

  if (!Number.isFinite(decay) && !Number.isFinite(edge)) return null;

  const exclusive =
    Boolean(merged.exclusive) ||
    Boolean(merged.exclusiveFiller) ||
    merged.is_exclusive === true ||
    merged.is_exclusive === 1;

  const observedAt = Number(
    merged.observedAt ??
      merged.observed_at ??
      merged.tsUnix ??
      (typeof merged.ts === "string" ? Date.parse(merged.ts) / 1000 : NaN) ??
      Date.now() / 1000
  );

  const toxic =
    merged.toxic === 1 || merged.toxic === true
      ? 1
      : merged.toxic === 0 || merged.toxic === false
        ? 0
        : Number.isFinite(Number(merged.markout2mBps))
          ? Number(merged.markout2mBps) <= -30
            ? 1
            : 0
          : null;

  return {
    orderHash: merged.orderHash || merged.ref || null,
    inputToken: merged.inputToken || merged.input_token || "",
    outputToken: merged.outputToken || merged.output_token || "",
    notionalUsd,
    decayProgressBps: Number.isFinite(decay) ? decay : 0,
    edgeBpsVsAmm: Number.isFinite(edge) ? edge : 0,
    exclusive,
    observedAt: Number.isFinite(observedAt) ? observedAt : Math.floor(Date.now() / 1000),
    markout30sBps: Number.isFinite(Number(merged.markout30sBps))
      ? Number(merged.markout30sBps)
      : null,
    markout2mBps: Number.isFinite(Number(merged.markout2mBps))
      ? Number(merged.markout2mBps)
      : null,
    toxic,
    policyAction: merged.policyAction || merged.kind || null,
    source: merged.source || "journal",
  };
}

export function journalToMatrix(rawLines) {
  const labeled = [];
  const unlabeled = [];
  const matrix = [];
  const labels = [];

  for (const raw of rawLines) {
    const rec = normalizeRecord(raw);
    if (!rec) continue;
    const feats = extractFeatures(rec);
    if (!feats) continue;
    const vec = toVector(feats);

    if (rec.toxic === 0 || rec.toxic === 1) {
      labeled.push(rec);
      matrix.push(vec);
      labels.push(rec.toxic);
    } else {
      unlabeled.push(rec);
    }
  }

  return {
    labeled,
    unlabeled,
    matrix,
    labels,
    names: featureNames(),
    nLabeled: labeled.length,
    nUnlabeled: unlabeled.length,
    toxicRate:
      labels.length === 0
        ? null
        : labels.reduce((a, b) => a + b, 0) / labels.length,
  };
}
