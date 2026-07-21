import { useEffect, useRef } from "react";

/**
 * Default full-viewport WebGL fragment shader.
 * No Three.js — one triangle, cheap uniforms, quant-desk calm.
 */
const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_activity;

// value noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0);

  // base
  vec3 col = vec3(0.027, 0.035, 0.051);

  // soft radial vignette lights
  float g1 = exp(-length(uv - vec2(0.12, 0.05)) * 3.2) * 0.12;
  float g2 = exp(-length(uv - vec2(0.92, 0.08)) * 3.5) * 0.07;
  col += vec3(0.12, 0.28, 0.55) * g1;
  col += vec3(0.05, 0.35, 0.32) * g2;

  // drifting noise field
  float n = noise(p * 3.5 + vec2(u_time * 0.03, u_time * 0.02));
  n += 0.5 * noise(p * 8.0 - vec2(u_time * 0.05, 0.0));
  col += vec3(0.04, 0.07, 0.12) * n * (0.35 + 0.25 * u_activity);

  // fine grid
  vec2 grid = abs(fract(gl_FragCoord.xy / 28.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.04, min(grid.x, grid.y));
  col += vec3(0.08, 0.12, 0.18) * line * 0.22;

  // horizontal data scan
  float scan = sin(uv.y * 40.0 - u_time * 1.2) * 0.5 + 0.5;
  col += vec3(0.05, 0.12, 0.22) * scan * 0.04 * (0.5 + u_activity);

  // activity shimmer band
  float band = smoothstep(0.0, 0.02, abs(uv.y - (0.35 + 0.02 * sin(u_time * 0.4)))) ;
  col += vec3(0.0, 0.35, 0.3) * (1.0 - band) * 0.03 * u_activity;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(err || "shader compile failed");
  }
  return sh;
}

export function ShaderBackdrop({ activity = 0 }: { activity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uAct = gl.getUniformLocation(prog, "u_activity");

    let raf = 0;
    let alive = true;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uAct, Math.min(1, Math.max(0, activityRef.current)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className="shader-backdrop" aria-hidden />;
}
