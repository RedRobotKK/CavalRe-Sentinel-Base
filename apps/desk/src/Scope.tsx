import { useEffect, useRef } from "react";

export type ScopeSample = {
  t: number;
  raw: number;
  accepted: number;
  rejected: number;
  waited: number;
};

/**
 * Signal-in-noise scope: continuous carrier (poll), bursts when raw>0.
 * Not a boring line chart — phosphor beam + noise floor + waterfall.
 */
export function Scope({ samples }: { samples: ScopeSample[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let alive = true;

    const paint = () => {
      if (!alive) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 600;
      const h = canvas.clientHeight || 140;
      if (canvas.width !== Math.floor(w * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const now = performance.now() / 1000;

      // CRT phosphor field
      ctx.fillStyle = "#060301";
      ctx.fillRect(0, 0, w, h);

      // faint polar grid
      ctx.strokeStyle = "rgba(255,140,30,0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 14) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const mid = h * 0.42;
      const waveH = h * 0.28;
      const waterY = h * 0.78;
      const waterH = h * 0.18;

      // --- carrier + noise (always) ---
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const n1 = Math.sin(x * 0.09 + now * 3.1);
        const n2 = Math.sin(x * 0.23 - now * 1.7) * 0.45;
        const n3 = Math.sin(x * 0.47 + now * 5.2) * 0.18;
        // inject sample energy near the right edge of history
        let burst = 0;
        if (samples.length > 0) {
          const idx = Math.floor((x / w) * samples.length);
          const s = samples[Math.min(idx, samples.length - 1)];
          burst = Math.min(3, s.raw) * 0.55 + s.accepted * 0.8 + s.rejected * 0.25;
        }
        const y = mid + (n1 + n2 + n3) * (6 + burst * 4) - burst * 10;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,176,0,0.55)";
      ctx.lineWidth = 1.4;
      ctx.shadowColor = "rgba(255,160,40,0.55)";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // secondary ghost beam (phase shifted)
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const n1 = Math.sin(x * 0.09 + now * 3.1 + 0.9);
        const n2 = Math.sin(x * 0.19 - now * 2.0) * 0.4;
        let burst = 0;
        if (samples.length > 0) {
          const idx = Math.floor((x / w) * samples.length);
          const s = samples[Math.min(idx, samples.length - 1)];
          burst = Math.min(2, s.raw) * 0.4;
        }
        const y = mid + waveH * 0.55 + (n1 + n2) * 4 - burst * 6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,100,30,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // trigger level
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,180,60,0.25)";
      ctx.beginPath();
      ctx.moveTo(0, mid - 18);
      ctx.lineTo(w, mid - 18);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,180,60,0.45)";
      ctx.font = "9px monospace";
      ctx.fillText("TRIG", 4, mid - 22);

      // --- waterfall strip (history intensity) ---
      const n = Math.max(samples.length, 1);
      for (let i = 0; i < Math.min(n, 80); i++) {
        const s = samples[samples.length - 1 - i] ?? {
          raw: 0,
          accepted: 0,
          rejected: 0,
        };
        const intensity = Math.min(
          1,
          0.12 + s.raw * 0.35 + s.accepted * 0.5 + s.rejected * 0.15
        );
        const x = w - 4 - i * ((w - 8) / 80);
        const barH = waterH * intensity;
        ctx.fillStyle = `rgba(255, ${140 + s.accepted * 40}, 20, ${0.25 + intensity * 0.6})`;
        ctx.fillRect(x, waterY + waterH - barH, Math.max(2, (w - 8) / 80 - 1), barH);
      }
      ctx.fillStyle = "rgba(255,160,40,0.4)";
      ctx.fillText("WATERFALL · poll energy", 4, waterY - 4);

      // status readout
      const last = samples[samples.length - 1];
      const mode =
        !last || (last.raw === 0 && last.accepted === 0)
          ? "CARRIER / NOISE FLOOR"
          : last.raw > 0
            ? `SIGNAL · raw=${last.raw}`
            : "PATTERN";
      ctx.fillStyle =
        last && last.raw > 0
          ? "rgba(255,220,120,0.95)"
          : "rgba(255,160,40,0.55)";
      ctx.font = "10px monospace";
      ctx.fillText(mode, w - ctx.measureText(mode).width - 8, 14);

      // beam tip
      ctx.fillStyle = "rgba(255,230,160,0.95)";
      ctx.shadowColor = "rgba(255,180,40,0.9)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(w - 6, mid, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [samples]);

  const last = samples[samples.length - 1];
  const signal = last && last.raw > 0;

  return (
    <div className={`scope-panel panel-rise${signal ? " scope-hot" : ""}`}>
      <div className="scope-head">
        <h2>Scope · signal in noise</h2>
        <span className="scope-mode">
          {signal ? `BURST raw=${last!.raw}` : "listening · UniswapX Dutch_V3"}
        </span>
      </div>
      <canvas ref={ref} className="scope-canvas" />
      <div className="scope-legend">
        <span>carrier = poll clock</span>
        <span>burst = open orders</span>
        <span>waterfall = recent energy</span>
      </div>
    </div>
  );
}
