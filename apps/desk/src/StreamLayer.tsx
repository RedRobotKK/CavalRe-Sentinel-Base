import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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

const AMBER = "#ffb000";
const BAD = "#ff5533";
const OK = "#ffcc66";
const MUTED = "#8a5a1e";
const GRID = "#3a2008";

export function StreamLayer({ records }: { records: Rec[] }) {
  const model = useMemo(() => windowed(records), [records]);

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
        <Kpi label="latency p95" value={fmtMs(model.latP95)} />
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

        <div className="stream-chart">
          <div className="chart-title">Cycle latency (ms)</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={model.windows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke={MUTED} fontSize={9} tick={{ fill: MUTED }} />
              <YAxis stroke={MUTED} fontSize={9} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="latencyMs"
                stroke={AMBER}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="stream-chart">
          <div className="chart-title">Drop reasons</div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart
              data={model.topDrops}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis type="number" stroke={MUTED} fontSize={9} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                stroke={MUTED}
                fontSize={9}
                tick={{ fill: MUTED }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="n" radius={[0, 2, 2, 0]} isAnimationActive={false}>
                {model.topDrops.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? BAD : "rgba(255,85,51,0.5)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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

  const dropMap = new Map<string, number>();
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
      if (Number.isFinite(latencyMs)) latencies.push(latencyMs);
      windows.push({
        t: r.ts?.slice(11, 19) ?? "",
        rejectRate: decided > 0 ? rejected / decided : 0,
        passRate: decided > 0 ? passed / decided : 0,
        latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
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
      let name = (r.reason ?? "reject").slice(0, 28);
      if (name.startsWith("class_not_tradable:")) {
        name = "class:" + name.split(":")[1];
      }
      dropMap.set(name, (dropMap.get(name) ?? 0) + 1);
    }
  }

  const last = windows.slice(-24);
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const latP50 =
    sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length * 0.5)]! : null;
  const latP95 =
    sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length * 0.95)]! : null;

  const recentReject = last.reduce((s, w) => s + w.rejected, 0);
  const recentPass = last.reduce((s, w) => s + w.passed, 0);
  const recentDecided = recentReject + recentPass;
  const rejectRate = recentDecided > 0 ? recentReject / recentDecided : 0;
  const passRate = recentDecided > 0 ? recentPass / recentDecided : 0;

  const topDrops = [...dropMap.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  return {
    windows: last,
    latP50,
    latP95,
    rejectRate,
    passRate,
    signalsThru: signalsThru || recentPass,
    topDrops,
  };
}
