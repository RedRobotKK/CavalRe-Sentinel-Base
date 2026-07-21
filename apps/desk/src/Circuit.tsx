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
  { id: "poll", label: "POLL", x: 40 },
  { id: "parse", label: "PARSE", x: 150 },
  { id: "classify", label: "CLASS", x: 260 },
  { id: "decay", label: "DECAY", x: 370 },
  { id: "edge", label: "EDGE", x: 480 },
  { id: "risk", label: "RISK", x: 590 },
  { id: "policy", label: "POLICY", x: 700 },
  { id: "journal", label: "JOURNAL", x: 810 },
];

const PATH: StageId[] = STAGES.map((s) => s.id);

type Packet = {
  id: number;
  t0: number;
  /** 0..1 progress along full bus */
  duration: number;
  kind: "heartbeat" | "decision";
};

function stageFromRecord(r: any): StageId {
  const stage = String(r?.context?.stage ?? "");
  if (stage === "parse") return "parse";
  if (stage === "classify") return "classify";
  if (stage === "resolve") return "decay";
  if (stage === "edge") return "edge";
  if (stage === "policy" || stage === "risk") return "policy";
  if (stage === "shadow_markout") return "journal";
  if (r?.kind === "quote_accepted" || r?.kind === "quote_rejected" || r?.kind === "info") {
    return "journal";
  }
  if (r?.kind === "markout") return "journal";
  return "poll";
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

  const recent = useMemo(() => records.slice(-10).reverse(), [records]);
  const hasActivity = records.length > 0;

  // RAF-ish clock for smooth motion
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

  // Ambient heartbeat packet every few seconds (subtle)
  useEffect(() => {
    const id = setInterval(() => {
      setPackets((p) => [
        ...p.slice(-8),
        {
          id: Date.now() + Math.random(),
          t0: Date.now(),
          duration: 2.8,
          kind: "heartbeat",
        },
      ]);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  // Decision pulse when journal grows
  useEffect(() => {
    if (records.length === 0) return;
    const last = records[records.length - 1];
    const s = stageFromRecord(last);
    const idx = PATH.indexOf(s);
    const active = new Set(PATH.slice(0, Math.max(idx, 0) + 1));
    setHot(active);

    setPackets((p) => [
      ...p.slice(-8),
      {
        id: Date.now() + Math.random(),
        t0: Date.now(),
        duration: 1.15,
        kind: "decision",
      },
    ]);

    const clear = setTimeout(() => setHot(new Set()), 1400);
    return () => clearTimeout(clear);
  }, [pulseKey, records.length]);

  const x0 = STAGES[0].x;
  const x1 = STAGES[STAGES.length - 1].x;

  return (
    <div className={`circuit-panel${hasActivity ? " has-data" : ""}`}>
      <div className="circuit-head">
        <h2>Execution circuit · dataflow</h2>
        <span className="circuit-live">
          <span className="circuit-live-dot" />
          {hasActivity ? "stream live" : "listening"}
        </span>
      </div>

      <svg className="circuit-svg" viewBox="0 0 900 128" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="wireGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1a2840" />
            <stop offset="50%" stopColor="#2a4060" />
            <stop offset="100%" stopColor="#1a2840" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ambient bus */}
        <line
          className="circuit-bus"
          x1={x0 + 36}
          y1={58}
          x2={x1 - 36}
          y2={58}
        />

        {/* segment wires */}
        {STAGES.slice(0, -1).map((s, i) => {
          const b = STAGES[i + 1];
          const active = hot.has(s.id) && hot.has(b.id);
          return (
            <line
              key={`w-${s.id}`}
              className={`circuit-wire${active ? " active" : ""}`}
              x1={s.x + 36}
              y1={58}
              x2={b.x - 36}
              y2={58}
            />
          );
        })}

        {/* packets + soft trail dots */}
        {packets.map((p) => {
          const elapsed = (now - p.t0) / 1000;
          const t = elapsed / p.duration;
          if (t < 0 || t > 1) return null;
          const x = x0 + (x1 - x0) * t;
          const isDecision = p.kind === "decision";
          return (
            <g key={p.id} filter={isDecision ? "url(#softGlow)" : undefined}>
              {/* trail */}
              {[0.04, 0.08, 0.12].map((d, i) => {
                const tt = t - d;
                if (tt <= 0) return null;
                const tx = x0 + (x1 - x0) * tt;
                return (
                  <circle
                    key={i}
                    className={isDecision ? "circuit-trail hot" : "circuit-trail"}
                    cx={tx}
                    cy={58}
                    r={2.2 - i * 0.4}
                    opacity={0.35 - i * 0.1}
                  />
                );
              })}
              <circle
                className={isDecision ? "circuit-particle hot" : "circuit-particle"}
                cx={x}
                cy={58}
                r={isDecision ? 4 : 2.8}
              />
            </g>
          );
        })}

        {/* nodes */}
        {STAGES.map((s, i) => {
          const isHot = hot.has(s.id);
          const isPoll = s.id === "poll";
          return (
            <g
              key={s.id}
              className={`circuit-node${isHot ? " hot" : ""}${isPoll ? " listen" : ""}`}
              style={{ animationDelay: `${i * 40}ms` }}
              transform={`translate(${s.x}, 58)`}
            >
              {isPoll && (
                <circle className="listen-ring" cx={0} cy={0} r={28} />
              )}
              <rect x={-36} y={-18} width={72} height={36} rx={6} />
              <text y={4}>{s.label}</text>
            </g>
          );
        })}

        <text
          x={450}
          y={116}
          textAnchor="middle"
          fill="#7d8799"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          UniswapX Base · Dutch_V3 · dry-run · live capital OFF
        </text>
      </svg>

      <div className="stream-ticker">
        {recent.length === 0 && (
          <span className="item">stream idle — waiting for journal activity</span>
        )}
        {recent.map((r, i) => {
          const action =
            r.context?.policyAction ??
            (r.kind === "quote_accepted"
              ? "accept"
              : r.kind === "info"
                ? "wait"
                : r.kind === "markout"
                  ? "wait"
                  : "reject");
          return (
            <span key={`${r.seq}-${i}`} className={`item ${action}`}>
              {r.ts?.slice(11, 19) ?? "--"} · {action} · {(r.reason ?? "").slice(0, 28)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
