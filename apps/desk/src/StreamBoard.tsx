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
 * Visual stream: carrier timeline + compact event chips.
 * Replaces the noisy text wall.
 */
export function StreamBoard({ records }: { records: Row[] }) {
  const model = useMemo(() => build(records), [records]);

  return (
    <div className="stream-board panel-rise">
      <div className="stream-board-head">
        <h2>Stream</h2>
        <span className="stream-stats">
          quiet {model.quietPolls} · signal {model.signalPolls} · events{" "}
          {model.events.length}
        </span>
      </div>

      {/* carrier / signal timeline */}
      <div className="stream-rail" title="poll timeline: dim=empty, bright=orders on book">
        {model.rail.map((c, i) => (
          <span
            key={i}
            className={`rail-cell ${c}`}
            style={{ animationDelay: `${(i % 12) * 20}ms` }}
          />
        ))}
      </div>

      {/* event chips — only decisions / unique rejects */}
      <div className="stream-chips">
        {model.events.length === 0 && (
          <span className="chip quiet">listening · no decision events yet</span>
        )}
        {model.events.map((e, i) => (
          <span key={i} className={`chip ${e.cls}`} title={e.detail}>
            <span className="chip-ts">{e.ts}</span>
            {e.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function build(records: Row[]) {
  const newest = [...records].reverse();
  const rail: ("quiet" | "signal" | "accept" | "reject")[] = [];
  let quietPolls = 0;
  let signalPolls = 0;

  const events: { ts: string; label: string; detail: string; cls: string }[] =
    [];
  const seenReject = new Map<string, number>();

  for (const r of newest) {
    const ts = r.ts?.slice(11, 19) ?? "--:--:--";

    if (r.reason === "cycle_heartbeat") {
      const raw = Number(r.context?.raw ?? 0);
      if (raw > 0) {
        signalPolls += 1;
        rail.push("signal");
      } else {
        quietPolls += 1;
        rail.push("quiet");
      }
      continue;
    }

    if (r.kind === "quote_accepted") {
      rail.push("accept");
      events.push({
        ts,
        cls: "accept",
        label: `ACCEPT edge=${r.context?.edgeBps ?? "?"}`,
        detail: r.ref ?? "",
      });
    } else if (r.kind === "quote_rejected") {
      rail.push("reject");
      const key = `${r.reason ?? "?"}|${(r.ref ?? "").slice(0, 12)}`;
      const n = (seenReject.get(key) ?? 0) + 1;
      seenReject.set(key, n);
      if (n === 1) {
        events.push({
          ts,
          cls: "reject",
          label: `REJECT ${(r.reason ?? "").slice(0, 36)}`,
          detail: r.ref ?? "",
        });
      } else if (n === 2 || n % 10 === 0) {
        events.push({
          ts,
          cls: "reject",
          label: `REJECT ×${n} ${(r.reason ?? "").slice(0, 28)}`,
          detail: r.ref ?? "",
        });
      }
    } else if (r.kind === "info" && r.context?.policyAction === "wait") {
      events.push({
        ts,
        cls: "wait",
        label: `WAIT ${(r.reason ?? "").slice(0, 32)}`,
        detail: r.ref ?? "",
      });
    } else if (r.kind === "markout") {
      events.push({
        ts,
        cls: "markout",
        label: `MARK ${r.context?.markoutBps ?? "?"}bps`,
        detail: r.ref ?? "",
      });
    }
  }

  // rail newest on the right
  const railView = rail.slice(0, 64).reverse();

  return {
    quietPolls,
    signalPolls,
    rail: railView,
    events: events.slice(0, 24),
  };
}
