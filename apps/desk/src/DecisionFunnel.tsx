import { useMemo } from "react";

type Rec = {
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null>;
};

const STAGES = [
  { id: "poll", label: "POLL" },
  { id: "parse", label: "PARSE" },
  { id: "classify", label: "CLASS" },
  { id: "resolve", label: "DECAY" },
  { id: "edge", label: "EDGE" },
  { id: "policy", label: "POLICY" },
] as const;

type StageId = (typeof STAGES)[number]["id"];

function stageOf(r: Rec): StageId | "out" {
  const s = String(r.context?.stage ?? "");
  if (s === "parse" || r.reason === "invalid_amount_string" || r.reason?.startsWith("input.") || r.reason?.startsWith("output."))
    return "parse";
  if (s === "classify" || r.reason?.startsWith("class_not_tradable")) return "classify";
  if (s === "resolve" || r.reason?.includes("decay")) return "resolve";
  if (s === "edge" || r.reason?.includes("edge_")) return "edge";
  if (s === "policy" || s === "risk" || r.kind === "quote_accepted") return "policy";
  if (r.reason === "cycle_heartbeat") return "poll";
  return "parse";
}

function actionOf(r: Rec): "accept" | "reject" | "wait" | "info" {
  if (r.kind === "quote_accepted" || r.context?.policyAction === "accept") return "accept";
  if (r.context?.policyAction === "wait" || r.kind === "info") {
    if (r.reason === "cycle_heartbeat") return "info";
    return "wait";
  }
  if (r.kind === "quote_rejected") return "reject";
  return "info";
}

/**
 * Funnel + decision tree — how orders die or survive the pipeline.
 */
