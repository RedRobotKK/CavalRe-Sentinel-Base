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

type Metrics = {
  thru: Record<StageId, number>;
  drop: Record<StageId, number>;
  accept: number;
  wait: number;
  reject: number;
  seen: number;
};

function stageFromRecord(r: any): StageId {
  const stage = String(r?.context?.stage ?? "");
  if (stage === "parse") return "parse";
  if (stage === "classify") return "classify";
  if (stage === "resolve") return "decay";
  if (stage === "edge") return "edge";
  if (stage === "policy" || stage === "risk") return "policy";
  if (stage === "shadow_markout") return "journal";
  if (r?.reason === "invalid_amount_string" || String(r?.reason ?? "").startsWith("input."))
    return "parse";
  if (String(r?.reason ?? "").startsWith("class_not_tradable")) return "classify";
  if (r?.kind === "quote_accepted" || r?.kind === "quote_rejected" || r?.kind === "info") {
    if (r?.reason === "cycle_heartbeat") return "poll";
    return "journal";
  }
  return "poll";
}

function computeMetrics(records: any[]): Metrics {
  const thru: Record<StageId, number> = {
    poll: 0,
    parse: 0,
    classify: 0,
    decay: 0,
    edge: 0,
    risk: 0,
    policy: 0,
    journal: 0,
  };
  const drop: Record<StageId, number> = { ...thru };
  let accept = 0;
  let wait = 0;
  let reject = 0;
  let maxRaw = 0;

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      maxRaw = Math.max(maxRaw, Number(r.context?.raw ?? 0));
      thru.poll += 1;
      continue;
    }
    const st = stageFromRecord(r);
    const action =
      r.context?.policyAction ??
      (r.kind === "quote_accepted"
        ? "accept"
        : r.kind === "info"
          ? "wait"
          : "reject");

    if (action === "accept") {
      accept += 1;
      // survived full path
      for (const s of PATH) thru[s] += 1;
    } else if (action === "wait") {
      wait += 1;
      for (const s of PATH) {
        thru[s] += 1;
        if (s === "policy") break;
      }
    } else {
      reject += 1;
      drop[st] += 1;
      // counted through stages before drop
      for (const s of PATH) {
        thru[s] += 1;
        if (s === st) break;
      }
    }
  }

  // poll thru at least reflects heartbeats / raw
  thru.poll = Math.max(thru.poll, maxRaw, accept + wait + reject);

  return {
    thru,
    drop,
    accept,
    wait,
    reject,
    seen: accept + wait + reject,
  };
}

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

  const metrics = useMemo(() => computeMetrics(records), [records]);
  const hasActivity = records.length > 0;

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
    if (records.length === 0) return;
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
  const maxThru = Math.max(1, ...Object.values(metrics.thru));

  return (
    <div className={`circuit-panel dens${hasActivity ? " has-data" : ""}`}>
      <div className="circuit-head">
        <h2>Pipeline</h2>
        <div className="circuit-kpis">
          <span className="kpi">
            <em>IN</em> {metrics.seen}
          </span>
          <span className="kpi ok">
            <em>A</em> {metrics.accept}
          </span>
          <span className="kpi wait">
            <em>W</em> {metrics.wait}
          </span>
          <span className="kpi bad">
            <em>R</em> {metrics.reject}
          </span>
          <span className="circuit-live">
            <span className="circuit-live-dot" />
            {hasActivity ? "live" : "idle"}
          </span>
        </div>
      </div>

      <svg className="circuit-svg dens" viewBox="0 0 800 168" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="ng" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* main bus */}
        <line className="circuit-bus" x1={x0 + 28} y1={52} x2={x1 - 28} y2={52} />

        {STAGES.slice(0, -1).map((s, i) => {
          const b = STAGES[i + 1];
          const active = hot.has(s.id) && hot.has(b.id);
          return (
            <line
              key={`w-${s.id}`}
              className={`circuit-wire${active ? " active" : ""}`}
              x1={s.x + 28}
              y1={52}
              x2={b.x - 28}
              y2={52}
            />
          );
        })}

        {/* drop rails (fail branches) — Palantir side channels */}
        {STAGES.map((s) => {
          const d = metrics.drop[s.id] ?? 0;
          if (d <= 0) return null;
          return (
            <g key={`drop-${s.id}`} className="drop-branch">
              <line x1={s.x} y1={66} x2={s.x} y2={96} />
              <line x1={s.x} y1={96} x2={s.x + 22} y2={96} />
              <circle cx={s.x + 22} cy={96} r={2.2} />
              <text x={s.x + 28} y={99}>
                −{d}
              </text>
            </g>
          );
        })}

        {/* packets */}
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
                cy={52}
                r={isDecision ? 3.2 : 2.2}
              />
            </g>
          );
        })}

        {/* nodes + density badges */}
        {STAGES.map((s) => {
          const isHot = hot.has(s.id);
          const thru = metrics.thru[s.id] ?? 0;
          const dr = metrics.drop[s.id] ?? 0;
          const intensity = thru / maxThru;
          return (
            <g
              key={s.id}
              className={`circuit-node dens${isHot ? " hot" : ""}`}
              transform={`translate(${s.x}, 52)`}
            >
              {/* intensity under-bar */}
              <rect
                className="thru-bar"
                x={-28}
                y={16}
                width={56 * Math.max(0.08, intensity)}
                height={3}
              />
              <rect x={-28} y={-14} width={56} height={28} rx={2} />
              <text className="node-label" y={3}>
                {s.label}
              </text>
              <text className="node-metric" y={36}>
                {thru}
                {dr > 0 ? (
                  <tspan className="drop-tspan"> −{dr}</tspan>
                ) : null}
              </text>
            </g>
          );
        })}

        {/* outcome strip */}
        <g className="outcome-strip">
          <text x={48} y={150} className="out-label">
            OUTCOMES
          </text>
          <OutcomeChip x={120} label="ACCEPT" n={metrics.accept} tone="ok" />
          <OutcomeChip x={220} label="WAIT" n={metrics.wait} tone="wait" />
          <OutcomeChip x={320} label="REJECT" n={metrics.reject} tone="bad" />
          <text x={748} y={150} textAnchor="end" className="out-label">
            dry-run · capital OFF
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
    <g transform={`translate(${x}, 140)`} className={`out-chip ${tone}`}>
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
