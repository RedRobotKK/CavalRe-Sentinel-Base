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

function makeLabelTexture(s: StageVisual, active: boolean): THREE.CanvasTexture {
  const w = 512;
  const h = 400;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, active ? "#3a2010" : "#1c120a");
  grd.addColorStop(1, active ? "#180c04" : "#0c0804");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = active ? "#ffc266" : "#8a5a1e";
  ctx.lineWidth = active ? 12 : 7;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.fillStyle = active ? "#ffe0a0" : "#ffb84d";
  ctx.font = "bold 64px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = active ? "rgba(255,176,0,0.45)" : "transparent";
  ctx.shadowBlur = active ? 16 : 0;
  ctx.fillText(s.label, w / 2, 95);

  ctx.shadowBlur = active ? 18 : 0;
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

/** Soft hex-digit column texture for rain */
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
    scene.fog = new THREE.FogExp2(0x060301, 0.02);

    const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 100);
    camera.position.set(0, 4.4, 13.5);
    camera.lookAt(0, 0.35, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.6));
    const key = new THREE.PointLight(0xffc266, 2.4, 55);
    key.position.set(0, 7, 8);
    scene.add(key);

    // floor grid — softer
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

    // ——— CREATIVE BACKDROP (full hero space, translucent) ———
    const bg = new THREE.Group();
    scene.add(bg);

    // 1) Large orbital rings (consensus orbits)
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

    // 2) Hex-digit rain planes (subtle columns)
    const rainTex = makeHexRainTexture();
    const rains: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: rainTex,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 6.5), mat);
      plane.position.set(
        (i - 5.5) * 2.1,
        1.2,
        -5.5 - (i % 3) * 1.2
      );
      plane.rotation.y = Math.sin(i) * 0.15;
      bg.add(plane);
      rains.push(plane);
    }

    // 3) Far particle nebula (depth)
    const NEB = 280;
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
      size: 0.06,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    bg.add(new THREE.Points(nebGeo, nebMat));

    // 4) Propagation waves on the floor
    const waves: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.RingGeometry(0.3, 0.38, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb000,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -1.52;
      bg.add(mesh);
      waves.push(mesh);
    }
    let waveClock = 0;

    // 5) Slow drifting “shard” planes (glass blocks in depth)
    const shards: THREE.Mesh[] = [];
    const shardGeo = new THREE.BoxGeometry(0.7, 0.45, 0.08);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff9a1a,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(shardGeo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.2) * 5,
        -3 - Math.random() * 8
      );
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      bg.add(mesh);
      shards.push(mesh);
    }

    // ——— foreground stage pipeline ———
    const spacing = 2.5;
    const x0 = -((N - 1) * spacing) / 2;

    const busPts = [
      new THREE.Vector3(x0 - 1.1, 0, 0),
      ...Array.from(
        { length: N },
        (_, i) => new THREE.Vector3(x0 + i * spacing, 0, 0)
      ),
      new THREE.Vector3(x0 + (N - 1) * spacing + 1.1, 0, 0),
    ];
    const busCurve = new THREE.CatmullRomCurve3(busPts);
    const busGeo = new THREE.TubeGeometry(busCurve, 80, 0.04, 8, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(busGeo, busMat));

    const nodes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const boxGeo = new THREE.BoxGeometry(1.75, 1.45, 0.62);

    for (let i = 0; i < N; i++) {
      const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
      const tex = makeLabelTexture(sv, false);
      textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.22,
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

    const PKT = 90;
    const pktPos = new Float32Array(PKT * 3);
    const pktU = new Float32Array(PKT);
    const pktSp = new Float32Array(PKT);
    for (let i = 0; i < PKT; i++) {
      pktU[i] = Math.random();
      pktSp[i] = 0.07 + Math.random() * 0.1;
    }
    const pktGeo = new THREE.BufferGeometry();
    pktGeo.setAttribute("position", new THREE.BufferAttribute(pktPos, 3));
    const pktMat = new THREE.PointsMaterial({
      color: 0xffe0a0,
      size: 0.12,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(pktGeo, pktMat));

    let raf = 0;
    let alive = true;
    let lastPulse = pulseRef.current;
    let lastStageSig = "";
    let burst = 0;
    const t0 = performance.now();

    const refreshTextures = (active: number) => {
      for (let i = 0; i < N; i++) {
        const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
        const tex = makeLabelTexture(sv, i === active);
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
        waveClock = 0;
      }
      burst *= 0.94;
      waveClock += 0.016;

      const sig =
        active +
        "|" +
        stagesRef.current.map((s) => `${s.pass}:${s.drop}`).join(",");
      if (sig !== lastStageSig) {
        lastStageSig = sig;
        refreshTextures(active);
      }

      camera.position.x = Math.sin(t * 0.05) * 0.15;
      camera.position.y = 4.35 + Math.sin(t * 0.04) * 0.05;
      camera.position.z = 13.4;
      camera.lookAt(0, 0.4, 0);

      // orbits spin slowly, different rates
      orbits.forEach((o, i) => {
        o.rotation.z = t * (0.04 + i * 0.015) * (i % 2 === 0 ? 1 : -1);
        const mat = o.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.06 + i * 0.012 + burst * 0.05;
      });

      // hex rain scrolls
      rainTex.offset.y = (t * 0.12) % 1;
      rains.forEach((p, i) => {
        p.position.y = 1.2 + Math.sin(t * 0.3 + i) * 0.2;
        const mat = p.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.08 + (i % 3) * 0.02 + burst * 0.04;
      });

      // nebula drift
      const np = nebGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < NEB; i++) {
        let y = np.getY(i) + 0.004 * ((i % 4) + 1);
        if (y > 5) y = -3;
        np.setY(i, y);
      }
      np.needsUpdate = true;
      nebMat.opacity = 0.28 + burst * 0.12;

      // floor propagation waves
      waves.forEach((w, i) => {
        const wt = waveClock - i * 0.35;
        const mat = w.material as THREE.MeshBasicMaterial;
        if (wt < 0 || wt > 2.4) {
          mat.opacity = 0;
        } else {
          const s = 0.4 + wt * 5.5;
          w.scale.set(s, s, s);
          mat.opacity = (1 - wt / 2.4) * 0.22;
        }
      });
      // ambient slow waves even without pulse
      if (waveClock > 4) waveClock = 0;

      // shards tumble slowly in the distance
      shards.forEach((s, i) => {
        s.rotation.x += 0.002 + (i % 3) * 0.0005;
        s.rotation.y += 0.003;
        s.position.x += Math.sin(t * 0.2 + i) * 0.002;
        const mat = s.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.04 + 0.03 * Math.sin(t + i);
      });

      // stages
      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = materials[i]!;
        const isOn = i <= active;
        const isCur = i === active;

        mat.emissiveIntensity = isCur
          ? 0.6 + burst * 0.4
          : isOn
            ? 0.32
            : 0.16;

        const bob = Math.sin(t * 1.1 + i * 0.55) * 0.05;
        const lift = isCur ? 0.28 : isOn ? 0.1 : 0.02;
        mesh.position.y = 0.4 + lift + bob;
        mesh.rotation.x = -0.14;
        mesh.rotation.y = 0;
        mesh.scale.setScalar(isCur ? 1.04 + burst * 0.03 : 1);
      }

      const maxU = Math.max(0.1, (active + 0.55) / N);
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PKT; i++) {
        let u = (pktU[i]! + t * pktSp[i]!) % 1;
        u = u * maxU;
        const pt = busCurve.getPointAt(Math.min(0.999, u));
        pos.setXYZ(i, pt.x, pt.y + 0.06, pt.z);
      }
      pos.needsUpdate = true;
      pktMat.opacity = 0.5 + inten * 0.25 + burst * 0.25;

      busMat.opacity = 0.32 + (active / N) * 0.25 + burst * 0.12;
      key.intensity = 2.2 + burst * 1.2 + inten * 0.4;

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
      pktGeo.dispose();
      nebGeo.dispose();
      shardGeo.dispose();
      rainTex.dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="pipeline-scene" aria-hidden />;
}
