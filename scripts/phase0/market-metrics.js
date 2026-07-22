/**
 * Phase 0 pure measurement helpers (plain JS).
 * No strategy, no risk, no capital — observation only.
 *
 * TRUST: decayProgressBps mirrors packages/strategy/src/dutch-decay.ts
 * and UniswapX DutchDecayLib semantics.
 */

export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
export const BASE_WETH = "0x4200000000000000000000000000000000000006".toLowerCase();

/** Progress through decay window in bps (0 = not started, 10000 = finished). */
export function decayProgressBps(decayStartTime, decayEndTime, now) {
  if (decayStartTime === null || decayEndTime === null) return -1;
  if (decayEndTime <= decayStartTime) return 10000;
  if (now <= decayStartTime) return 0;
  if (now >= decayEndTime) return 10000;
  return Math.floor(
    ((now - decayStartTime) * 10000) / (decayEndTime - decayStartTime)
  );
}

/** Canonical pair key (sorted lowercase tokens) for aggregation. */
export function pairKey(inputToken, outputToken) {
  const a = inputToken.toLowerCase();
  const b = outputToken.toLowerCase();
  return a < b ? `${a}/${b}` : `${b}/${a}`;
}

/**
 * Rough notional size bucket using known Base tokens.
 * USDC = 6 decimals, WETH = 18 decimals.
 */
export function sizeBucket(inputToken, inputStart, outputToken, outputStart) {
  const inTok = inputToken.toLowerCase();
  const outTok = outputToken.toLowerCase();

  if (inTok === BASE_USDC) return usdcBucket(inputStart);
  if (outTok === BASE_USDC) return usdcBucket(outputStart);
  if (inTok === BASE_WETH) return wethBucket(inputStart);
  if (outTok === BASE_WETH) return wethBucket(outputStart);
  return "exotic";
}

function usdcBucket(raw) {
  const n = Number(raw) / 1e6;
  if (!Number.isFinite(n)) return "exotic";
  if (n < 50) return "dust";
  if (n < 200) return "small";
  if (n < 1000) return "medium";
  return "large";
}

function wethBucket(raw) {
  const eth = Number(raw) / 1e18;
  if (!Number.isFinite(eth)) return "exotic";
  const usd = eth * 3000; // rough
  if (usd < 50) return "dust";
  if (usd < 200) return "small";
  if (usd < 1000) return "medium";
  return "large";
}

/** Survival flags at disappearance. */
export function survivalFlags(tracked, goneAt) {
  const max = tracked.maxDecayProgressBps;
  return {
    reached30: max >= 3000,
    reached50: max >= 5000,
    reached80: max >= 8000,
    finished: max >= 10000,
    maxProgressBps: max,
    lifetimeSec: Math.max(0, goneAt - tracked.firstSeenAt),
  };
}

/** Create or update a tracked order from a fresh snapshot. */
export function upsertTracked(map, snap) {
  const progress = decayProgressBps(
    snap.decayStartTime,
    snap.decayEndTime,
    snap.observedAt
  );
  const existing = map.get(snap.orderHash);

  if (!existing) {
    const tracked = {
      ...snap,
      firstSeenAt: snap.observedAt,
      lastSeenAt: snap.observedAt,
      firstDecayProgressBps: progress,
      lastDecayProgressBps: progress,
      maxDecayProgressBps: Math.max(0, progress),
      observationCount: 1,
    };
    map.set(snap.orderHash, tracked);
    return { isNew: true, tracked };
  }

  existing.lastSeenAt = snap.observedAt;
  existing.lastDecayProgressBps = progress;
  existing.maxDecayProgressBps = Math.max(existing.maxDecayProgressBps, progress);
  existing.observationCount += 1;
  existing.inputStart = snap.inputStart;
  existing.inputEnd = snap.inputEnd;
  existing.outputStart = snap.outputStart;
  existing.outputEnd = snap.outputEnd;
  existing.exclusiveFiller = snap.exclusiveFiller;
  return { isNew: false, tracked: existing };
}

/** Detect orders that disappeared between two observation sets. */
export function detectGone(previousHashes, currentHashes) {
  const gone = [];
  for (const h of previousHashes) {
    if (!currentHashes.has(h)) gone.push(h);
  }
  return gone;
}

export function emptySizeBuckets() {
  return { dust: 0, small: 0, medium: 0, large: 0, exotic: 0 };
}

export function summarizeLive(live, cycle, raw, newOrders, goneOrders, fetchError) {
  const sizeBuckets = emptySizeBuckets();
  const pairCounts = {};
  const decayBuckets = {
    pre: 0,
    early: 0,
    mid: 0,
    late: 0,
    finished: 0,
    unknown: 0,
  };
  let exclusiveLive = 0;

  for (const t of live.values()) {
    const bucket = sizeBucket(
      t.inputToken,
      t.inputStart,
      t.outputToken,
      t.outputStart
    );
    sizeBuckets[bucket] += 1;

    const pk = pairKey(t.inputToken, t.outputToken);
    pairCounts[pk] = (pairCounts[pk] ?? 0) + 1;

    if (t.exclusiveFiller) exclusiveLive += 1;

    const p = t.lastDecayProgressBps;
    if (p < 0) decayBuckets.unknown += 1;
    else if (p === 0) decayBuckets.pre += 1;
    else if (p < 3000) decayBuckets.early += 1;
    else if (p < 7000) decayBuckets.mid += 1;
    else if (p < 10000) decayBuckets.late += 1;
    else decayBuckets.finished += 1;
  }

  return {
    ts: new Date().toISOString(),
    cycle,
    raw,
    uniqueLive: live.size,
    newOrders,
    goneOrders,
    exclusiveLive,
    sizeBuckets,
    pairCounts,
    decayBuckets,
    fetchError,
  };
}
