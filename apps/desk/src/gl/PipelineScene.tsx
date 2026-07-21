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
    scene.fog = new THREE.FogExp2(0x060301, 0.022);

    const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 80);
    camera.position.set(0, 4.4, 13.5);
    camera.lookAt(0, 0.35, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.65));
    const key = new THREE.PointLight(0xffc266, 2.4, 55);
    key.position.set(0, 7, 8);
    scene.add(key);

    const grid = new THREE.GridHelper(42, 42, 0x7a4212, 0x281808);
    grid.position.y = -1.5;
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.32;
      });
    } else {
      gm.transparent = true;
      gm.opacity = 0.32;
    }
    scene.add(grid);

    // ——— translucent blockchain network (BEHIND stages, z < 0) ———
    const chainGroup = new THREE.Group();
    chainGroup.position.z = -3.5;
    scene.add(chainGroup);

    const CCOLS = 9;
    const CROWS = 4;
    const CN = CCOLS * CROWS;
    const cPos = new Float32Array(CN * 3);
    const cBlocks: THREE.Mesh[] = [];
    const cGeo = new THREE.BoxGeometry(0.42, 0.28, 0.42);

    for (let r = 0; r < CROWS; r++) {
      for (let c = 0; c < CCOLS; c++) {
        const i = r * CCOLS + c;
        const x = (c - (CCOLS - 1) / 2) * 2.8 + (r % 2) * 1.3;
        const y = (r - (CROWS - 1) / 2) * 1.7 + 0.8;
        const z = (Math.sin(c * 0.8 + r) * 0.8);
        cPos[i * 3] = x;
        cPos[i * 3 + 1] = y;
        cPos[i * 3 + 2] = z;

        const mat = new THREE.MeshBasicMaterial({
          color: 0xff9a1a,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(cGeo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.y = 0.35;
        chainGroup.add(mesh);
        cBlocks.push(mesh);
      }
    }

    const cEdges: number[] = [];
    for (let i = 0; i < CN; i++) {
      for (let j = i + 1; j < CN; j++) {
        const d = Math.hypot(
          cPos[i * 3]! - cPos[j * 3]!,
          cPos[i * 3 + 1]! - cPos[j * 3 + 1]!,
          cPos[i * 3 + 2]! - cPos[j * 3 + 2]!
        );
        if (d < 3.4) {
          cEdges.push(
            cPos[i * 3]!,
            cPos[i * 3 + 1]!,
            cPos[i * 3 + 2]!,
            cPos[j * 3]!,
            cPos[j * 3 + 1]!,
            cPos[j * 3 + 2]!
          );
        }
      }
    }
    const cEdgeGeo = new THREE.BufferGeometry();
    cEdgeGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(cEdges, 3)
    );
    const cEdgeMat = new THREE.LineBasicMaterial({
      color: 0xff8c1a,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    chainGroup.add(new THREE.LineSegments(cEdgeGeo, cEdgeMat));

    // hopping packets on the translucent chain
    const CPKT = 70;
    const cpPos = new Float32Array(CPKT * 3);
    const cpFrom = new Float32Array(CPKT * 3);
    const cpTo = new Float32Array(CPKT * 3);
    const cpPhase = new Float32Array(CPKT);
    const cpSpeed = new Float32Array(CPKT);

    function pickChainHop(i: number) {
      const a = Math.floor(Math.random() * CN);
      let b = Math.floor(Math.random() * CN);
      for (let t = 0; t < 8; t++) {
        const cand = Math.floor(Math.random() * CN);
        const d = Math.hypot(
          cPos[a * 3]! - cPos[cand * 3]!,
          cPos[a * 3 + 1]! - cPos[cand * 3 + 1]!,
          cPos[a * 3 + 2]! - cPos[cand * 3 + 2]!
        );
        if (d < 3.5 && cand !== a) {
          b = cand;
          break;
        }
      }
      cpFrom[i * 3] = cPos[a * 3]!;
      cpFrom[i * 3 + 1] = cPos[a * 3 + 1]!;
      cpFrom[i * 3 + 2] = cPos[a * 3 + 2]!;
      cpTo[i * 3] = cPos[b * 3]!;
      cpTo[i * 3 + 1] = cPos[b * 3 + 1]!;
      cpTo[i * 3 + 2] = cPos[b * 3 + 2]!;
      cpPhase[i] = 0;
      cpSpeed[i] = 0.18 + Math.random() * 0.28;
    }
    for (let i = 0; i < CPKT; i++) {
      pickChainHop(i);
      cpPhase[i] = Math.random();
    }

    const cpGeo = new THREE.BufferGeometry();
    cpGeo.setAttribute("position", new THREE.BufferAttribute(cpPos, 3));
    const cpMat = new THREE.PointsMaterial({
      color: 0xffe0a0,
      size: 0.11,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    chainGroup.add(new THREE.Points(cpGeo, cpMat));

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
      opacity: 0.4,
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
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(pktGeo, pktMat));

    const pulseRings: THREE.Mesh[] = [];
    for (let k = 0; k < 2; k++) {
      const g = new THREE.RingGeometry(0.22, 0.3, 48);
      const m = new THREE.MeshBasicMaterial({
        color: 0xffb000,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -1.45;
      scene.add(mesh);
      pulseRings.push(mesh);
    }
    let ringT = 99;

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
        ringT = 0;
      }
      burst *= 0.94;
      ringT += 0.016;

      const sig =
        active +
        "|" +
        stagesRef.current.map((s) => `${s.pass}:${s.drop}`).join(",");
      if (sig !== lastStageSig) {
        lastStageSig = sig;
        refreshTextures(active);
      }

      camera.position.x = Math.sin(t * 0.06) * 0.18;
      camera.position.y = 4.35 + Math.sin(t * 0.05) * 0.06;
      camera.position.z = 13.4;
      camera.lookAt(0, 0.4, 0);

      // translucent chain animation
      chainGroup.rotation.y = Math.sin(t * 0.08) * 0.12;
      for (let i = 0; i < cBlocks.length; i++) {
        const m = cBlocks[i]!;
        const mat = m.material as THREE.MeshBasicMaterial;
        const breath = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 0.4);
        mat.opacity = 0.07 + breath * 0.07 + burst * 0.08;
        m.position.y = cPos[i * 3 + 1]! + Math.sin(t * 0.85 + i * 0.25) * 0.06;
      }
      const cpos = cpGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < CPKT; i++) {
        cpPhase[i] = (cpPhase[i]! + 0.016 * cpSpeed[i]!) % 1;
        if (cpPhase[i]! < 0.016 * cpSpeed[i]!) pickChainHop(i);
        const s = cpPhase[i]! * cpPhase[i]! * (3 - 2 * cpPhase[i]!);
        cpos.setXYZ(
          i,
          cpFrom[i * 3]! + (cpTo[i * 3]! - cpFrom[i * 3]!) * s,
          cpFrom[i * 3 + 1]! + (cpTo[i * 3 + 1]! - cpFrom[i * 3 + 1]!) * s,
          cpFrom[i * 3 + 2]! + (cpTo[i * 3 + 2]! - cpFrom[i * 3 + 2]!) * s
        );
      }
      cpos.needsUpdate = true;
      cpMat.opacity = 0.28 + burst * 0.2 + inten * 0.12;
      cEdgeMat.opacity = 0.07 + burst * 0.05;

      // stage blocks
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

      const ax = x0 + active * spacing;
      for (let k = 0; k < pulseRings.length; k++) {
        const ring = pulseRings[k]!;
        const rt = ringT - k * 0.22;
        const mat = ring.material as THREE.MeshBasicMaterial;
        if (rt < 0 || rt > 1.3) {
          mat.opacity = 0;
        } else {
          const s = 0.5 + rt * 3.2;
          ring.scale.set(s, s, s);
          ring.position.x = ax;
          mat.opacity = (1 - rt / 1.3) * 0.32;
        }
      }

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
      cGeo.dispose();
      cEdgeGeo.dispose();
      cpGeo.dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      cBlocks.forEach((m) => (m.material as THREE.Material).dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="pipeline-scene" aria-hidden />;
}
