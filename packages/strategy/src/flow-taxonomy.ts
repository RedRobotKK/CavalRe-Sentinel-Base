/**
 * Flow taxonomy — pure aggregation over journal records.
 * No I/O, no RPC. Input is already-parsed decision rows.
 */

export type FlowRecord = {
  kind?: string;
  reason?: string;
  ref?: string | null;
  ts?: string;
  context?: Record<string, unknown> | null;
};

export type FlowSummary = {
  n: number;
  heartbeats: number;
  decisions: number;
  accepts: number;
  rejects: number;
  waits: number;
  byClass: Record<string, number>;
  byPair: Record<string, number>;
  topReasons: { reason: string; n: number }[];
  exclusiveRateBps: number | null;
  uniqueAcceptRefs: number;
  edgeSample: {
    n: number;
    meanBps: number | null;
    minBps: number | null;
    maxBps: number | null;
  };
  flowMix: {
    publicDutch: number;
    exclusive: number;
    other: number;
  };
};

function isHeartbeat(r: FlowRecord): boolean {
  return r.reason === "cycle_heartbeat";
}

function isDecision(r: FlowRecord): boolean {
  if (isHeartbeat(r)) return false;
  if (r.kind === "quote_accepted" || r.kind === "quote_rejected") return true;
  if (r.kind === "info" && r.context?.policyAction === "wait") return true;
  return false;
}

function orderClass(r: FlowRecord): string {
  const c = r.context?.orderClass;
  return typeof c === "string" && c.length > 0 ? c : "?";
}

function pairKey(r: FlowRecord): string | null {
  const inn = r.context?.inputToken;
  const out = r.context?.outputToken;
  if (typeof inn !== "string" || typeof out !== "string") return null;
  if (!inn || !out) return null;
  return `${inn}→${out}`;
}

function parseEdge(r: FlowRecord): number | null {
  const raw = r.context?.edgeBps;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Summarize journal rows for research / go-no-go.
 * Heartbeats counted separately; exclusive rate is among classified decisions.
 */
export function summarizeFlow(records: FlowRecord[]): FlowSummary {
  let heartbeats = 0;
  let accepts = 0;
  let rejects = 0;
  let waits = 0;
  const byClass: Record<string, number> = {};
  const byPair: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const acceptRefs = new Set<string>();
  const edges: number[] = [];
  let publicDutch = 0;
  let exclusive = 0;
  let other = 0;

  for (const r of records) {
    if (isHeartbeat(r)) {
      heartbeats += 1;
      continue;
    }
    if (!isDecision(r)) continue;

    const oc = orderClass(r);
    byClass[oc] = (byClass[oc] ?? 0) + 1;

    if (oc === "dutch") publicDutch += 1;
    else if (oc === "exclusive") exclusive += 1;
    else other += 1;

    const action =
      (typeof r.context?.policyAction === "string"
        ? r.context.policyAction
        : null) ??
      (r.kind === "quote_accepted"
        ? "accept"
        : r.kind === "quote_rejected"
          ? "reject"
          : r.kind === "info"
            ? "wait"
            : null);

    if (action === "accept") {
      accepts += 1;
      if (r.ref) acceptRefs.add(r.ref);
    } else if (action === "wait") waits += 1;
    else rejects += 1;

    if (r.reason) {
      byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    }

    const pk = pairKey(r);
    if (pk) byPair[pk] = (byPair[pk] ?? 0) + 1;

    const e = parseEdge(r);
    if (e !== null) edges.push(e);
  }

  const decisions = accepts + rejects + waits;
  const classified = publicDutch + exclusive + other;
  const exclusiveRateBps =
    classified > 0 ? Math.round((exclusive * 10000) / classified) : null;

  const topReasons = Object.entries(byReason)
    .map(([reason, n]) => ({ reason, n }))
    .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));

  let meanBps: number | null = null;
  let minBps: number | null = null;
  let maxBps: number | null = null;
  if (edges.length > 0) {
    const sum = edges.reduce((a, b) => a + b, 0);
    meanBps = Math.round(sum / edges.length);
    minBps = Math.min(...edges);
    maxBps = Math.max(...edges);
  }

  return {
    n: records.length,
    heartbeats,
    decisions,
    accepts,
    rejects,
    waits,
    byClass,
    byPair,
    topReasons,
    exclusiveRateBps,
    uniqueAcceptRefs: acceptRefs.size,
    edgeSample: {
      n: edges.length,
      meanBps,
      minBps,
      maxBps,
    },
    flowMix: {
      publicDutch,
      exclusive,
      other,
    },
  };
}
