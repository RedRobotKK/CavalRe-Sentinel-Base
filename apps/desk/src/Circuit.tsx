import { useMemo } from "react";

type StageId =
  | "poll"
  | "parse"
  | "classify"
  | "decay"
  | "edge"
  | "risk"
  | "policy"
  | "book";

const STAGES: { id: StageId; label: string }[] = [
  { id: "poll", label: "POLL" },
  { id: "parse", label: "PARSE" },
  { id: "classify", label: "CLASS" },
  { id: "decay", label: "DECAY" },
  { id: "edge", label: "EDGE" },
  { id: "risk", label: "RISK" },
  { id: "policy", label: "POLICY" },
  { id: "book", label: "BOOK" },
];

type IntentRow = {
  ref: string;
  action: "accept" | "reject" | "wait";
  reason: string;
  orderClass: string;
  edgeBps: string;
  tox: string;
  ts: string;
  stage: StageId;
};

function stageFrom(r: any): StageId {
  const stage = String(r?.context?.stage ?? "");
  if (stage === "parse") return "parse";
  if (stage === "classify") return "classify";
  if (stage === "resolve") return "decay";
  if (stage === "edge") return "edge";
  if (stage === "policy") return "policy";
  if (stage === "risk") return "risk";
  const reason = String(r?.reason ?? "");
  if (reason.startsWith("class_not_tradable")) return "classify";
  if (reason.includes("edge")) return "edge";
  if (reason.includes("toxicity") || reason.startsWith("risk")) return "risk";
  if (reason.includes("decay")) return "decay";
  if (r?.kind === "quote_accepted") return "book";
  return "parse";
}

function build(records: any[]) {
  const drops: Record<StageId, number> = {
    poll: 0,
    parse: 0,
    classify: 0,
    decay: 0,
    edge: 0,
    risk: 0,
    policy: 0,
    book: 0,
  };
  let heartbeats = 0;
  let lastRaw = 0;
  let accept = 0;
  let wait = 0;
  let reject = 0;

  // latest record per intent ref
  const byRef = new Map<string, IntentRow>();

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      heartbeats += 1;
      lastRaw = Number(r.context?.raw ?? lastRaw);
      continue;
    }

    const action =
      (r.context?.policyAction as IntentRow["action"]) ??
      (r.kind === "quote_accepted"
        ? "accept"
        : r.kind === "info"
          ? "wait"
          : "reject");

    if (action === "accept") accept += 1;
    else if (action === "wait") wait += 1;
    else reject += 1;

    const st = stageFrom(r);
    if (action === "reject") drops[st] += 1;

    const ref = String(r.ref ?? "");
    if (!ref) continue;

    byRef.set(ref, {
      ref: ref.slice(0, 14),
      action,
      reason: String(r.reason ?? "").slice(0, 48),
      orderClass: String(r.context?.orderClass ?? "—"),
      edgeBps:
        r.context?.edgeBps != null && r.context.edgeBps !== ""
          ? String(r.context.edgeBps)
          : "—",
      tox:
        r.context?.toxicity != null && r.context.toxicity !== ""
          ? String(r.context.toxicity)
          : "—",
      ts: r.ts?.slice(11, 19) ?? "—",
      stage: st,
    });
  }

  const intents = [...byRef.values()].slice(-12).reverse();
  const seen = accept + wait + reject;

  // funnel: surviving estimate
  const funnel = STAGES.map((s, i) => {
    const droppedHere = drops[s.id];
    let thru = seen;
    for (let j = 0; j < i; j++) {
      // rough: subtract prior drops from seen
    }
    // cumulative drop before this stage
    let lost = 0;
    for (let j = 0; j < i; j++) lost += drops[STAGES[j].id];
    thru = Math.max(0, seen - lost);
    return {
      ...s,
      thru: s.id === "poll" ? Math.max(seen, lastRaw, heartbeats) : thru,
      drop: droppedHere,
    };
  });

  return {
    heartbeats,
    lastRaw,
    accept,
    wait,
    reject,
    seen,
    funnel,
    intents,
    live: records.length > 0,
  };
}

export function Circuit({
  records,
  pulseKey: _pulseKey,
}: {
  records: any[];
  pulseKey: number;
}) {
  const m = useMemo(() => build(records), [records]);

  if (!m.live) {
    return (
      <div className="pipe panel-rise">
        <div className="pipe-head">
          <h2>Pipeline</h2>
          <span className="pipe-hint">waiting for VIEW journals or simulate…</span>
        </div>
        <div className="pipe-empty">
          No intent decisions yet. Dry-run polls UniswapX; simulate injects synthetic Dutch flow.
        </div>
      </div>
    );
  }

  return (
    <div className="pipe panel-rise">
      <div className="pipe-head">
        <h2>Pipeline</h2>
        <div className="pipe-kpis">
          <span>
            <em>intents</em> {m.seen}
          </span>
          <span>
            <em>raw</em> {m.lastRaw}
          </span>
          <span>
            <em>hb</em> {m.heartbeats}
          </span>
          <span className="ok">
            <em>A</em> {m.accept}
          </span>
          <span className="wait">
            <em>W</em> {m.wait}
          </span>
          <span className="bad">
            <em>R</em> {m.reject}
          </span>
        </div>
      </div>

      {/* Stage funnel — clean horizontal */}
      <div className="pipe-stages">
        {m.funnel.map((s, i) => (
          <div key={s.id} className="pipe-stage-wrap">
            <div
              className={`pipe-stage${s.drop > 0 ? " has-drop" : ""}${s.thru > 0 ? " active" : ""}`}
            >
              <div className="pipe-stage-name">{s.label}</div>
              <div className="pipe-stage-n">{s.thru}</div>
              {s.drop > 0 ? (
                <div className="pipe-stage-drop">−{s.drop}</div>
              ) : (
                <div className="pipe-stage-drop muted">—</div>
              )}
            </div>
            {i < m.funnel.length - 1 && <div className="pipe-arrow">→</div>}
          </div>
        ))}
      </div>

      {/* Outcomes */}
      <div className="pipe-outcomes">
        <div className="out ok">
          <span>ACCEPT</span>
          <strong>{m.accept}</strong>
        </div>
        <div className="out wait">
          <span>WAIT</span>
          <strong>{m.wait}</strong>
        </div>
        <div className="out bad">
          <span>REJECT</span>
          <strong>{m.reject}</strong>
        </div>
      </div>

      {/* Unique intents table */}
      <div className="pipe-table-wrap">
        <div className="pipe-table-head">
          <span>Intents</span>
          <span className="muted">{m.intents.length} unique refs</span>
        </div>
        <table className="pipe-table">
          <thead>
            <tr>
              <th>ts</th>
              <th>ref</th>
              <th>class</th>
              <th>stage</th>
              <th>action</th>
              <th>edge</th>
              <th>reason</th>
            </tr>
          </thead>
          <tbody>
            {m.intents.map((it) => (
              <tr key={it.ref + it.ts} className={it.action}>
                <td>{it.ts}</td>
                <td className="mono">{it.ref}</td>
                <td>{it.orderClass}</td>
                <td>{it.stage}</td>
                <td>
                  <span className={`tag ${it.action}`}>{it.action}</span>
                </td>
                <td>{it.edgeBps}</td>
                <td className="reason" title={it.reason}>
                  {it.reason}
                </td>
              </tr>
            ))}
            {m.intents.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  heartbeats only — no order-level decisions yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
