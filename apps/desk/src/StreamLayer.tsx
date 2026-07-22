import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Rec = {
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null>;
};

const BAD = "#ff5533";
const OK = "#ffcc66";
const MUTED = "#8a5a1e";
const GRID = "#3a2008";

type DropCat = "classify" | "risk" | "edge" | "policy" | "parse" | "other";

type DropRow = {
  key: string;
  label: string;
  n: number;
  pct: number;
  cat: DropCat;
};

/** Machine reason → short human label + category */
function normalizeDrop(reason: string): { key: string; label: string; cat: DropCat } {
  const r = reason.trim();
  if (r.startsWith("class_not_tradable:exclusive") || r === "class:exclusive") {
    return { key: "exclusive", label: "Exclusive filler", cat: "classify" };
  }
  if (r.startsWith("class_not_tradable:priority") || r === "class:priority") {
    return { key: "priority", label: "Priority order", cat: "classify" };
  }
  if (r.startsWith("class_not_tradable")) {
    return { key: "class_other", label: "Not tradable (class)", cat: "classify" };
  }
  if (r === "exceeds_max_position_size") {
    return { key: "max_pos", label: "Over max position", cat: "risk" };
  }
  if (r === "exceeds_current_equity") {
    return { key: "equity", label: "Over equity", cat: "risk" };
  }
  if (r === "edge_negative") {
    return { key: "edge_neg", label: "Negative edge", cat: "edge" };
  }
  if (r === "edge_below_min") {
    return { key: "edge_thin", label: "Edge too thin", cat: "policy" };
  }
  if (r.startsWith("edge_undefined")) {
    return { key: "edge_undef", label: "No AMM reference", cat: "edge" };
  }
  if (r === "edge_ok") {
    return { key: "edge_ok", label: "Edge OK (accept)", cat: "policy" };
  }
  if (r === "toxicity_high") {
    return { key: "tox", label: "High toxicity", cat: "policy" };
  }
  if (r === "invalid_amount_string" || r.includes("invalid_amount")) {
    return { key: "parse_amt", label: "Bad amount", cat: "parse" };
  }
  if (r.includes("decay") || r.includes("IncorrectAmounts")) {
    return { key: "decay", label: "Decay error", cat: "parse" };
  }
  return {
    key: r.slice(0, 24),
    label: r.replace(/_/g, " ").slice(0, 28),
    cat: "other",
  };
}

const CAT_COLOR: Record<DropCat, string> = {
  classify: "#c47a22",
  risk: "#e8a838",
  edge: "#ff5533",
  policy: "#ff8c1a",
  parse: "#8a5a1e",
  other: "#6a4520",
};

const CAT_LABEL: Record<DropCat, string> = {
  classify: "class",
  risk: "risk",
  edge: "edge",
  policy: "policy",
  parse: "parse",
  other: "other",
};

const LAT_BUCKETS = [
  { key: "<100", max: 100 },
  { key: "100–200", max: 200 },
  { key: "200–400", max: 400 },
  { key: "400–800", max: 800 },
  { key: "800+", max: Infinity },
] as const;

function latencyHealth(p95: number | null): "good" | "warn" | "bad" | "none" {
  if (p95 == null) return "none";
  if (p95 < 300) return "good";
  if (p95 < 800) return "warn";
  return "bad";
}

