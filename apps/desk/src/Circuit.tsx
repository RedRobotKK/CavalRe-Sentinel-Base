import { useEffect, useMemo, useRef, useState } from "react";
import { PipelineScene } from "./gl/PipelineScene";
import { PipelineWire } from "./PipelineWire";
import { PipelineHud, type HudStage } from "./PipelineHud";

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

const STAGE_LABEL: Record<StageId, string> = {
  poll: "Poll",
  parse: "Parse",
  classify: "Classify",
  decay: "Decay",
  edge: "Edge",
  risk: "Risk",
  policy: "Policy",
  book: "Book",
};

type Signal = {
  id: string;
  ts: string;
  ref: string;
  action: "accept" | "reject" | "wait";
  reasonRaw: string;
  reason: string;
  orderClass: string;
  edgeBps: string;
  edgeLabel: string;
  stage: StageId;
  stageLabel: string;
};

function humanReason(reason: string, orderClass: string): string {
  const r = reason.trim();
  if (r.startsWith("class_not_tradable:exclusive"))
    return "Skipped — exclusive filler";
  if (r.startsWith("class_not_tradable:priority"))
    return "Skipped — priority order";
  if (r.startsWith("class_not_tradable"))
    return `Skipped — ${orderClass || "not tradable"}`;
  if (r === "edge_ok") return "Edge above threshold";
  if (r === "edge_negative") return "Edge negative vs AMM";
  if (r === "edge_negative_wait_decay") return "Waiting — negative edge, still early";
  if (r === "edge_below_min") return "Edge too thin";
  if (r === "early_decay_thin_edge") return "Waiting — early in Dutch curve";
  if (r === "toxicity_high") return "Toxicity too high";
  if (r === "below_min_notional") return "Below minimum size";
  if (r === "exceeds_max_position_size") return "Over max position";
  if (r === "exceeds_current_equity") return "Over working capital";
  if (r === "zero_notional") return "Zero size";
  if (r.startsWith("edge_undefined")) {
    const detail = r.replace(/^edge_undefined:?/, "").trim();
    return detail
      ? `No AMM quote (${detail.slice(0, 40)})`
      : "No AMM reference quote";
  }
  if (r.includes("decay") || r.includes("IncorrectAmounts"))
    return "Decay / amount error";
  if (r.startsWith("risk")) return r.replace(/_/g, " ");
  return r.replace(/_/g, " ").slice(0, 48);
}

/** Display only — values are already floor-bps integers from strategy. */
function formatEdge(raw: string | null | undefined): { value: string; label: string } {
  if (raw == null || raw === "" || raw === "—") {
    return { value: "—", label: "—" };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: String(raw), label: String(raw) };
  // integer bps — matches edgeBps floor path (no CSS float math)
  const i = Math.trunc(n);
  const sign = i > 0 ? "+" : "";
  return { value: String(i), label: `${sign}${i} bps` };
}

