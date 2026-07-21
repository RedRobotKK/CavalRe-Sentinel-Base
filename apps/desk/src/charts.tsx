import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

const COLORS = {
  accept: "#3dd68c",
  reject: "#f07178",
  wait: "#e6c07b",
  accent: "#6ea8fe",
  muted: "#8b93a7",
  grid: "#1e2430",
};

type Rec = {
  ts?: string;
  kind?: string;
  reason?: string;
  context?: Record<string, string | boolean | null>;
};

function actionOf(r: Rec): "accept" | "reject" | "wait" {
  const a = r.context?.policyAction;
  if (a === "accept" || a === "reject" || a === "wait") return a;
  if (r.kind === "quote_accepted") return "accept";
  if (r.kind === "info") return "wait";
  return "reject";
}

export function FunnelChart({ records }: { records: Rec[] }) {
  const counts = { accept: 0, reject: 0, wait: 0 };
  for (const r of records) counts[actionOf(r)] += 1;
  const data = [
    { name: "accept", n: counts.accept, fill: COLORS.accept },
    { name: "wait", n: counts.wait, fill: COLORS.wait },
    { name: "reject", n: counts.reject, fill: COLORS.reject },
  ];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis dataKey="name" stroke={COLORS.muted} fontSize={11} />
        <YAxis stroke={COLORS.muted} fontSize={11} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#12151c",
            border: "1px solid #1e2430",
            fontSize: 12,
          }}
        />
        <Bar dataKey="n" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ClassPie({ records }: { records: Rec[] }) {
  const map = new Map<string, number>();
  for (const r of records) {
    const c = String(r.context?.orderClass ?? "unknown");
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  const data = [...map.entries()].map(([name, value]) => ({ name, value }));
  const palette = [COLORS.accent, COLORS.wait, COLORS.reject, COLORS.good ?? COLORS.accept, COLORS.muted];
  if (data.length === 0) {
    return <EmptyChart label="No class data" />;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#12151c",
            border: "1px solid #1e2430",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: COLORS.muted }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function EdgeHistogram({ records }: { records: Rec[] }) {
  const edges: number[] = [];
  for (const r of records) {
    const e = r.context?.edgeBps;
    if (e === null || e === undefined || e === "") continue;
    const n = Number(e);
    if (!Number.isFinite(n)) continue;
    edges.push(n);
  }
  if (edges.length === 0) return <EmptyChart label="No edgeBps yet" />;

  const min = Math.min(...edges);
  const max = Math.max(...edges);
  const bins = 12;
  const width = Math.max((max - min) / bins, 1);
  const counts = Array.from({ length: bins }, (_, i) => ({
    bucket: Math.round(min + i * width),
    n: 0,
  }));
  for (const e of edges) {
    let idx = Math.floor((e - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx].n += 1;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={counts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis dataKey="bucket" stroke={COLORS.muted} fontSize={10} tickFormatter={(v) => `${v}`} />
        <YAxis stroke={COLORS.muted} fontSize={11} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#12151c",
            border: "1px solid #1e2430",
            fontSize: 12,
          }}
          labelFormatter={(v) => `edge ~ ${v} bps`}
        />
        <Bar dataKey="n" fill={COLORS.accent} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TimelineChart({ records }: { records: Rec[] }) {
  // cumulative accepts / rejects / waits over sequence order
  const sorted = [...records].sort((a, b) =>
    String(a.ts).localeCompare(String(b.ts))
  );
  let a = 0,
    r = 0,
    w = 0;
  const data = sorted.map((rec, i) => {
    const act = actionOf(rec);
    if (act === "accept") a += 1;
    else if (act === "wait") w += 1;
    else r += 1;
    return {
      i: i + 1,
      accept: a,
      reject: r,
      wait: w,
      t: rec.ts?.slice(11, 19) ?? String(i),
    };
  });

  if (data.length === 0) return <EmptyChart label="No timeline yet" />;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis dataKey="i" stroke={COLORS.muted} fontSize={10} />
        <YAxis stroke={COLORS.muted} fontSize={11} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#12151c",
            border: "1px solid #1e2430",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="accept" stroke={COLORS.accept} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="wait" stroke={COLORS.wait} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="reject" stroke={COLORS.reject} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ReasonBars({ records }: { records: Rec[] }) {
  const map = new Map<string, number>();
  for (const r of records) {
    const reason = (r.reason ?? "?").slice(0, 40);
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }
  const data = [...map.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  if (data.length === 0) return <EmptyChart label="No reasons yet" />;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
      >
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis type="number" stroke={COLORS.muted} fontSize={11} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          stroke={COLORS.muted}
          fontSize={10}
        />
        <Tooltip
          contentStyle={{
            background: "#12151c",
            border: "1px solid #1e2430",
            fontSize: 12,
          }}
        />
        <Bar dataKey="n" fill={COLORS.warn} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div
      style={{
        height: 180,
        display: "grid",
        placeItems: "center",
        color: COLORS.muted,
        fontFamily: "var(--mono)",
        fontSize: 12,
      }}
    >
      {label}
    </div>
  );
}