export function StreamLayer({ records }: { records: Rec[] }) {
  const model = useMemo(() => windowed(records), [records]);
  const health = latencyHealth(model.latP95);

  return (
    <div className="stream-layer panel-rise">
      <div className="stream-layer-head">
        <h2>Stream · open channel</h2>
        <span className="muted">
          {model.windows.length} cycles · pass-through emphasized
        </span>
      </div>

      <div className="stream-kpis">
        <Kpi label="latency p50" value={fmtMs(model.latP50)} />
        <Kpi label="latency p95" value={fmtMs(model.latP95)} alert={health === "bad"} />
        <Kpi label="pass rate" value={fmtPct(model.passRate)} />
        <Kpi
          label="reject rate"
          value={fmtPct(model.rejectRate)}
          alert={model.rejectRate > 0.85}
        />
        <Kpi label="signals thru" value={String(model.signalsThru)} />
      </div>

      <div className="stream-charts">
        <div className="stream-chart">
          <div className="chart-title">Pass vs reject (per cycle)</div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={model.windows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke={MUTED} fontSize={9} tick={{ fill: MUTED }} />
              <YAxis stroke={MUTED} fontSize={9} width={28} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="passed"
                stackId="1"
                stroke={OK}
                fill="rgba(255,204,102,0.35)"
                strokeWidth={1.5}
                isAnimationActive={false}
                name="pass"
              />
              <Area
                type="monotone"
                dataKey="rejected"
                stackId="1"
                stroke={BAD}
                fill="rgba(255,85,51,0.25)"
                strokeWidth={1.5}
                isAnimationActive={false}
                name="reject"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="stream-chart latency-panel">
          <div className="chart-title">
            Poll latency
            <span className="chart-title-meta">UniswapX + path · ms</span>
          </div>

          {model.latSamples < 3 ? (
            <div className="lat-empty">
              <p>No poll timings yet</p>
              <span>Appears when live dry-run heartbeats include latencyMs</span>
            </div>
          ) : (
            <>
              <div className={`lat-status lat-${health}`}>
                <div className="lat-status-main">
                  <span className="lat-status-label">p95</span>
                  <strong>{fmtMs(model.latP95)}</strong>
                </div>
                <div className="lat-status-side">
                  <span>
                    p50 <em>{fmtMs(model.latP50)}</em>
                  </span>
                  <span>
                    last <em>{fmtMs(model.latLast)}</em>
                  </span>
                  <span>
                    max <em>{fmtMs(model.latMax)}</em>
                  </span>
                </div>
                <div className="lat-status-tag">
                  {health === "good" && "healthy"}
                  {health === "warn" && "elevated"}
                  {health === "bad" && "slow"}
                </div>
              </div>

              <div className="lat-hist">
                {model.latHist.map((b) => (
                  <div key={b.key} className="lat-hist-col">
                    <div className="lat-hist-bar-wrap">
                      <div
                        className="lat-hist-bar"
                        style={{
                          height: `${Math.max(b.pct > 0 ? 8 : 0, b.pct)}%`,
                          opacity: b.n > 0 ? 1 : 0.25,
                        }}
                        title={`${b.key}: ${b.n} cycles`}
                      />
                    </div>
                    <span className="lat-hist-label">{b.key}</span>
                    <span className="lat-hist-n">{b.n || ""}</span>
                  </div>
                ))}
              </div>
              <div className="lat-foot">
                {model.latSamples} samples · buckets by cycle time
              </div>
            </>
          )}
        </div>

        <div className="stream-chart drop-chart">
          <div className="chart-title">
            Drop reasons
            <span className="chart-title-meta">
              {model.dropTotal} rejects · share of drops
            </span>
          </div>
          {model.topDrops.length === 0 ? (
            <div className="drop-empty">No rejects in window</div>
          ) : (
            <ul className="drop-rank">
              {model.topDrops.map((d) => (
                <li key={d.key} className="drop-rank-row">
                  <div className="drop-rank-head">
                    <span className={`drop-cat cat-${d.cat}`}>{CAT_LABEL[d.cat]}</span>
                    <span className="drop-label">{d.label}</span>
                    <span className="drop-n">{d.n}</span>
                    <span className="drop-pct">{d.pct}%</span>
                  </div>
                  <div className="drop-track">
                    <div
                      className="drop-fill"
                      style={{
                        width: `${Math.max(2, d.pct)}%`,
                        background: CAT_COLOR[d.cat],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="drop-legend">
            <span className="cat-classify">class</span>
            <span className="cat-risk">risk</span>
            <span className="cat-edge">edge</span>
            <span className="cat-policy">policy</span>
            <span className="cat-parse">parse</span>
          </div>
        </div>
      </div>

      <div className="stream-primitives">
        <span>
          <em>wire</em> UniswapX Dutch_V3
        </span>
        <span>
          <em>pass</em> accept + wait
        </span>
        <span>
          <em>ref</em> QuoterV2
        </span>
        <span>
          <em>amount</em> bigint
        </span>
        <span>
          <em>mode</em> VIEW
        </span>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className={`skpi${alert ? " alert" : ""}`}>
      <div className="skpi-label">{label}</div>
      <div className="skpi-value">{value}</div>
    </div>
  );
}

const tooltipStyle = {
  background: "#120a04",
  border: "1px solid #5c3310",
  fontSize: 11,
  color: "#ffb84d",
};

function fmtMs(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}ms`;
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function windowed(records: Rec[]) {
  const windows: {
    t: string;
    rejectRate: number;
    passRate: number;
    latencyMs: number;
    raw: number;
    rejected: number;
    passed: number;
  }[] = [];

  const dropMap = new Map<string, { n: number; label: string; cat: DropCat }>();
  const latencies: number[] = [];
  let signalsThru = 0;

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      const raw = Number(r.context?.raw ?? 0);
      const rejected = Number(r.context?.rejected ?? 0);
      const accepted = Number(r.context?.accepted ?? 0);
      const waited = Number(r.context?.waited ?? 0);
      const passed = accepted + waited;
      const decided = rejected + passed;
      const latencyMs = Number(r.context?.latencyMs ?? NaN);
      const hasLat = Number.isFinite(latencyMs) && latencyMs > 0;
      if (hasLat) latencies.push(latencyMs);
      windows.push({
        t: r.ts?.slice(11, 19) ?? "",
        rejectRate: decided > 0 ? rejected / decided : 0,
        passRate: decided > 0 ? passed / decided : 0,
        latencyMs: hasLat ? latencyMs : 0,
        raw,
        rejected,
        passed,
      });
      continue;
    }
    if (r.kind === "quote_accepted" || r.context?.policyAction === "wait") {
      signalsThru += 1;
    }
    if (r.kind === "quote_rejected") {
      const { key, label, cat } = normalizeDrop(r.reason ?? "reject");
      const prev = dropMap.get(key);
      if (prev) prev.n += 1;
      else dropMap.set(key, { n: 1, label, cat });
    }
  }

  const last = windows.slice(-24);
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const latP50 =
    sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length * 0.5)]! : null;
  const latP95 =
    sortedLat.length > 0
      ? sortedLat[Math.min(sortedLat.length - 1, Math.floor(sortedLat.length * 0.95))]!
      : null;
  const latMax = sortedLat.length > 0 ? sortedLat[sortedLat.length - 1]! : null;
  const latLast =
    latencies.length > 0 ? latencies[latencies.length - 1]! : null;

  const histCounts = LAT_BUCKETS.map(() => 0);
  for (const ms of latencies) {
    const idx = LAT_BUCKETS.findIndex((b) => ms < b.max || b.max === Infinity);
    const i = idx >= 0 ? idx : LAT_BUCKETS.length - 1;
    histCounts[i]! += 1;
  }
  const histMax = Math.max(1, ...histCounts);
  const latHist = LAT_BUCKETS.map((b, i) => ({
    key: b.key,
    n: histCounts[i]!,
    pct: Math.round((histCounts[i]! / histMax) * 100),
  }));

  const recentReject = last.reduce((s, w) => s + w.rejected, 0);
  const recentPass = last.reduce((s, w) => s + w.passed, 0);
  const recentDecided = recentReject + recentPass;
  const rejectRate = recentDecided > 0 ? recentReject / recentDecided : 0;
  const passRate = recentDecided > 0 ? recentPass / recentDecided : 0;

  const dropTotal = [...dropMap.values()].reduce((s, d) => s + d.n, 0);
  const topDrops: DropRow[] = [...dropMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      n: v.n,
      pct: dropTotal > 0 ? Math.round((v.n * 1000) / dropTotal) / 10 : 0,
      cat: v.cat,
    }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 7);

  return {
    windows: last,
    latP50,
    latP95,
    latMax,
    latLast,
    latSamples: latencies.length,
    latHist,
    rejectRate,
    passRate,
    signalsThru: signalsThru || recentPass,
    topDrops,
    dropTotal,
  };
}
