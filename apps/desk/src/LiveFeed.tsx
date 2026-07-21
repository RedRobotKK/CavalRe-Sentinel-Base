import { useMemo } from "react";

type Row = {
  seq?: number;
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null>;
};

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
        On-stream · UniswapX Base
        <span className="cursor-blink" />
        <span className="feed-meta">poll {tick}</span>
      </h2>
      <div className="feed-scroll">
        {lines.length === 0 && (
          <div className="feed-line info">
            <span className="ts">--:--:--</span> no carrier — start dry-run or simulate
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

  let quietRun = 0;
  let quietTs = "";
  let signalRun = 0;
  let signalTs = "";
  let signalRaw = "0";
  let signalAcc = "0";
  let signalRej = "0";

  const flushQuiet = () => {
    if (quietRun === 0) return;
    out.push({
      ts: quietTs,
      cls: "info",
      text:
        quietRun === 1
          ? "carrier · 1 poll · book empty"
          : `carrier · ${quietRun} polls · book empty (noise floor)`,
    });
    quietRun = 0;
  };

  const flushSignal = () => {
    if (signalRun === 0) return;
    out.push({
      ts: signalTs,
      cls: "accept",
      text:
        signalRun === 1
          ? `SIGNAL · open orders raw=${signalRaw} A/R=${signalAcc}/${signalRej}`
          : `SIGNAL · ${signalRun} polls with book · last raw=${signalRaw} A/R=${signalAcc}/${signalRej}`,
    });
    signalRun = 0;
  };

  for (const r of newest) {
    const ts = r.ts?.slice(11, 19) ?? "--:--:--";
    const isHb = r.reason === "cycle_heartbeat";

    if (isHb) {
      const raw = String(r.context?.raw ?? "0");
      const acc = String(r.context?.accepted ?? "0");
      const rej = String(r.context?.rejected ?? "0");
      if (raw === "0") {
        flushSignal();
        if (quietRun === 0) quietTs = ts;
        quietRun += 1;
      } else {
        flushQuiet();
        if (signalRun === 0) signalTs = ts;
        signalRun += 1;
        signalRaw = raw;
        signalAcc = acc;
        signalRej = rej;
      }
      continue;
    }

    flushQuiet();
    flushSignal();

    if (r.kind === "quote_accepted") {
      out.push({
        ts,
        cls: "accept",
        text: `ACCEPT · edge=${r.context?.edgeBps ?? "?"}bps · ${r.context?.orderClass ?? "?"} · ${(r.ref ?? "").slice(0, 14)}`,
      });
    } else if (r.kind === "quote_rejected") {
      out.push({
        ts,
        cls: "reject",
        text: `REJECT · ${(r.reason ?? "").slice(0, 56)} · ${(r.ref ?? "").slice(0, 12)}`,
      });
    } else if (r.kind === "markout") {
      out.push({
        ts,
        cls: "markout",
        text: `MARKOUT · ${r.context?.markoutBps ?? "?"}bps · ${(r.ref ?? "").slice(0, 12)}`,
      });
    } else if (r.kind === "info") {
      out.push({
        ts,
        cls: "wait",
        text: `WAIT · ${(r.reason ?? "").slice(0, 52)}`,
      });
    } else {
      out.push({
        ts,
        cls: "wait",
        text: `${(r.kind ?? "evt").toUpperCase()} · ${(r.reason ?? "").slice(0, 48)}`,
      });
    }
  }

  flushQuiet();
  flushSignal();
  return out.slice(0, 80);
}
