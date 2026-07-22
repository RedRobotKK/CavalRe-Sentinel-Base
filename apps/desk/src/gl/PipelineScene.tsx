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

const STAGE_HEX = [
  0xffb84d, 0xffa833, 0xff9a1a, 0xff8c1a, 0xff7a22, 0xff6a18, 0xff5533, 0xffcc66,
];

function makeLabelTexture(s: StageVisual, active: boolean, lit: boolean): THREE.CanvasTexture {
  const w = 512;
  const h = 400;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const on = active || lit;
  const top = on ? "#4a2810" : "#1c120a";
  const bot = on ? "#201008" : "#0c0804";
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bot);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = active ? "#ffd080" : lit ? "#c47a22" : "#8a5a1e";
  ctx.lineWidth = active ? 11 : 7;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.fillStyle = active ? "#fff0c8" : "#ffb84d";
  ctx.font = "bold 64px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = active ? "rgba(255,176,0,0.35)" : "transparent";
  ctx.shadowBlur = active ? 10 : 0;
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
    ctx.fillStyle = `rgba(255, ${140 + (y % 5) * 15}, 30, ${0.12 + (y % 3) * 0.06})`;
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
    const key = new THREE.PointLight(0xffc266, 2.2, 55);
    key.position.set(0, 7, 8);
    scene.add(key);

    const spacing = 2.5;
    const x0 = -((N - 1) * spacing) / 2;

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
        opacity: 0.06 + i * 0.012,
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
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: rainTex,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 6.5), mat);
      plane.position.set((i - 5.5) * 2.1, 1.2, -5.5 - (i % 3) * 1.2);
      bg.add(plane);
    }

    const NEB = 180;
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
    bg.add(
      new THREE.Points(
        nebGeo,
        new THREE.PointsMaterial({
          color: 0xc47a22,
          size: 0.05,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        })
      )
    );

    const materials: THREE.MeshStandardMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const emissiveSmooth = new Float32Array(N);
    const boxGeo = new THREE.BoxGeometry(1.75, 1.45, 0.62);

    for (let i = 0; i < N; i++) {
      const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
      const tex = makeLabelTexture(sv, false, false);
      textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(STAGE_HEX[i] ?? 0xff8c1a),
        emissiveIntensity: 0.18,
        emissiveMap: tex,
        metalness: 0.32,
        roughness: 0.48,
      });
      emissiveSmooth[i] = 0.18;
      materials.push(mat);
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + i * spacing, 0.42, 0);
      mesh.rotation.x = -0.12;
      scene.add(mesh);
    }

    type Stream = {
      dir: 0 | 1;
      from: number;
      curve: THREE.CatmullRomCurve3;
      pts: THREE.Points;
      u: Float32Array;
      speed: Float32Array;
      count: number;
    };

    const streams: Stream[] = [];
    const PIXELS_PER_LINK = 20;

    for (let i = 0; i < N - 1; i++) {
      const xA = x0 + i * spacing + 0.92;
      const xB = x0 + (i + 1) * spacing - 0.92;
      const mid = (xA + xB) / 2;

      const fwd = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xA, 0.5, 0.12),
        new THREE.Vector3(mid, 0.9, 0.22),
        new THREE.Vector3(xB, 0.5, 0.12),
      ]);
      const rev = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xB, 0.22, -0.1),
        new THREE.Vector3(mid, 0.45, -0.18),
        new THREE.Vector3(xA, 0.22, -0.1),
      ]);

      for (const [dir, curve] of [
        [0, fwd] as const,
        [1, rev] as const,
      ]) {
        const count = PIXELS_PER_LINK;
        const u = new Float32Array(count);
        const speed = new Float32Array(count);
        for (let p = 0; p < count; p++) {
          u[p] = p / count;
          speed[p] = 0.14 + Math.random() * 0.22;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        const col = new THREE.Color(dir === 0 ? STAGE_HEX[i]! : 0x66ffaa);
        const mat = new THREE.PointsMaterial({
          color: col,
          size: dir === 0 ? 0.07 : 0.055,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        });
        const pts = new THREE.Points(geo, mat);
        scene.add(pts);
        streams.push({ dir, from: i, curve, pts, u, speed, count });
      }

      scene.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(fwd, 20, 0.014, 5, false),
          new THREE.MeshBasicMaterial({
            color: 0xff9f1a,
            transparent: true,
            opacity: 0.07,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
    }

    const busPts = [
      new THREE.Vector3(x0 - 1.1, 0.05, 0),
      ...Array.from({ length: N }, (_, i) => new THREE.Vector3(x0 + i * spacing, 0.05, 0)),
      new THREE.Vector3(x0 + (N - 1) * spacing + 1.1, 0.05, 0),
    ];
    const busGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(busPts), 80, 0.028, 6, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.22,
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
    const tmp = new THREE.Vector3();

    const refreshTextures = (active: number) => {
      for (let i = 0; i < N; i++) {
        const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
        const lit = i <= active;
        const tex = makeLabelTexture(sv, i === active, lit);
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

    const frame = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      const active = Math.max(0, Math.min(N - 1, Math.floor(stageRef.current)));
      const inten = intensityRef.current;

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        burst = 1;
      }
      // slow, calm decay — not a strobe
      burst = Math.max(0, burst - 0.02);

      // texture only when stage index or counts change (not every frame)
      const sig =
        active + "|" + stagesRef.current.map((s) => `${s.pass}:${s.drop}`).join(",");
      if (sig !== lastStageSig) {
        lastStageSig = sig;
        refreshTextures(active);
      }

      camera.position.x = Math.sin(t * 0.04) * 0.08;
      camera.lookAt(0, 0.4, 0);

      orbits.forEach((o, i) => {
        o.rotation.z = t * (0.03 + i * 0.01) * (i % 2 === 0 ? 1 : -1);
      });
      rainTex.offset.y = (t * 0.08) % 1;

      for (const s of streams) {
        const lit = s.from < active || s.from === active - 1;
        const mat = s.pts.material as THREE.PointsMaterial;
        mat.opacity = lit ? 0.75 : 0.15;

        if (s.dir === 1) {
          const next = stagesRef.current[s.from + 1];
          const nack =
            next && next.drop > 0 && next.drop >= Math.max(1, next.pass) * 0.35;
          mat.color.setHex(nack ? 0xff5533 : 0x88ffbb);
        }

        const attr = s.pts.geometry.attributes.position as THREE.BufferAttribute;
        for (let p = 0; p < s.count; p++) {
          let u = s.u[p]! + s.speed[p]! * 0.014 * (lit ? 1.15 : 0.35);
          if (u >= 1) u = u - 1;
          s.u[p] = u;
          s.curve.getPointAt(Math.min(0.999, u), tmp);
          attr.setXYZ(p, tmp.x, tmp.y, tmp.z);
        }
        attr.needsUpdate = true;
      }

      // Smooth emissive toward stable targets — no per-particle flash
      for (let i = 0; i < N; i++) {
        const mat = materials[i]!;
        const isOn = i <= active;
        const isCur = i === active;
        const target =
          0.16 + (isCur ? 0.22 : isOn ? 0.08 : 0) + burst * (isCur ? 0.12 : 0.03);
        // critically damped-ish lerp
        emissiveSmooth[i] =
          emissiveSmooth[i]! + (target - emissiveSmooth[i]!) * 0.08;
        mat.emissiveIntensity = emissiveSmooth[i]!;
        mat.emissive.setHex(STAGE_HEX[i] ?? 0xff8c1a);
      }

      busMat.opacity = 0.18 + (active / N) * 0.12;
      key.intensity = 2.0 + burst * 0.25 + inten * 0.2;

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
