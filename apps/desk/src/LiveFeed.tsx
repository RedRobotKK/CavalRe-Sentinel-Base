import { useMemo } from "react";

type Row = {
  seq?: number;
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null>;
};

/**
 * Collapse heartbeat spam into carrier lines; surface signal events.
 */
export function LiveFeed({
  records,
  tick,
}: {
  records: Row[];
  tick: number;
}) {
  const lines = useMemo(() => buildLines(records), [records]);

  return (
    <div className="feed-panel panel-rise">
      <h2>
        On-stream · UniswapX Base poll
        <span className="cursor-blink" />
        <span className="feed-meta"> cycle {tick}</span>
      </h2>
      <div className="feed-scroll">
        {lines.length === 0 && (
          <div className="feed-line info">
            <span className="ts">--:--:--</span> no carrier yet — start dry-run
          </div>
        )}
        {lines.map((ln, i) => (
          <div key={i} className={`feed-line ${ln.cls}`}>
            <span className="ts">{ln.ts}</span> {ln.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildLines(records: Row[]) {
  const newest = [...records].reverse();
  const out: { ts: string; text: string; cls: string }[] = [];

  let carrierRun = 0;
  let carrierTs = "";
  let lastRaw = "0";

  const flushCarrier = () => {
    if (carrierRun === 0) return;
    out.push({
      ts: carrierTs,
      cls: "info",
      text:
        carrierRun === 1
          ? `carrier · heartbeat · raw=${lastRaw} · book quiet`
          : `carrier · ${carrierRun} polls · raw=${lastRaw} · noise floor (no open Dutch_V3)`,
    });
    carrierRun = 0;
  };

  for (const r of newest) {
    const ts = r.ts?.slice(11, 19) ?? "--:--:--";
    const isHb = r.reason === "cycle_heartbeat" || r.context?.stage === "poll";

    if (isHb && r.kind === "info") {
      const raw = String(r.context?.raw ?? "0");
      lastRaw = raw;
      if (raw !== "0") {
        flushCarrier();
        out.push({
          ts,
          cls: "accept",
          text: `SIGNAL · open orders raw=${raw} acc=${r.context?.accepted ?? 0} rej=${r.context?.rejected ?? 0} wait=${r.context?.waited ?? 0}`,
        });
      } else {
        if (carrierRun === 0) carrierTs = ts;
        carrierRun += 1;
      }
      continue;
    }

    flushCarrier();

    if (r.kind === "quote_accepted") {
      out.push({
        ts,
        cls: "accept",
        text: `ACCEPT · edge=${r.context?.edgeBps ?? "?"} class=${r.context?.orderClass ?? "?"} ${(r.ref ?? "").slice(0, 14)}`,
      });
    } else if (r.kind === "quote_rejected") {
      out.push({
        ts,
        cls: "reject",
        text: `REJECT · ${(r.reason ?? "").slice(0, 40)} ${(r.ref ?? "").slice(0, 12)}`,
      });
    } else if (r.kind === "markout") {
      out.push({
        ts,
        cls: "markout",
        text: `MARKOUT · ${r.context?.markoutBps ?? r.reason ?? ""} bps · win=${String(Number(r.context?.markoutBps ?? 0) >= 0)}`,
      });
    } else {
      out.push({
        ts,
        cls: "wait",
        text: `${(r.kind ?? "evt").toUpperCase()} · ${(r.reason ?? "").slice(0, 48)}`,
      });
    }
  }
  flushCarrier();
  return out.slice(0, 60);
}
