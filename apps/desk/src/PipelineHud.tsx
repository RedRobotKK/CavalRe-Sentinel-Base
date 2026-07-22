/**
 * Iron Man–style HUD callouts over the 3D stage blocks.
 * Hover / focus / touch a zone → phosphor readout of that stage's variables.
 */

import { useState } from "react";

export type HudStage = {
  id: string;
  label: string;
  pass: number;
  drop: number;
  lines: string[];
};

export function PipelineHud({ stages }: { stages: HudStage[] }) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="pipeline-hud" aria-label="pipeline stage HUD">
      {stages.map((s, i) => {
        const on = active === i;
        return (
          <div
            key={s.id}
            className={`hud-zone${on ? " on" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onTouchStart={() => setActive(i)}
            tabIndex={0}
            role="button"
            aria-label={`${s.label} stage details`}
          >
            <div className="hud-reticle" aria-hidden>
              <span className="hud-corner tl" />
              <span className="hud-corner tr" />
              <span className="hud-corner bl" />
              <span className="hud-corner br" />
            </div>

            {on && (
              <div className={`hud-callout ${i < 4 ? "right" : "left"}`}>
                <div className="hud-callout-head">
                  <span className="hud-tag">{s.label}</span>
                  <span className="hud-idx">0{i + 1}</span>
                </div>
                <div className="hud-metrics">
                  <div className="hud-metric">
                    <em>PASS</em>
                    <strong>{s.pass}</strong>
                  </div>
                  <div className={`hud-metric${s.drop > 0 ? " drop" : ""}`}>
                    <em>DROP</em>
                    <strong>{s.drop}</strong>
                  </div>
                </div>
                <ul className="hud-lines">
                  {s.lines.map((ln) => (
                    <li key={ln}>{ln}</li>
                  ))}
                </ul>
                <div className="hud-scan" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
