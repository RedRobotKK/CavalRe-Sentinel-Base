/** Amber phosphor intent feed — sits behind the 3D stage blocks. */

import { useMemo } from "react";

type Rec = {
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null | undefined>;
};

function fmt(r: Rec): string {
  const t = (r.ts ?? "").slice(11, 19) || "--:--:--";
  const act =
    String(r.context?.policyAction ?? "") ||
    (r.kind === "quote_accepted"
      ? "ACCEPT"
      : r.kind === "quote_rejected"
        ? "REJECT"
        : r.reason === "cycle_heartbeat"
          ? "HB"
          : "RX");
  const ref = String(r.ref ?? "········").slice(0, 10);
  const edge =
    r.context?.edgeBps != null && r.context.edgeBps !== ""
      ? `${Number(r.context.edgeBps) > 0 ? "+" : ""}${r.context.edgeBps}bps`
      : "";
  const why = String(r.reason ?? "").slice(0, 22);
  return `${t}  ${act.padEnd(6)}  ${ref}  ${edge}  ${why}`;
}

export function PipelineWire({ records }: { records: Rec[] }) {
  const lines = useMemo(() => {
    const picked = records
      .filter(
        (r) =>
          r.kind === "quote_accepted" ||
          r.kind === "quote_rejected" ||
          r.reason === "cycle_heartbeat" ||
          (r.kind === "info" && r.context?.policyAction)
      )
      .slice(-36);
    if (picked.length === 0) {
      return [
        "LISTEN  UniswapX Dutch_V3 · Base",
        "MODE    VIEW · write=OFF",
        "WIRE    open channel",
      ];
    }
    return picked.map(fmt);
  }, [records]);

  return (
    <div className="pipeline-wire" aria-hidden>
      <div className="pipeline-wire-scroll">
        {lines.map((ln, i) => (
          <div
            key={`${i}-${ln.slice(0, 18)}`}
            className={`pipeline-wire-line${i === lines.length - 1 ? " hot" : ""}`}
          >
            {ln}
          </div>
        ))}
        <div className="pipeline-wire-line cursor">█ RX …</div>
      </div>
    </div>
  );
}
