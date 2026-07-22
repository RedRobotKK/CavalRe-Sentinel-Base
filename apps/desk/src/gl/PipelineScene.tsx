import { useEffect, useRef } from "react";
import * as THREE from "three";

export type StageVisual = {
  label: string;
  pass: number;
  drop: number;
};

const DEFAULT_STAGES: StageVisual[] = [
  "POLL",
  "PARSE",
  "CLASS",
  "DECAY",
  "EDGE",
  "RISK",
  "POLICY",
  "BOOK",
].map((label) => ({ label, pass: 0, drop: 0 }));

/** Stage accent — warmer as we go deeper into policy */
const STAGE_HEX = [
  0xffb84d, // POLL
  0xffa833, // PARSE
  0xff9a1a, // CLASS
  0xff8c1a, // DECAY
  0xff7a22, // EDGE
  0xff6a18, // RISK
  0xff5533, // POLICY
  0xffcc66, // BOOK
];

function makeLabelTexture(s: StageVisual, active: boolean, hit: number): THREE.CanvasTexture {
  const w = 512;
  const h = 400;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // hit flash lifts the face toward white/gold
  const lift = Math.min(1, hit);
  const top = active || lift > 0.05 ? blendHex("#3a2010", "#6a4020", lift) : "#1c120a";
  const bot = active || lift > 0.05 ? blendHex("#180c04", "#402010", lift) : "#0c0804";
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bot);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  const border = lift > 0.2 ? "#ffe0a0" : active ? "#ffc266" : "#8a5a1e";
  ctx.strokeStyle = border;
  ctx.lineWidth = active || lift > 0.15 ? 14 : 7;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.fillStyle = lift > 0.3 ? "#fff4d0" : active ? "#ffe0a0" : "#ffb84d";
  ctx.font = "bold 64px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,176,0,0.5)";
  ctx.shadowBlur = active || lift > 0.1 ? 18 : 0;
  ctx.fillText(s.label, w / 2, 95);

  ctx.fillStyle = "#ffb000";
  ctx.font = "bold 120px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(String(s.pass), w / 2, 225);

  ctx.shadowBlur = 0;
  ctx.fillStyle = s.drop > 0 ? "#ff6644" : "#7a4a18";
  ctx.font = "bold 38px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(s.drop > 0 ? `DROP −${s.drop}` : "PASS", w / 2, 325);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function blendHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255,
    ag = (pa >> 8) & 255,
    ab = pa & 255;
  const br = (pb >> 16) & 255,
    bg = (pb >> 8) & 255,
    bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function makeHexRainTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const chars = "0123456789abcdef";
  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  for (let y = 0; y < 18; y++) {
    ctx.fillStyle = `rgba(255, ${140 + (y % 5) * 15}, 30, ${0.15 + (y % 3) * 0.08})`;
    ctx.fillText(chars[(y * 7) % 16]!, w / 2, 14 + y * 14);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function PipelineScene({
  pulseKey = 0,
  activeStage = 2,
  intensity = 0.6,
  stages = DEFAULT_STAGES,
}: {
  pulseKey?: number;
  activeStage?: number;
  intensity?: number;
  stages?: StageVisual[];
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef(pulseKey);
  const stageRef = useRef(activeStage);
  const intensityRef = useRef(intensity);
  const stagesRef = useRef(stages);
  pulseRef.current = pulseKey;
  stageRef.current = activeStage;
  intensityRef.current = intensity;
  stagesRef.current = stages;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const N = stagesRef.current.length || 8;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "pipeline-scene-canvas";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060301, 0.018);

    const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 100);
    camera.position.set(0, 4.4, 13.5);
    camera.lookAt(0, 0.35, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.55));
    const key = new THREE.PointLight(0xffc266, 2.4, 55);
    key.position.set(0, 7, 8);
    scene.add(key);

    // per-stage hit lights (color flash when pixels arrive)
    const hitLights: THREE.PointLight[] = [];
    const spacing = 2.5;
    const x0 = -((N - 1) * spacing) / 2;
    for (let i = 0; i < N; i++) {
      const pl = new THREE.PointLight(STAGE_HEX[i] ?? 0xffb000, 0, 4.5);
      pl.position.set(x0 + i * spacing, 1.2, 0.6);
      scene.add(pl);
      hitLights.push(pl);
    }

    const grid = new THREE.GridHelper(48, 48, 0x6a3a10, 0x1e1208);
    grid.position.y = -1.55;
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.28;
      });
    } else {
      gm.transparent = true;
      gm.opacity = 0.28;
    }
    scene.add(grid);

    const bg = new THREE.Group();
    scene.add(bg);

    const orbits: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const radius = 4.5 + i * 2.2;
      const geo = new THREE.TorusGeometry(radius, 0.012, 8, 96);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff9f1a,
        transparent: true,
        opacity: 0.07 + i * 0.015,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2.4 + i * 0.08;
      mesh.rotation.z = i * 0.4;
      mesh.position.y = -0.4 + i * 0.15;
      bg.add(mesh);
      orbits.push(mesh);
    }

    const rainTex = makeHexRainTexture();
    const rains: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: rainTex,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 6.5), mat);
      plane.position.set((i - 5.5) * 2.1, 1.2, -5.5 - (i % 3) * 1.2);
      bg.add(plane);
      rains.push(plane);
    }

    const NEB = 220;
    const nebPos = new Float32Array(NEB * 3);
    for (let i = 0; i < NEB; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 16;
      nebPos[i * 3] = Math.cos(a) * r;
      nebPos[i * 3 + 1] = (Math.random() - 0.35) * 8;
      nebPos[i * 3 + 2] = Math.sin(a) * r * 0.55 - 4;
    }
    const nebGeo = new THREE.BufferGeometry();
    nebGeo.setAttribute("position", new THREE.BufferAttribute(nebPos, 3));
    const nebMat = new THREE.PointsMaterial({
      color: 0xc47a22,
      size: 0.055,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    bg.add(new THREE.Points(nebGeo, nebMat));

    // ——— blocks ———
    const nodes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const hitAmt = new Float32Array(N); // decay after pixel impact
    const boxGeo = new THREE.BoxGeometry(1.75, 1.45, 0.62);

    for (let i = 0; i < N; i++) {
      const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
      const tex = makeLabelTexture(sv, false, 0);
      textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(STAGE_HEX[i] ?? 0xff8c1a),
        emissiveIntensity: 0.2,
        emissiveMap: tex,
        metalness: 0.35,
        roughness: 0.42,
      });
      materials.push(mat);
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + i * spacing, 0.4, 0);
      scene.add(mesh);
      nodes.push(mesh);
    }

    // ——— pixel streams between blocks (forward + reverse) ———
    type Stream = {
      /** 0 = forward (left→right), 1 = reverse */
      dir: 0 | 1;
      from: number;
      curve: THREE.CatmullRomCurve3;
      pts: THREE.Points;
      pos: Float32Array;
      u: Float32Array;
      speed: Float32Array;
      color: THREE.Color;
      count: number;
    };

    const streams: Stream[] = [];
    const PIXELS_PER_LINK = 28;

    for (let i = 0; i < N - 1; i++) {
      const xA = x0 + i * spacing + 0.92;
      const xB = x0 + (i + 1) * spacing - 0.92;
      const mid = (xA + xB) / 2;

      // forward band (upper)
      const fwd = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xA, 0.5, 0.12),
        new THREE.Vector3(mid, 0.95 + (i % 3) * 0.05, 0.28),
        new THREE.Vector3(xB, 0.5, 0.12),
      ]);
      // reverse band (lower)
      const rev = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xB, 0.22, -0.1),
        new THREE.Vector3(mid, 0.48, -0.22),
        new THREE.Vector3(xA, 0.22, -0.1),
      ]);

      for (const [dir, curve] of [
        [0, fwd] as const,
        [1, rev] as const,
      ]) {
        const count = PIXELS_PER_LINK;
        const pos = new Float32Array(count * 3);
        const u = new Float32Array(count);
        const speed = new Float32Array(count);
        for (let p = 0; p < count; p++) {
          u[p] = p / count;
          speed[p] = 0.18 + Math.random() * 0.35 + (dir === 0 ? 0.08 : 0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const col = new THREE.Color(dir === 0 ? STAGE_HEX[i]! : 0x66ffaa);
        if (dir === 1) {
          // reverse: cooler green-gold; nack-ish if drop heavy
          const next = stagesRef.current[i + 1];
          if (next && next.drop > next.pass * 0.4 && next.drop > 0) {
            col.setHex(0xff6644);
          }
        }
        const mat = new THREE.PointsMaterial({
          color: col,
          size: dir === 0 ? 0.09 : 0.07,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        });
        const pts = new THREE.Points(geo, mat);
        scene.add(pts);
        streams.push({ dir, from: i, curve, pts, pos, u, speed, color: col, count });
      }

      // thin guide tube (barely visible)
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0xff9f1a,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(fwd, 20, 0.018, 5, false), tubeMat));
    }

    // base bus
    const busPts = [
      new THREE.Vector3(x0 - 1.1, 0.05, 0),
      ...Array.from({ length: N }, (_, i) => new THREE.Vector3(x0 + i * spacing, 0.05, 0)),
      new THREE.Vector3(x0 + (N - 1) * spacing + 1.1, 0.05, 0),
    ];
    const busGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(busPts), 80, 0.028, 6, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(busGeo, busMat));

    let raf = 0;
    let alive = true;
    let lastPulse = pulseRef.current;
    let lastStageSig = "";
    let burst = 0;
    const t0 = performance.now();

    const refreshTextures = (active: number) => {
      for (let i = 0; i < N; i++) {
        const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
        const tex = makeLabelTexture(sv, i === active, hitAmt[i]!);
        textures[i]?.dispose();
        textures[i] = tex;
        const mat = materials[i]!;
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.needsUpdate = true;
      }
    };

    const resize = () => {
      const w = mount.clientWidth || 1000;
      const h = mount.clientHeight || 340;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    refreshTextures(Math.floor(stageRef.current));

    const tmp = new THREE.Vector3();

    const frame = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      const active = Math.max(0, Math.min(N - 1, Math.floor(stageRef.current)));
      const inten = intensityRef.current;

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        burst = 1;
        // inject faster pixels on pulse
        for (const s of streams) {
          if (s.from < active) {
            for (let p = 0; p < 4; p++) {
              s.u[p] = Math.random() * 0.15;
              s.speed[p] = 0.55 + Math.random() * 0.4;
            }
          }
        }
      }
      burst *= 0.93;

      const sig =
        active +
        "|" +
        stagesRef.current.map((s) => `${s.pass}:${s.drop}`).join(",") +
        "|" +
        Array.from(hitAmt, (h) => h.toFixed(2)).join(",");
      if (sig !== lastStageSig) {
        lastStageSig = sig;
        refreshTextures(active);
      }

      camera.position.x = Math.sin(t * 0.05) * 0.12;
      camera.position.y = 4.35 + Math.sin(t * 0.04) * 0.04;
      camera.lookAt(0, 0.4, 0);

      orbits.forEach((o, i) => {
        o.rotation.z = t * (0.04 + i * 0.015) * (i % 2 === 0 ? 1 : -1);
      });
      rainTex.offset.y = (t * 0.12) % 1;

      // decay hit amounts
      for (let i = 0; i < N; i++) {
        hitAmt[i] = Math.max(0, hitAmt[i]! * 0.94);
      }

      // move pixels; detect arrivals
      for (const s of streams) {
        const lit = s.from < active || s.from === active - 1;
        const mat = s.pts.material as THREE.PointsMaterial;
        mat.opacity = lit ? 0.9 : 0.22;
        mat.size = lit ? (s.dir === 0 ? 0.1 : 0.08) : 0.05;

        // update reverse color from drop pressure
        if (s.dir === 1) {
          const next = stagesRef.current[s.from + 1];
          const nack =
            next && next.drop > 0 && next.drop >= Math.max(1, next.pass) * 0.35;
          mat.color.setHex(nack ? 0xff5533 : 0x88ffbb);
        }

        const attr = s.pts.geometry.attributes.position as THREE.BufferAttribute;
        for (let p = 0; p < s.count; p++) {
          let u = s.u[p]! + s.speed[p]! * 0.016 * (lit ? 1.4 : 0.45);
          if (u >= 1) {
            // impact
            const target = s.dir === 0 ? s.from + 1 : s.from;
            hitAmt[target] = Math.min(1.4, hitAmt[target]! + 0.55);
            u = u - 1;
          }
          s.u[p] = u;
          s.curve.getPointAt(Math.min(0.999, u), tmp);
          // slight vertical jitter = "pixels" not beads
          const jy = Math.sin(t * 12 + p * 1.7 + s.from) * 0.025;
          attr.setXYZ(p, tmp.x, tmp.y + jy, tmp.z);
        }
        attr.needsUpdate = true;
      }

      // blocks react to hits + activity
      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = materials[i]!;
        const isOn = i <= active;
        const isCur = i === active;
        const hit = hitAmt[i]!;

        mat.emissiveIntensity =
          0.15 + (isCur ? 0.35 : isOn ? 0.12 : 0) + hit * 0.85 + burst * 0.15;
        mat.emissive.setHex(STAGE_HEX[i] ?? 0xff8c1a);
        if (hit > 0.4) {
          // blend toward white on hard hit
          mat.emissive.lerp(new THREE.Color(0xfff0c0), Math.min(0.6, hit * 0.4));
        }

        const bob = Math.sin(t * 1.1 + i * 0.55) * 0.04;
        const lift = isCur ? 0.22 : isOn ? 0.08 : 0.02;
        const punch = hit * 0.12;
        mesh.position.y = 0.4 + lift + bob + punch;
        mesh.rotation.x = -0.14;
        mesh.scale.setScalar(1 + hit * 0.06 + (isCur ? 0.03 : 0));

        const hl = hitLights[i]!;
        hl.intensity = hit * 3.2 + (isCur ? 0.4 : 0);
        hl.color.setHex(STAGE_HEX[i] ?? 0xffb000);
      }

      busMat.opacity = 0.2 + (active / N) * 0.2 + burst * 0.1;
      key.intensity = 2.1 + burst * 1.1 + inten * 0.35;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      boxGeo.dispose();
      busGeo.dispose();
      nebGeo.dispose();
      rainTex.dispose();
      textures.forEach((tx) => tx.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="pipeline-scene" aria-hidden />;
}
