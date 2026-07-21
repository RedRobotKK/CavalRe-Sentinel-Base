import { useEffect, useMemo, useRef, useState } from "react";
import { PipelineScene } from "./gl/PipelineScene";

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

type Signal = {
  id: string;
  ts: string;
  ref: string;
  action: "accept" | "reject" | "wait";
  reason: string;
  orderClass: string;
  edgeBps: string;
  stage: StageId;
};

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
  const signals: Signal[] = [];
  let lastHit: StageId = "poll";

  for (const r of records) {
    if (r.reason === "cycle_heartbeat") {
      heartbeats += 1;
      lastRaw = Number(r.context?.raw ?? lastRaw);
      pass.poll += 1;
      continue;
    }

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

    const st = stageFrom(r);
    lastHit = st;
    const idx = PATH.indexOf(st);

    if (action === "reject") {
      drop[st] += 1;
      for (let i = 0; i < idx; i++) pass[PATH[i]] += 1;
    } else {
      const end = action === "accept" ? PATH.length : PATH.indexOf("policy") + 1;
      for (let i = 0; i < end; i++) pass[PATH[i]] += 1;
      if (action === "accept") pass.book += 1;
    }

    const ref = String(r.ref ?? "");
    signals.push({
      id: `${r.seq ?? ""}-${r.ts ?? ""}-${ref}-${action}`,
      ts: r.ts?.slice(11, 19) ?? "—",
      ref: ref ? ref.slice(0, 14) : "—",
      action,
      reason: String(r.reason ?? "").slice(0, 56),
      orderClass: String(r.context?.orderClass ?? "—"),
      edgeBps:
        r.context?.edgeBps != null && r.context.edgeBps !== ""
          ? String(r.context.edgeBps)
          : "—",
      stage: st,
    });
  }

  const log = [...signals].reverse().slice(0, 40);

  const funnel = STAGES.map((s) => ({
    label: s.label,
    pass: pass[s.id],
    drop: drop[s.id],
  }));

  return {
    heartbeats,
    lastRaw,
    accept,
    wait,
    reject,
    seen: accept + wait + reject,
    signalsThrough: accept + wait,
    funnel,
    log,
    lastHit,
    live: records.length > 0,
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
        </span>
      </div>

      <div className="chain-stage chain-stage-3d">
        <PipelineScene
          pulseKey={pulseKey}
          activeStage={activeStage}
          intensity={Math.min(1, 0.4 + m.seen / 40)}
          stages={m.funnel}
        />
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
          <span className="muted">newest first · rolling {m.log.length}/40</span>
        </div>
        <div className="intent-log-body" ref={logRef}>
          {m.log.length === 0 && (
            <div className="intent-log-empty">channel open — waiting…</div>
          )}
          {m.log.map((s, i) => (
            <div
              key={s.id}
              className={`intent-line ${s.action}${i === 0 ? " newest" : ""}`}
            >
              <span className="il-ts">{s.ts}</span>
              <span className={`il-action ${s.action}`}>{s.action}</span>
              <span className="il-ref">{s.ref}</span>
              <span className="il-class">{s.orderClass}</span>
              <span className="il-stage">{s.stage}</span>
              <span className="il-edge">e={s.edgeBps}</span>
              <span className="il-reason" title={s.reason}>
                {s.reason}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
