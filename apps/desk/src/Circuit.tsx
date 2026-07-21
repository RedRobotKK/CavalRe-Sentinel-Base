import { useEffect, useMemo, useState } from "react";

export type StageId =
  | "poll"
  | "parse"
  | "classify"
  | "decay"
  | "edge"
  | "risk"
  | "policy"
  | "journal";

const STAGES: { id: StageId; label: string; x: number }[] = [
  { id: "poll", label: "POLL", x: 48 },
  { id: "parse", label: "PARSE", x: 148 },
  { id: "classify", label: "CLASS", x: 248 },
  { id: "decay", label: "DECAY", x: 348 },
  { id: "edge", label: "EDGE", x: 448 },
  { id: "risk", label: "RISK", x: 548 },
  { id: "policy", label: "POLICY", x: 648 },
  { id: "journal", label: "BOOK", x: 748 },
];

const PATH: StageId[] = STAGES.map((s) => s.id);

type Packet = {
  id: number;
  t0: number;
  duration: number;
  kind: "heartbeat" | "decision";
};

type StageStat = {
  thru: number;
  drop: number;
  lastReason: string;
};

type Snapshot = {
  demo: boolean;
  stages: Record<StageId, StageStat>;
  accept: number;
  wait: number;
  reject: number;
  seen: number;
  heartbeats: number;
  lastRaw: number;
  lastEdge: string;
  lastTox: string;
  lastClass: string;
  lastAction: string;
  lastRef: string;
  lastReason: string;
  lastTs: string;
};

function stageFromRecord(r: any): StageId {
  const stage = String(r?.context?.stage ?? "");
  if (stage === "parse") return "parse";
  if (stage === "classify") return "classify";
  if (stage === "resolve") return "decay";
  if (stage === "edge") return "edge";
  if (stage === "policy" || stage === "risk") return "policy";
  if (stage === "shadow_markout" || stage === "poll") return stage === "poll" ? "poll" : "journal";
  const reason = String(r?.reason ?? "");
  if (reason === "invalid_amount_string" || reason.startsWith("input.") || reason.startsWith("output."))
    return "parse";
  if (reason.startsWith("class_not_tradable")) return "classify";
  if (reason.includes("decay")) return "decay";
  if (reason.includes("edge")) return "edge";
  if (reason.startsWith("risk") || reason.includes("toxicity")) return "risk";
  if (r?.kind === "quote_accepted" || r?.kind === "quote_rejected") return "policy";
  if (r?.reason === "cycle_heartbeat") return "poll";
  return "journal";
}

function emptyStages(): Record<StageId, StageStat> {
  return Object.fromEntries(
    PATH.map((id) => [id, { thru: 0, drop: 0, lastReason: "" }])
  ) as Record<StageId, StageStat>;
}

function computeSnapshot(records: any[]): Snapshot {
  if (!records || records.length === 0) {
    return DEMO_SNAPSHOT;
  }

  const stages = emptyStages();
  let accept = 0;
  let wait = 0;
  let reject = 0;
  let heartbeats = 0;
  let lastRaw = 0;
  let lastEdge = "—";
  let lastTox = "—";
  let lastClass = "—";
  let lastAction = "—";
  let lastRef = "";
  let lastReason = "";
  let lastTs = "";

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      heartbeats += 1;
      lastRaw = Number(r.context?.raw ?? lastRaw);
      stages.poll.thru += 1;
      continue;
    }

    const st = stageFromRecord(r);
    const action =
      (r.context?.policyAction as string) ??
      (r.kind === "quote_accepted"
        ? "accept"
        : r.kind === "info"
          ? "wait"
          : "reject");

    lastTs = r.ts?.slice(11, 19) ?? lastTs;
    lastReason = r.reason ?? lastReason;
    lastRef = (r.ref as string) ?? lastRef;
    lastAction = action;
    if (r.context?.edgeBps != null) lastEdge = String(r.context.edgeBps);
    if (r.context?.toxicity != null) lastTox = String(r.context.toxicity);
    if (r.context?.orderClass != null) lastClass = String(r.context.orderClass);

    if (action === "accept") {
      accept += 1;
      for (const s of PATH) {
        stages[s].thru += 1;
      }
      stages.journal.lastReason = r.reason ?? "accept";
    } else if (action === "wait") {
      wait += 1;
      for (const s of PATH) {
        stages[s].thru += 1;
        if (s === "policy") break;
      }
      stages.policy.lastReason = r.reason ?? "wait";
    } else {
      reject += 1;
      stages[st].drop += 1;
      stages[st].lastReason = r.reason ?? "reject";
      for (const s of PATH) {
        stages[s].thru += 1;
        if (s === st) break;
      }
    }
  }

  stages.poll.thru = Math.max(stages.poll.thru, heartbeats, lastRaw);

  return {
    demo: false,
    stages,
    accept,
    wait,
    reject,
    seen: accept + wait + reject,
    heartbeats,
    lastRaw,
    lastEdge,
    lastTox,
    lastClass,
    lastAction,
    lastRef: lastRef ? lastRef.slice(0, 12) : "—",
    lastReason: lastReason.slice(0, 40),
    lastTs,
  };
}

