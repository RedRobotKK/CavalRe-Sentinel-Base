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

function stageFromRecord(r: any): StageId {
  const stage = String(r?.context?.stage ?? "");
  if (stage === "parse") return "parse";
  if (stage === "classify") return "classify";
  if (stage === "resolve") return "decay";
  if (stage === "edge") return "edge";
  if (stage === "policy" || stage === "risk") {
    // policy path always ran risk first in runner
    return "policy";
  }
  if (r?.kind === "quote_accepted" || r?.kind === "quote_rejected" || r?.kind === "info") {
    return "journal";
  }
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
  const [particles, setParticles] = useState<{ id: number; from: number; t0: number }[]>(
    []
  );

  const recent = useMemo(() => records.slice(-12).reverse(), [records]);

  useEffect(() => {
    if (records.length === 0) return;
    const last = records[records.length - 1];
    const s = stageFromRecord(last);
    const path: StageId[] = [
      "poll",
      "parse",
      "classify",
      "decay",
      "edge",
      "risk",
      "policy",
      "journal",
    ];
    // light up path up to observed stage
    const idx = path.indexOf(s);
    const active = new Set(path.slice(0, Math.max(idx, 0) + 1));
    setHot(active);

    const id = Date.now();
    setParticles((p) => [...p.slice(-6), { id, from: 0, t0: id }]);

    const clear = setTimeout(() => setHot(new Set()), 1200);
    return () => clearTimeout(clear);
  }, [pulseKey, records.length]);

  // animate particles along wires
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 40);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="circuit-panel">
      <h2>Execution circuit · dataflow</h2>
      <svg className="circuit-svg" viewBox="0 0 900 120" preserveAspectRatio="xMidYMid meet">
        {/* wires */}
        {STAGES.slice(0, -1).map((s, i) => {
          const a = s;
          const b = STAGES[i + 1];
          const active = hot.has(a.id) && hot.has(b.id);
          return (
            <line
              key={`w-${a.id}`}
              className={`circuit-wire${active ? " active" : ""}`}
              x1={a.x + 36}
              y1={55}
              x2={b.x - 36}
              y2={55}
            />
          );
        })}

        {/* particles */}
        {particles.map((p) => {
          const elapsed = (now - p.t0) / 1000;
          const t = Math.min(elapsed / 1.1, 1);
          if (t >= 1) return null;
          const x0 = STAGES[0].x;
          const x1 = STAGES[STAGES.length - 1].x;
          const x = x0 + (x1 - x0) * t;
          return <circle key={p.id} className="circuit-particle" cx={x} cy={55} r={3.5} />;
        })}

        {/* nodes */}
        {STAGES.map((s) => (
          <g
            key={s.id}
            className={`circuit-node${hot.has(s.id) ? " hot" : ""}`}
            transform={`translate(${s.x}, 55)`}
          >
            <rect x={-36} y={-18} width={72} height={36} rx={6} />
            <text y={4}>{s.label}</text>
          </g>
        ))}

        {/* baseline label */}
        <text x={450} y={108} textAnchor="middle" fill="#7d8799" fontSize="10" fontFamily="var(--mono)">
          UniswapX Base · Dutch_V3 · dry-run only · live capital OFF
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
