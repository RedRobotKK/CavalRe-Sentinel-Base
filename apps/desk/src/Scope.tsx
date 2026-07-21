import { useEffect, useRef } from "react";

/**
 * Amber CRT oscilloscope — traces journal activity as a live waveform.
 */
export function Scope({
  samples,
}: {
  samples: { raw: number; accepted: number; rejected: number }[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // bezel / phosphor bg
    ctx.fillStyle = "#080401";
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = "rgba(255,140,30,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // center line
    ctx.strokeStyle = "rgba(255,160,40,0.2)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (samples.length < 2) {
      // idle sine
      ctx.strokeStyle = "rgba(255,176,0,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const t = Date.now() / 1000;
      for (let i = 0; i < w; i++) {
        const y =
          h / 2 +
          Math.sin(i * 0.04 + t * 2) * 8 +
          Math.sin(i * 0.11 + t) * 3;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
      return;
    }

    const maxRaw = Math.max(1, ...samples.map((s) => s.raw));
    const n = samples.length;

    const draw = (
      key: "raw" | "accepted" | "rejected",
      color: string,
      scale: number
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      samples.forEach((s, i) => {
        const x = (i / (n - 1)) * (w - 4) + 2;
        const v = s[key] / scale;
        const y = h - 6 - v * (h - 14);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw("raw", "rgba(255,176,0,0.9)", maxRaw);
    draw("rejected", "rgba(255,80,40,0.75)", Math.max(1, maxRaw));
    draw("accepted", "rgba(255,220,140,0.95)", Math.max(1, maxRaw));

    // beam glow at latest point
    const last = samples[samples.length - 1];
    const lx = w - 4;
    const ly = h - 6 - (last.raw / maxRaw) * (h - 14);
    ctx.fillStyle = "rgba(255,200,80,0.9)";
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, [samples]);

  // idle redraw for sine
  useEffect(() => {
    if (samples.length >= 2) return;
    const id = setInterval(() => {
      const canvas = ref.current;
      if (!canvas) return;
      // trigger by resizing attribute noop — force via custom event
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ev = new Event("scope-tick");
      canvas.dispatchEvent(ev);
    }, 50);
    return () => clearInterval(id);
  }, [samples.length]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || samples.length >= 2) return;
    const redraw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#080401";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,140,30,0.12)";
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,176,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(255,160,40,0.5)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const t = Date.now() / 1000;
      for (let i = 0; i < w; i++) {
        const y =
          h / 2 +
          Math.sin(i * 0.045 + t * 2.2) * 10 +
          Math.sin(i * 0.12 + t * 1.1) * 4;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    const id = setInterval(redraw, 40);
    redraw();
    return () => clearInterval(id);
  }, [samples.length]);

  return (
    <div className="scope-panel panel-rise">
      <h2>Oscilloscope · market / decision bus</h2>
      <canvas ref={ref} className="scope-canvas" />
      <div className="scope-legend">
        <span>
          <i style={{ background: "#ffb000" }} /> raw
        </span>
        <span>
          <i style={{ background: "#ff5030" }} /> reject
        </span>
        <span>
          <i style={{ background: "#ffdc8c" }} /> accept
        </span>
      </div>
    </div>
  );
}