export function DecisionFunnel({ records }: { records: Rec[] }) {
  const m = useMemo(() => build(records), [records]);

  const maxIn = Math.max(1, m.funnel[0]?.in ?? 1);

  return (
    <div className="decision-panel panel-rise">
      <div className="decision-head">
        <h2>Decision funnel</h2>
        <span className="stream-stats">
          in {m.seen} · accept {m.accepts} · wait {m.waits} · reject {m.rejects}
        </span>
      </div>

      {/* Horizontal funnel bars */}
      <div className="funnel-rows">
        {m.funnel.map((row) => {
          const pct = Math.max(4, Math.round((row.in / maxIn) * 100));
          const dropPct =
            row.dropped > 0 ? Math.round((row.dropped / Math.max(1, row.in + row.dropped)) * 100) : 0;
          return (
            <div className="funnel-row" key={row.id}>
              <div className="funnel-label">{row.label}</div>
              <div className="funnel-track">
                <div
                  className={`funnel-fill ${row.id}`}
                  style={{ width: `${pct}%` }}
                  title={`${row.in} through`}
                />
                {row.dropped > 0 && (
                  <span className="funnel-drop">−{row.dropped}</span>
                )}
              </div>
              <div className="funnel-n">{row.in}</div>
            </div>
          );
        })}
      </div>

      {/* Decision tree */}
      <h2 style={{ marginTop: 12 }}>Decision tree</h2>
      <svg className="tree-svg" viewBox="0 0 720 200" preserveAspectRatio="xMidYMid meet">
        {/* trunk */}
        <path
          d="M40 100 H160"
          className="tree-edge"
        />
        <TreeNode x={40} y={100} label="ORDERS" sub={String(m.seen)} hot={m.seen > 0} />

        {/* parse branch */}
        <path d="M160 100 H260" className="tree-edge" />
        <path d="M260 100 L260 40 H360" className="tree-edge reject" />
        <path d="M260 100 L260 160 H360" className="tree-edge" />
        <TreeNode x={160} y={100} label="PARSE" sub={String(m.byStage.parse ?? 0)} hot />
        <TreeNode
          x={360}
          y={40}
          label="FAIL"
          sub={String(m.parseFail)}
          tone="reject"
        />
        <TreeNode x={360} y={160} label="OK" sub={String(m.parseOk)} tone="ok" />

        {/* classify */}
        <path d="M360 160 H440" className="tree-edge" />
        <path d="M440 160 L440 100 H520" className="tree-edge reject" />
        <path d="M440 160 L440 190 H520" className="tree-edge" />
        <TreeNode x={440} y={160} label="CLASS" sub="" hot />
        <TreeNode
          x={520}
          y={100}
          label="SKIP"
          sub={String(m.classReject)}
          tone="reject"
        />
        <TreeNode x={520} y={190} label="DUTCH" sub={String(m.dutch)} tone="ok" />

        {/* policy outcomes */}
        <path d="M520 190 H580" className="tree-edge" />
        <path d="M600 190 L640 50" className="tree-edge accept" />
        <path d="M600 190 L640 120" className="tree-edge wait" />
        <path d="M600 190 L640 190" className="tree-edge reject" />
        <TreeNode x={600} y={190} label="POLICY" sub="" hot />
        <TreeNode x={680} y={50} label="ACCEPT" sub={String(m.accepts)} tone="accept" />
        <TreeNode x={680} y={120} label="WAIT" sub={String(m.waits)} tone="wait" />
        <TreeNode x={680} y={190} label="REJECT" sub={String(m.policyReject)} tone="reject" />
      </svg>

      {/* Top drop reasons as compact tags, not a wall */}
      {m.topReasons.length > 0 && (
        <div className="reason-tags">
          {m.topReasons.map((r) => (
            <span key={r.name} className="chip reject" title={r.name}>
              {r.name.slice(0, 28)} <strong>×{r.n}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({
  x,
  y,
  label,
  sub,
  tone,
  hot,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  tone?: "accept" | "reject" | "wait" | "ok";
  hot?: boolean;
}) {
  return (
    <g transform={`translate(${x},${y})`} className={`tree-node ${tone ?? ""} ${hot ? "hot" : ""}`}>
      <rect x={-34} y={-14} width={68} height={28} rx={3} />
      <text y={-1} className="tree-label">
        {label}
      </text>
      {sub !== "" && (
        <text y={11} className="tree-sub">
          {sub}
        </text>
      )}
    </g>
  );
}

function build(records: Rec[]) {
  let accepts = 0;
  let waits = 0;
  let rejects = 0;
  let parseFail = 0;
  let parseOk = 0;
  let classReject = 0;
  let dutch = 0;
  let policyReject = 0;
  let seen = 0;

  const byStage: Record<string, number> = {};
  const reasonMap = new Map<string, number>();

  // heartbeats give raw count approximation
  let maxRaw = 0;
  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      maxRaw = Math.max(maxRaw, Number(r.context?.raw ?? 0));
      continue;
    }
    seen += 1;
    const st = stageOf(r);
    byStage[st] = (byStage[st] ?? 0) + 1;
    const act = actionOf(r);
    if (act === "accept") accepts += 1;
    else if (act === "wait") waits += 1;
    else if (act === "reject") {
      rejects += 1;
      const reason = (r.reason ?? "reject").slice(0, 48);
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
      if (st === "parse") parseFail += 1;
      else if (st === "classify") classReject += 1;
      else policyReject += 1;
    }
    if (r.context?.orderClass === "dutch" || st === "policy" || st === "edge") {
      // counted loosely
    }
    if (
      act !== "reject" ||
      (st !== "parse" && st !== "classify")
    ) {
      if (st !== "parse" || act !== "reject") parseOk += 1;
    }
    if (r.context?.orderClass === "dutch") dutch += 1;
  }

  // if we never classified dutch explicitly, estimate survivors past class
  if (dutch === 0) dutch = Math.max(0, parseOk - classReject);

  const topReasons = [...reasonMap.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  // funnel: cumulative "still in" estimate
  const pollIn = Math.max(seen, maxRaw, rejects + accepts + waits);
  const afterParse = Math.max(0, pollIn - parseFail);
  const afterClass = Math.max(0, afterParse - classReject);
  const afterPolicy = accepts + waits;

  const funnel = [
    { id: "poll", label: "POLL", in: pollIn, dropped: 0 },
    { id: "parse", label: "PARSE", in: afterParse, dropped: parseFail },
    { id: "classify", label: "CLASS", in: afterClass, dropped: classReject },
    {
      id: "policy",
      label: "POLICY",
      in: afterPolicy,
      dropped: Math.max(0, afterClass - afterPolicy),
    },
    { id: "accept", label: "ACCEPT", in: accepts, dropped: 0 },
  ];

  return {
    seen: pollIn,
    accepts,
    waits,
    rejects,
    parseFail,
    parseOk: Math.max(parseOk, afterParse),
    classReject,
    dutch: afterClass,
    policyReject,
    byStage,
    topReasons,
    funnel,
  };
}