/** Labeled synthetic primitives so the block can be judged with density. */
const DEMO_SNAPSHOT: Snapshot = {
  demo: true,
  stages: {
    poll: { thru: 128, drop: 0, lastReason: "heartbeat" },
    parse: { thru: 42, drop: 6, lastReason: "bad_type_amount" },
    classify: { thru: 36, drop: 9, lastReason: "class_not_tradable:priority" },
    decay: { thru: 27, drop: 2, lastReason: "decay_window_closed" },
    edge: { thru: 25, drop: 8, lastReason: "edge_below_min" },
    risk: { thru: 17, drop: 3, lastReason: "exceeds_max_position_size" },
    policy: { thru: 14, drop: 4, lastReason: "toxicity_high" },
    journal: { thru: 10, drop: 0, lastReason: "edge_ok" },
  },
  accept: 6,
  wait: 4,
  reject: 32,
  seen: 42,
  heartbeats: 128,
  lastRaw: 3,
  lastEdge: "12",
  lastTox: "0.22",
  lastClass: "dutch",
  lastAction: "accept",
  lastRef: "0xdemo00cafe",
  lastReason: "edge_ok",
  lastTs: "DEMO",
};

export function Circuit({
  records,
  pulseKey,
}: {
  records: any[];
  pulseKey: number;
}) {
  const [hot, setHot] = useState<Set<StageId>>(new Set());
  const [packets, setPackets] = useState<Packet[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const snap = useMemo(() => computeSnapshot(records), [records]);
  const maxThru = Math.max(1, ...PATH.map((id) => snap.stages[id].thru));

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setPackets((p) => [
        ...p.slice(-6),
        {
          id: Date.now() + Math.random(),
          t0: Date.now(),
          duration: 2.6,
          kind: "heartbeat",
        },
      ]);
    }, 3400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (records.length === 0) {
      // animate a full path so DEMO density is visible
      setHot(new Set(PATH));
      setPackets((p) => [
        ...p.slice(-4),
        {
          id: Date.now() + Math.random(),
          t0: Date.now(),
          duration: 1.4,
          kind: "decision",
        },
      ]);
      const t = setTimeout(() => setHot(new Set()), 1400);
      return () => clearTimeout(t);
    }
    const last = records[records.length - 1];
    const s = stageFromRecord(last);
    const idx = PATH.indexOf(s);
    setHot(new Set(PATH.slice(0, Math.max(idx, 0) + 1)));
    setPackets((p) => [
      ...p.slice(-6),
      {
        id: Date.now() + Math.random(),
        t0: Date.now(),
        duration: 1.1,
        kind: "decision",
      },
    ]);
    const clear = setTimeout(() => setHot(new Set()), 1200);
    return () => clearTimeout(clear);
  }, [pulseKey, records.length]);

  const x0 = STAGES[0].x;
  const x1 = STAGES[STAGES.length - 1].x;

  return (
    <div className={`circuit-panel dens${snap.demo ? " demo" : " live"}`}>
      <div className="circuit-head">
        <h2>
          Pipeline{" "}
          {snap.demo ? (
            <span className="demo-tag">DEMO primitives — run npm run simulate</span>
          ) : (
            <span className="live-tag">live journal</span>
          )}
        </h2>
        <div className="circuit-kpis">
          <span className="kpi">
            <em>IN</em> {snap.seen}
          </span>
          <span className="kpi">
            <em>HB</em> {snap.heartbeats}
          </span>
          <span className="kpi">
            <em>RAW</em> {snap.lastRaw}
          </span>
          <span className="kpi ok">
            <em>A</em> {snap.accept}
          </span>
          <span className="kpi wait">
            <em>W</em> {snap.wait}
          </span>
          <span className="kpi bad">
            <em>R</em> {snap.reject}
          </span>
          <span className="circuit-live">
            <span className="circuit-live-dot" />
            {snap.demo ? "demo" : "live"}
          </span>
        </div>
      </div>

      {/* last decision primitives strip */}
      <div className="primitive-strip">
        <span>
          <em>ts</em> {snap.lastTs || "—"}
        </span>
        <span>
          <em>action</em> {snap.lastAction}
        </span>
        <span>
          <em>class</em> {snap.lastClass}
        </span>
        <span>
          <em>edgeBps</em> {snap.lastEdge}
        </span>
        <span>
          <em>tox</em> {snap.lastTox}
        </span>
        <span>
          <em>reason</em> {snap.lastReason || "—"}
        </span>
        <span>
          <em>ref</em> {snap.lastRef}
        </span>
      </div>

      <svg className="circuit-svg dens" viewBox="0 0 800 168" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="ng" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <line className="circuit-bus" x1={x0 + 28} y1={48} x2={x1 - 28} y2={48} />

        {STAGES.slice(0, -1).map((s, i) => {
          const b = STAGES[i + 1];
          const active = hot.has(s.id) && hot.has(b.id);
          return (
            <line
              key={`w-${s.id}`}
              className={`circuit-wire${active ? " active" : ""}`}
              x1={s.x + 28}
              y1={48}
              x2={b.x - 28}
              y2={48}
            />
          );
        })}

        {STAGES.map((s) => {
          const d = snap.stages[s.id].drop;
          if (d <= 0) return null;
          return (
            <g key={`drop-${s.id}`} className="drop-branch">
              <line x1={s.x} y1={62} x2={s.x} y2={88} />
              <line x1={s.x} y1={88} x2={s.x + 20} y2={88} />
              <circle cx={s.x + 20} cy={88} r={2} />
              <text x={s.x + 26} y={91}>
                −{d}
              </text>
            </g>
          );
        })}

        {packets.map((p) => {
          const elapsed = (now - p.t0) / 1000;
          const t = elapsed / p.duration;
          if (t < 0 || t > 1) return null;
          const x = x0 + (x1 - x0) * t;
          const isDecision = p.kind === "decision";
          return (
            <g key={p.id} filter={isDecision ? "url(#ng)" : undefined}>
              <circle
                className={isDecision ? "circuit-particle hot" : "circuit-particle"}
                cx={x}
                cy={48}
                r={isDecision ? 3 : 2}
              />
            </g>
          );
        })}

        {STAGES.map((s) => {
          const isHot = hot.has(s.id);
          const st = snap.stages[s.id];
          const intensity = st.thru / maxThru;
          return (
            <g
              key={s.id}
              className={`circuit-node dens${isHot ? " hot" : ""}${st.drop > 0 ? " has-drop" : ""}`}
              transform={`translate(${s.x}, 48)`}
            >
              <rect
                className="thru-bar"
                x={-28}
                y={14}
                width={56 * Math.max(0.06, intensity)}
                height={2.5}
              />
              <rect x={-28} y={-13} width={56} height={26} rx={1} />
              <text className="node-label" y={2}>
                {s.label}
              </text>
              <text className="node-metric" y={32}>
                {st.thru}
                {st.drop > 0 ? <tspan className="drop-tspan"> −{st.drop}</tspan> : null}
              </text>
              {st.lastReason ? (
                <text className="node-reason" y={44}>
                  {st.lastReason.slice(0, 14)}
                </text>
              ) : null}
            </g>
          );
        })}

        <g className="outcome-strip">
          <OutcomeChip x={120} label="ACCEPT" n={snap.accept} tone="ok" />
          <OutcomeChip x={220} label="WAIT" n={snap.wait} tone="wait" />
          <OutcomeChip x={320} label="REJECT" n={snap.reject} tone="bad" />
          <text x={748} y={148} textAnchor="end" className="out-label">
            {snap.demo ? "DEMO · not live capital" : "dry-run · capital OFF"}
          </text>
        </g>
      </svg>
    </div>
  );
}

function OutcomeChip({
  x,
  label,
  n,
  tone,
}: {
  x: number;
  label: string;
  n: number;
  tone: string;
}) {
  return (
    <g transform={`translate(${x}, 138)`} className={`out-chip ${tone}`}>
      <rect x={0} y={0} width={88} height={18} rx={1} />
      <text x={6} y={13}>
        {label}
      </text>
      <text x={82} y={13} textAnchor="end" className="out-n">
        {n}
      </text>
    </g>
  );
}