function shortRef(ref: string): string {
  if (!ref || ref === "—") return "—";
  if (ref.length <= 14) return ref;
  return `${ref.slice(0, 8)}…${ref.slice(-4)}`;
}

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

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
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
  let exclusiveDrops = 0;
  let priorityDrops = 0;
  let edgeNeg = 0;
  let edgeOk = 0;
  let edgeSum = 0;
  let edgeN = 0;
  let v3Path = 0;
  let v2Path = 0;
  const latencies: number[] = [];
  const rawSpark: number[] = [];
  const edgeSpark: number[] = [];
  const signals: Signal[] = [];
  let lastHit: StageId = "poll";

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      heartbeats += 1;
      lastRaw = Number(r.context?.raw ?? lastRaw);
      pass.poll += 1;
      const lat = Number(r.context?.latencyMs ?? NaN);
      if (Number.isFinite(lat) && lat > 0) latencies.push(lat);
      rawSpark.push(Math.max(0, Number(r.context?.raw ?? 0)));
      continue;
    }

    const path = String(r.context?.resolvePath ?? "");
    if (path === "v3_block") v3Path += 1;
    if (path === "v2_time") v2Path += 1;

    if (
      r.kind !== "quote_accepted" &&
      r.kind !== "quote_rejected" &&
      !(r.kind === "info" && r.context?.policyAction === "wait")
    ) {
      continue;
    }

    const action =
      (r.context?.policyAction as Signal["action"]) ??
      (r.kind === "quote_accepted"
        ? "accept"
        : r.kind === "info"
          ? "wait"
          : "reject");

    if (action === "accept") accept += 1;
    else if (action === "wait") wait += 1;
    else reject += 1;

    const reasonRaw = String(r.reason ?? "");
    if (reasonRaw.includes("exclusive")) exclusiveDrops += 1;
    if (reasonRaw.includes("priority")) priorityDrops += 1;
    if (reasonRaw === "edge_negative") edgeNeg += 1;
    if (reasonRaw === "edge_ok") edgeOk += 1;

    const eb = r.context?.edgeBps;
    if (eb != null && eb !== "" && Number.isFinite(Number(eb))) {
      const v = Math.trunc(Number(eb)); // floor-aligned integer bps
      edgeSum += v;
      edgeN += 1;
      edgeSpark.push(Math.abs(v));
    }

    const st = stageFrom(r);
    lastHit = st;
    const idx = PATH.indexOf(st);

    if (action === "reject") {
      drop[st] += 1;
      for (let i = 0; i < idx; i++) pass[PATH[i]!] += 1;
    } else {
      const end = action === "accept" ? PATH.length : PATH.indexOf("policy") + 1;
      for (let i = 0; i < end; i++) pass[PATH[i]!] += 1;
      if (action === "accept") pass.book += 1;
    }

    const ref = String(r.ref ?? "");
    const orderClass = String(r.context?.orderClass ?? "—");
    const edge = formatEdge(
      r.context?.edgeBps != null && r.context.edgeBps !== ""
        ? String(r.context.edgeBps)
        : null
    );

    signals.push({
      id: `${r.seq ?? ""}-${r.ts ?? ""}-${ref}-${action}`,
      ts: r.ts?.slice(11, 19) ?? "—",
      ref: shortRef(ref),
      action,
      reasonRaw,
      reason: humanReason(reasonRaw, orderClass),
      orderClass,
      edgeBps: edge.value,
      edgeLabel: edge.label,
      stage: st,
      stageLabel: STAGE_LABEL[st],
    });
  }

  const log = [...signals].reverse().slice(0, 40);
  const meanEdge = edgeN > 0 ? Math.trunc(edgeSum / edgeN) : null;
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const latency = {
    p50: percentile(sortedLat, 0.5),
    p95: percentile(sortedLat, 0.95),
    last: latencies.length ? latencies[latencies.length - 1]! : null,
    n: latencies.length,
  };

  const funnel = STAGES.map((s) => ({
    label: s.label,
    pass: pass[s.id],
    drop: drop[s.id],
  }));

  const hud: HudStage[] = [
    {
      id: "poll",
      label: "POLL",
      pass: pass.poll,
      drop: drop.poll,
      spark: rawSpark.slice(-16),
      latency,
      lines: [
        `heartbeats ${heartbeats}`,
        `last raw ${lastRaw}`,
        latency.last != null ? `last poll ${Math.round(latency.last)}ms` : "last poll —",
        `source UniswapX · Base`,
      ],
    },
    {
      id: "parse",
      label: "PARSE",
      pass: pass.parse,
      drop: drop.parse,
      lines: [
        `orders decoded ${pass.parse}`,
        `Amount = bigint`,
        `curve fields extracted`,
        `fail-closed on bad payload`,
      ],
    },
    {
      id: "classify",
      label: "CLASS",
      pass: pass.classify,
      drop: drop.classify,
      spark: [exclusiveDrops, priorityDrops, drop.classify].map((n) => n || 0.01),
      lines: [
        `exclusive drops ${exclusiveDrops}`,
        `priority drops ${priorityDrops}`,
        `tradable dutch only`,
        `block clock for exclusivity`,
      ],
    },
    {
      id: "decay",
      label: "DECAY",
      pass: pass.decay,
      drop: drop.decay,
      lines: [
        `v3_block path ${v3Path}`,
        `v2_time fallback ${v2Path}`,
        `decayAtBlock piecewise`,
        `inclusion lag ≤ 5`,
      ],
    },
    {
      id: "edge",
      label: "EDGE",
      pass: pass.edge,
      drop: drop.edge,
      spark: edgeSpark.slice(-16),
      lines: [
        `edge_ok ${edgeOk}`,
        `edge_negative ${edgeNeg}`,
        meanEdge != null
          ? `mean edge ${meanEdge > 0 ? "+" : ""}${meanEdge} bps`
          : "mean edge —",
        `floor bps · QuoterV2 ref`,
      ],
    },
    {
      id: "risk",
      label: "RISK",
      pass: pass.risk,
      drop: drop.risk,
      lines: [
        `working capital gate`,
        `max position %`,
        `toxicity check`,
        `fail-closed`,
      ],
    },
    {
      id: "policy",
      label: "POLICY",
      pass: pass.policy,
      drop: drop.policy,
      spark: [accept, wait, reject].map((n) => n || 0.01),
      lines: [
        `accept ${accept}`,
        `wait ${wait}`,
        `reject ${reject}`,
        `dry-run · capital OFF`,
      ],
    },
    {
      id: "book",
      label: "BOOK",
      pass: pass.book,
      drop: drop.book,
      lines: [
        `posted accepts ${accept}`,
        `VirtualBooks debit/credit`,
        `Source sleeve invariant`,
        `markout pending`,
      ],
    },
  ];

  return {
    heartbeats,
    lastRaw,
    accept,
    wait,
    reject,
    seen: accept + wait + reject,
    signalsThrough: accept + wait,
    funnel,
    hud,
    log,
    lastHit,
    live: records.length > 0,
    latency,
  };
}

