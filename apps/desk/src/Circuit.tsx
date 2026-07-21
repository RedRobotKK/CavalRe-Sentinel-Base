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

const PATH = STAGES.map((s) => s.id);

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
  if (r?.kind === "info" && r?.context?.policyAction === "wait") return "policy";
  return "parse";
}

function build(records: any[]) {
  const drop: Record<StageId, number> = {
    poll: 0,
    parse: 0,
    classify: 0,
    decay: 0,
    edge: 0,
    risk: 0,
    policy: 0,
    book: 0,
  };
  const pass: Record<StageId, number> = { ...drop };

  let heartbeats = 0;
  let lastRaw = 0;
  let accept = 0;
  let wait = 0;
  let reject = 0;

  const byRef = new Map<string, IntentRow>();

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      heartbeats += 1;
      lastRaw = Number(r.context?.raw ?? lastRaw);
      // poll always "passes" as listen signal
      pass.poll += 1;
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
    const idx = PATH.indexOf(st);

    if (action === "reject") {
      drop[st] += 1;
      // passed every stage before drop
      for (let i = 0; i < idx; i++) pass[PATH[i]] += 1;
    } else {
      // accept or wait: passed full path through policy
      const end = action === "accept" ? PATH.length : PATH.indexOf("policy") + 1;
      for (let i = 0; i < end; i++) pass[PATH[i]] += 1;
      if (action === "accept") pass.book += 1;
    }

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

  const allIntents = [...byRef.values()];
  // passes first (accept/wait), then rejects
  const intents = [
    ...allIntents.filter((i) => i.action !== "reject"),
    ...allIntents.filter((i) => i.action === "reject"),
  ].slice(0, 16);

  const seen = accept + wait + reject;
  const signalsThrough = accept + wait; // non-terminal-reject outcomes

  const funnel = STAGES.map((s) => ({
    ...s,
    pass: pass[s.id],
    drop: drop[s.id],
    thru: pass[s.id] + drop[s.id],
  }));

  return {
    heartbeats,
    lastRaw,
    accept,
    wait,
    reject,
    seen,
    signalsThrough,
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
          <span className="pipe-hint">open channel idle — start VIEW harness</span>
        </div>
        <div className="pipe-empty">Listening… no journal signals yet.</div>
      </div>
    );
  }

  return (
    <div className="pipe panel-rise">
      <div className="pipe-head">
        <h2>Pipeline</h2>
        <div className="pipe-kpis">
          <span>
            <em>seen</em> {m.seen}
          </span>
          <span className="ok">
            <em>through</em> {m.signalsThrough}
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

      {/* pass-through emphasis */}
      <div className="pass-banner">
        <span className="pass-banner-label">signals through policy</span>
        <span className="pass-banner-n">{m.signalsThrough}</span>
        <span className="pass-banner-sub">
          accept {m.accept} · wait {m.wait} · dropped {m.reject}
        </span>
      </div>

      <div className="pipe-stages">
        {m.funnel.map((s, i) => (
          <div key={s.id} className="pipe-stage-wrap">
            <div
              className={`pipe-stage${s.pass > 0 ? " active" : ""}${s.drop > 0 ? " has-drop" : ""}`}
            >
              <div className="pipe-stage-name">{s.label}</div>
              <div className="pipe-stage-n pass">{s.pass}</div>
              <div className="pipe-stage-meta">
                <span className="pass-lbl">pass</span>
                {s.drop > 0 ? (
                  <span className="drop-lbl">−{s.drop}</span>
                ) : (
                  <span className="drop-lbl muted">−0</span>
                )}
              </div>
            </div>
            {i < m.funnel.length - 1 && <div className="pipe-arrow">→</div>}
          </div>
        ))}
      </div>

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

      <div className="pipe-table-wrap">
        <div className="pipe-table-head">
          <span>Intent signals</span>
          <span className="muted">pass rows first · {m.intents.length} shown</span>
        </div>
        <table className="pipe-table">
          <thead>
            <tr>
              <th>ts</th>
              <th>ref</th>
              <th>class</th>
              <th>stage</th>
              <th>signal</th>
              <th>edge</th>
              <th>reason</th>
            </tr>
          </thead>
          <tbody>
            {m.intents.map((it) => (
              <tr key={it.ref + it.ts + it.action} className={it.action}>
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
                  channel open — no order-level signals yet (empty book or parse-only)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
