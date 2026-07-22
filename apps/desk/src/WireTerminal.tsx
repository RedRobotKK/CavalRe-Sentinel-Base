/**
 * Wyse / VT-style phosphor wire — transparent ingest of intent traffic.
 * Sits behind panels; does not steal focus from the hero pipeline.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type Rec = {
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null | undefined>;
};

function lineFrom(r: Rec): string {
  const t = (r.ts ?? "").slice(11, 19) || "--:--:--";
  const ref = String(r.ref ?? "").slice(0, 12) || "0x········";
  const stage = String(r.context?.stage ?? r.kind ?? "wire");
  const action =
    String(r.context?.policyAction ?? "") ||
    (r.kind === "quote_accepted"
      ? "accept"
      : r.kind === "quote_rejected"
        ? "reject"
        : r.reason === "cycle_heartbeat"
          ? "hb"
          : "info");
  const edge =
    r.context?.edgeBps != null && r.context.edgeBps !== ""
      ? ` e=${r.context.edgeBps}`
      : "";
  const path =
    r.context?.resolvePath != null ? ` path=${r.context.resolvePath}` : "";
  const cls =
    r.context?.orderClass != null ? ` class=${r.context.orderClass}` : "";
  const why = String(r.reason ?? "").slice(0, 28);
  return `${t}  ${action.padEnd(6)}  ${stage.padEnd(8)}  ${ref}${cls}${edge}${path}  ${why}`;
}

const IDLE_TICKS = [
  "RX  open channel · UniswapX Dutch_V3 · Base",
  "LISTEN  api.uniswap.org/v2/orders  chainId=8453",
  "CLOCK  eth_blockNumber · decayStartBlock · resolve",
  "MODE   VIEW · write=OFF · liveCapital=false",
  "POSTURE fail-closed · exclusive → classify drop",
  "MATH   Amount=bigint · edgeBps=floor · path=v3|v2",
];

export function WireTerminal({
  records,
  activeFile,
}: {
  records: Rec[];
  activeFile?: string | null;
}) {
  const [tick, setTick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const fromJournal = records
      .filter(
        (r) =>
          r.kind === "quote_accepted" ||
          r.kind === "quote_rejected" ||
          r.reason === "cycle_heartbeat" ||
          (r.kind === "info" && r.context?.policyAction)
      )
      .slice(-80)
      .map(lineFrom);

    if (fromJournal.length === 0) {
      return IDLE_TICKS.map((s, i) => `00:00:0${i}  idle    link     ${s}`);
    }
    return fromJournal;
  }, [records]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 900);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, tick]);

  const header = activeFile
    ? `SENTINEL-WIRE // ${activeFile.replace(/\.jsonl$/, "").slice(0, 36)}`
    : "SENTINEL-WIRE // open channel";

  // soft cursor blink index
  const cursorLine = lines.length + (tick % 2);

  return (
    <div className="wire-term" aria-hidden>
      <div className="wire-term-bezel">
        <div className="wire-term-hdr">
          <span>{header}</span>
          <span className="wire-term-rx">RX {lines.length}</span>
        </div>
        <div className="wire-term-body" ref={scroller}>
          {lines.map((ln, i) => (
            <div
              key={`${i}-${ln.slice(0, 24)}`}
              className={`wire-term-line${i === lines.length - 1 ? " hot" : ""}`}
            >
              {ln}
            </div>
          ))}
          <div className="wire-term-line cursor">
            {tick % 2 === 0 ? "█" : "▓"} awaiting intent…
          </div>
          {/* pad so scroll feels like a long roll */}
          {Array.from({ length: Math.max(0, 12 - lines.length) }).map((_, i) => (
            <div key={`pad-${i}`} className="wire-term-line dim">
              {IDLE_TICKS[i % IDLE_TICKS.length]}
            </div>
          ))}
          <span className="sr-only">{cursorLine}</span>
        </div>
      </div>
      <div className="wire-term-scan" />
      <div className="wire-term-vignette" />
    </div>
  );
}
