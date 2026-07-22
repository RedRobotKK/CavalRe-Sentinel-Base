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
const GRID = "#2a1808";

type DropCat = "classify" | "risk" | "edge" | "policy" | "parse" | "other";

type DropRow = {
  key: string;
  label: string;
  n: number;
  pct: number;
  cat: DropCat;
};

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

export function StreamLayer({ records }: { records: Rec[] }) {
  const model = useMemo(() => windowed(records), [records]);
  const hasLatency = model.latSamples >= 3;

  return (
    <div className="stream-layer stream-layer-v2 panel-rise">
      <header className="sl-head">
        <div className="sl-title-block">
          <h2>Stream</h2>
          <span className="sl-channel">open channel</span>
        </div>
        <div className="sl-meta">
          <span className="sl-meta-item">
            <em>{model.windows.length}</em> cycles
          </span>
          <span className="sl-dot" aria-hidden />
          <span className="sl-meta-item muted">VIEW · Dutch_V3</span>
        </div>
      </header>

      {/* Only metrics that always have meaning */}
      <div className="sl-kpis">
        <div className="sl-kpi primary">
          <span className="sl-kpi-label">Pass rate</span>
          <span className="sl-kpi-value">{fmtPct(model.passRate)}</span>
          <span className="sl-kpi-hint">accept + wait / decided</span>
        </div>
        <div className={`sl-kpi${model.rejectRate > 0.85 ? " alert" : ""}`}>
          <span className="sl-kpi-label">Reject rate</span>
          <span className="sl-kpi-value">{fmtPct(model.rejectRate)}</span>
          <span className="sl-kpi-hint">{model.dropTotal} drops in window</span>
        </div>
        <div className="sl-kpi accent">
          <span className="sl-kpi-label">Signals through</span>
          <span className="sl-kpi-value">{model.signalsThru}</span>
          <span className="sl-kpi-hint">past policy gate</span>
        </div>
        {hasLatency && (
          <div className="sl-kpi">
            <span className="sl-kpi-label">Poll p95</span>
            <span className="sl-kpi-value">{fmtMs(model.latP95)}</span>
            <span className="sl-kpi-hint">
              p50 {fmtMs(model.latP50)} · n={model.latSamples}
            </span>
          </div>
        )}
      </div>

      <div className={`sl-body${hasLatency ? " with-lat" : ""}`}>
        <section className="sl-panel sl-chart">
          <div className="sl-panel-head">
            <h3>Pass vs reject</h3>
            <span className="sl-panel-sub">per cycle · stacked</span>
          </div>
          <div className="sl-chart-wrap">
            <ResponsiveContainer width="100%" height={148}>
              <AreaChart
                data={model.windows}
                margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="t"
                  stroke={MUTED}
                  fontSize={9}
                  tick={{ fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke={MUTED}
                  fontSize={9}
                  width={24}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="passed"
                  stackId="1"
                  stroke={OK}
                  fill="rgba(255,204,102,0.28)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  name="pass"
                />
                <Area
                  type="monotone"
                  dataKey="rejected"
                  stackId="1"
                  stroke={BAD}
                  fill="rgba(255,85,51,0.22)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  name="reject"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="sl-panel sl-drops">
          <div className="sl-panel-head">
            <h3>Drop reasons</h3>
            <span className="sl-panel-sub">
              {model.dropTotal} rejects · share of drops
            </span>
          </div>
          {model.topDrops.length === 0 ? (
            <div className="sl-empty">No rejects in window</div>
          ) : (
            <ul className="sl-drop-list">
              {model.topDrops.map((d) => (
                <li key={d.key} className="sl-drop-row">
                  <div className="sl-drop-top">
                    <span className={`sl-cat cat-${d.cat}`}>{CAT_LABEL[d.cat]}</span>
                    <span className="sl-drop-label">{d.label}</span>
                    <span className="sl-drop-n">{d.n}</span>
                    <span className="sl-drop-pct">{d.pct}%</span>
                  </div>
                  <div className="sl-drop-track">
                    <div
                      className="sl-drop-fill"
                      style={{
                        width: `${Math.max(3, d.pct)}%`,
                        background: CAT_COLOR[d.cat],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hasLatency && (
          <section className="sl-panel sl-lat">
            <div className="sl-panel-head">
              <h3>Poll latency</h3>
              <span className="sl-panel-sub">ms · dry-run heartbeats</span>
            </div>
            <div className="sl-lat-figures">
              <div>
                <span className="sl-lat-k">p50</span>
                <strong>{fmtMs(model.latP50)}</strong>
              </div>
              <div>
                <span className="sl-lat-k">p95</span>
                <strong>{fmtMs(model.latP95)}</strong>
              </div>
              <div>
                <span className="sl-lat-k">last</span>
                <strong>{fmtMs(model.latLast)}</strong>
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="sl-foot">
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
      </footer>
    </div>
  );
}

const tooltipStyle = {
  background: "#0e0804",
  border: "1px solid #5c3310",
  fontSize: 11,
  color: "#ffb84d",
  borderRadius: 0,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
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
  const latLast =
    latencies.length > 0 ? latencies[latencies.length - 1]! : null;

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
    .slice(0, 6);

  return {
    windows: last,
    latP50,
    latP95,
    latLast,
    latSamples: latencies.length,
    rejectRate,
    passRate,
    signalsThru: signalsThru || recentPass,
    topDrops,
    dropTotal,
  };
}