export function Circuit({
  records,
  pulseKey,
}: {
  records: any[];
  pulseKey: number;
}) {
  const m = useMemo(() => build(records), [records]);
  const logRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);
  const [wave, setWave] = useState(0);

  useEffect(() => {
    if (!logRef.current) return;
    if (m.log.length >= prevLen.current) logRef.current.scrollTop = 0;
    prevLen.current = m.log.length;
  }, [m.log.length, pulseKey]);

  useEffect(() => {
    const end = Math.max(0, PATH.indexOf(m.lastHit));
    let i = 0;
    setWave(0);
    const step = window.setInterval(() => {
      if (i >= end) {
        window.clearInterval(step);
        setWave(end);
        return;
      }
      i += 1;
      setWave(i);
    }, 160);
    return () => window.clearInterval(step);
  }, [pulseKey, m.lastHit]);

  if (!m.live) {
    return (
      <div className="pipe panel-rise">
        <div className="pipe-head">
          <h2>Pipeline</h2>
          <span className="pipe-hint">open channel idle</span>
        </div>
        <div className="pipe-empty">Listening…</div>
      </div>
    );
  }

  const activeStage = Math.max(wave, PATH.indexOf(m.lastHit));

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
          {m.latency.last != null && (
            <span className="ok">
              <em>lat</em> {Math.round(m.latency.last)}ms
            </span>
          )}
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

      <div className="pass-banner">
        <span className="pass-banner-label">signals through policy</span>
        <span className="pass-banner-n">{m.signalsThrough}</span>
        <span className="pass-banner-sub">
          accept {m.accept} · wait {m.wait} · dropped {m.reject}
          {m.latency.p95 != null ? ` · p95 ${Math.round(m.latency.p95)}ms` : ""}
        </span>
      </div>

      <div className="chain-stage chain-stage-3d">
        <PipelineWire records={records} />
        <PipelineScene
          pulseKey={pulseKey}
          activeStage={activeStage}
          intensity={Math.min(1, 0.4 + m.seen / 40)}
          stages={m.funnel}
        />
        <PipelineHud stages={m.hud} />
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

      <div className="intent-log">
        <div className="intent-log-head">
          <span>
            Intent signals <span className="live-dot" /> LIVE
          </span>
          <span className="muted">newest first · {m.log.length}/40</span>
        </div>

        <div className="intent-cols">
          <span>Time</span>
          <span>Decision</span>
          <span>Order</span>
          <span>Type</span>
          <span>Dropped at</span>
          <span>Edge</span>
          <span>Why</span>
        </div>

        <div className="intent-log-body" ref={logRef}>
          {m.log.length === 0 && (
            <div className="intent-log-empty">channel open — waiting…</div>
          )}
          {m.log.map((s, i) => (
            <div
              key={s.id}
              className={`intent-line ${s.action}${i === 0 ? " newest" : ""}`}
              title={s.reasonRaw}
            >
              <span className="il-ts">{s.ts}</span>
              <span className={`il-action ${s.action}`}>{s.action}</span>
              <span className="il-ref" title={s.ref}>
                {s.ref}
              </span>
              <span className="il-class">{s.orderClass}</span>
              <span className="il-stage">{s.stageLabel}</span>
              <span
                className={`il-edge ${
                  s.edgeBps !== "—" && Number(s.edgeBps) > 0
                    ? "pos"
                    : s.edgeBps !== "—" && Number(s.edgeBps) < 0
                      ? "neg"
                      : ""
                }`}
              >
                {s.edgeLabel}
              </span>
              <span className="il-reason">{s.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
