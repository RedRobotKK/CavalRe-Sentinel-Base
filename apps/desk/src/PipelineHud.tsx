/**
 * Expert HUD over pipeline blocks.
 * - Latency from cycle heartbeats (ms integers)
 * - Edge figures are the same floor-bps integers the strategy commits
 *   (Amount bigint path — not CSS float approximations)
 * - Hover: targeting reticle + radial pass/drop + cascade readout
 */

import { useEffect, useId, useState } from "react";

export type HudStage = {
  id: string;
  label: string;
  pass: number;
  drop: number;
  lines: string[];
  /** optional spark 0–1 samples for micro activity */
  spark?: number[];
  /** latency strip for POLL */
  latency?: { p50: number | null; p95: number | null; last: number | null; n: number };
};

function Radial({ pass, drop }: { pass: number; drop: number }) {
  const id = useId();
  const total = Math.max(1, pass + drop);
  const passPct = pass / total;
  const r = 18;
  const c = 2 * Math.PI * r;
  const passLen = c * passPct;
  const dropLen = c * (1 - passPct);
  return (
    <svg className="hud-radial" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r={r} className="hud-radial-track" />
      <circle
        cx="24"
        cy="24"
        r={r}
        className="hud-radial-pass"
        strokeDasharray={`${passLen} ${c - passLen}`}
        strokeDashoffset={c * 0.25}
      />
      <circle
        cx="24"
        cy="24"
        r={r}
        className="hud-radial-drop"
        strokeDasharray={`${dropLen} ${c - dropLen}`}
        strokeDashoffset={c * 0.25 - passLen}
      />
      <text x="24" y="26" textAnchor="middle" className="hud-radial-txt">
        {Math.round(passPct * 100)}
      </text>
      <defs>
        <filter id={`${id}-g`}>
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

function Spark({ samples }: { samples: number[] }) {
  if (!samples.length) return null;
  const w = 72;
  const h = 18;
  const max = Math.max(1, ...samples);
  const pts = samples
    .map((v, i) => {
      const x = (i / Math.max(1, samples.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="hud-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} className="hud-spark-line" />
    </svg>
  );
}

function fmtMs(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}ms`;
}

export function PipelineHud({ stages }: { stages: HudStage[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // soft realtime pulse so callouts feel alive while open
  useEffect(() => {
    if (active == null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 400);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div className="pipeline-hud" aria-label="pipeline stage HUD">
      {stages.map((s, i) => {
        const on = active === i;
        const decided = s.pass + s.drop;
        return (
          <div
            key={s.id}
            className={`hud-zone${on ? " on" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onTouchStart={() => setActive((cur) => (cur === i ? null : i))}
            tabIndex={0}
            role="button"
            aria-expanded={on}
            aria-label={`${s.label} stage details`}
          >
            <div className="hud-reticle" aria-hidden>
              <span className="hud-ring" />
              <span className="hud-cross-h" />
              <span className="hud-cross-v" />
              <span className="hud-corner tl" />
              <span className="hud-corner tr" />
              <span className="hud-corner bl" />
              <span className="hud-corner br" />
            </div>

            {on && (
              <div
                className={`hud-callout ${i < 4 ? "right" : "left"}`}
                data-tick={tick}
              >
                <div className="hud-callout-head">
                  <span className="hud-tag">{s.label}</span>
                  <span className="hud-idx">NODE 0{i + 1}</span>
                </div>

                <div className="hud-body-row">
                  <Radial pass={s.pass} drop={s.drop} />
                  <div className="hud-metrics">
                    <div className="hud-metric">
                      <em>PASS</em>
                      <strong className="hud-num">{s.pass}</strong>
                    </div>
                    <div className={`hud-metric${s.drop > 0 ? " drop" : ""}`}>
                      <em>DROP</em>
                      <strong className="hud-num">{s.drop}</strong>
                    </div>
                    <div className="hud-metric thin">
                      <em>FLOW</em>
                      <strong className="hud-num">{decided}</strong>
                    </div>
                  </div>
                </div>

                {s.spark && s.spark.length > 1 && (
                  <div className="hud-spark-wrap">
                    <span className="hud-spark-label">activity</span>
                    <Spark samples={s.spark} />
                  </div>
                )}

                {s.latency && s.latency.n > 0 && (
                  <div className="hud-lat">
                    <div>
                      <em>p50</em>
                      <strong>{fmtMs(s.latency.p50)}</strong>
                    </div>
                    <div>
                      <em>p95</em>
                      <strong>{fmtMs(s.latency.p95)}</strong>
                    </div>
                    <div>
                      <em>last</em>
                      <strong className="hot">{fmtMs(s.latency.last)}</strong>
                    </div>
                  </div>
                )}

                <ul className="hud-lines">
                  {s.lines.map((ln, li) => (
                    <li
                      key={ln}
                      style={{ animationDelay: `${li * 40}ms` }}
                    >
                      {ln}
                    </li>
                  ))}
                </ul>

                <div className="hud-foot">
                  <span>VIEW</span>
                  <span className="hud-pulse" />
                  <span>LIVE</span>
                </div>
                <div className="hud-scan" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
