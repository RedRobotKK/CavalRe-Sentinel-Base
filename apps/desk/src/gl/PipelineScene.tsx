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
  grd.addColorStop(0, active ? "#4a2810" : "#24160c");
  grd.addColorStop(1, active ? "#1c0e06" : "#100a04");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = active ? "#ffc266" : "#a06020";
  ctx.lineWidth = active ? 14 : 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // stage name — large
  ctx.fillStyle = active ? "#ffe0a0" : "#ffb84d";
  ctx.font = "bold 72px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,176,0,0.5)";
  ctx.shadowBlur = active ? 20 : 8;
  ctx.fillText(s.label, w / 2, 95);

  // pass count — dominant
  ctx.shadowBlur = active ? 24 : 6;
  ctx.fillStyle = "#ffb000";
  ctx.font = "bold 140px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(String(s.pass), w / 2, 230);

  // drop line
  ctx.shadowBlur = 0;
  ctx.fillStyle = s.drop > 0 ? "#ff6644" : "#8a5a1e";
  ctx.font = "bold 42px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(s.drop > 0 ? `DROP −${s.drop}` : "PASS", w / 2, 330);

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
    scene.fog = new THREE.FogExp2(0x060301, 0.03);

    // closer / lower FOV so blocks dominate the frame
    const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 80);
    camera.position.set(0, 3.6, 11.2);
    camera.lookAt(0, 0.5, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.75));
    const key = new THREE.PointLight(0xffc266, 3.2, 55);
    key.position.set(0, 6, 7);
    scene.add(key);

    const grid = new THREE.GridHelper(40, 40, 0x8a4a12, 0x2a1808);
    grid.position.y = -1.4;
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.4;
      });
    } else {
      gm.transparent = true;
      gm.opacity = 0.4;
    }
    scene.add(grid);

    // tighter spacing, larger boxes
    const spacing = 2.35;
    const x0 = -((N - 1) * spacing) / 2;

    const busPts = [
      new THREE.Vector3(x0 - 1.0, 0, 0),
      ...Array.from(
        { length: N },
        (_, i) => new THREE.Vector3(x0 + i * spacing, 0, 0)
      ),
      new THREE.Vector3(x0 + (N - 1) * spacing + 1.0, 0, 0),
    ];
    const busCurve = new THREE.CatmullRomCurve3(busPts);
    const busGeo = new THREE.TubeGeometry(busCurve, 96, 0.05, 8, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(busGeo, busMat));

    const nodes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    // ~30% larger face area than prior
    const boxGeo = new THREE.BoxGeometry(2.05, 1.7, 0.7);

    for (let i = 0; i < N; i++) {
      const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
      const tex = makeLabelTexture(sv, false);
      textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.25,
        emissiveMap: tex,
        metalness: 0.35,
        roughness: 0.42,
      });
      materials.push(mat);
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + i * spacing, 0.55, 0);
      scene.add(mesh);
      nodes.push(mesh);
    }

    const PKT = 120;
    const pktPos = new Float32Array(PKT * 3);
    const pktU = new Float32Array(PKT);
    const pktSp = new Float32Array(PKT);
    for (let i = 0; i < PKT; i++) {
      pktU[i] = Math.random();
      pktSp[i] = 0.08 + Math.random() * 0.12;
    }
    const pktGeo = new THREE.BufferGeometry();
    pktGeo.setAttribute("position", new THREE.BufferAttribute(pktPos, 3));
    const pktMat = new THREE.PointsMaterial({
      color: 0xffe0a0,
      size: 0.14,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(pktGeo, pktMat));

    const DUST = 160;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 28;
      dustPos[i * 3 + 1] = Math.random() * 4 - 0.8;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    scene.add(
      new THREE.Points(
        dustGeo,
        new THREE.PointsMaterial({
          color: 0xc47a22,
          size: 0.04,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );

    const pulseRings: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.RingGeometry(0.25, 0.35, 48);
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
      mesh.position.y = -1.35;
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

      camera.position.x = Math.sin(t * 0.1) * 0.35;
      camera.position.y = 3.5 + Math.sin(t * 0.08) * 0.12;
      camera.position.z = 11.0 + Math.cos(t * 0.07) * 0.25;
      camera.lookAt(0, 0.55, 0);

      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = materials[i]!;
        const isOn = i <= active;
        const isCur = i === active;

        mat.emissiveIntensity = isCur
          ? 0.75 + burst * 0.5
          : isOn
            ? 0.4
            : 0.18;

        const bob = Math.sin(t * 1.6 + i * 0.65) * 0.07;
        const lift = isCur ? 0.45 : isOn ? 0.15 : 0.05;
        mesh.position.y = 0.55 + lift + bob;
        mesh.rotation.x = -0.18; // face camera a bit more
        mesh.rotation.y = Math.sin(t * 0.2 + i * 0.1) * 0.04;
        mesh.scale.setScalar(isCur ? 1.08 + burst * 0.05 : 1);
      }

      const maxU = Math.max(0.1, (active + 0.6) / N);
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PKT; i++) {
        let u = (pktU[i]! + t * pktSp[i]!) % 1;
        u = u * maxU;
        const pt = busCurve.getPointAt(Math.min(0.999, u));
        pos.setXYZ(i, pt.x, pt.y + 0.08, pt.z);
      }
      pos.needsUpdate = true;
      pktMat.opacity = 0.55 + inten * 0.3 + burst * 0.3;

      const ax = x0 + active * spacing;
      for (let k = 0; k < pulseRings.length; k++) {
        const ring = pulseRings[k]!;
        const rt = ringT - k * 0.18;
        const mat = ring.material as THREE.MeshBasicMaterial;
        if (rt < 0 || rt > 1.2) {
          mat.opacity = 0;
        } else {
          const s = 0.6 + rt * 3.5;
          ring.scale.set(s, s, s);
          ring.position.x = ax;
          mat.opacity = (1 - rt / 1.2) * 0.4;
        }
      }

      const dp = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DUST; i++) {
        let y = dp.getY(i) + 0.005;
        if (y > 3.5) y = -1;
        dp.setY(i, y);
      }
      dp.needsUpdate = true;

      busMat.opacity = 0.35 + (active / N) * 0.3 + burst * 0.15;
      key.intensity = 2.6 + burst * 1.6 + inten * 0.5;

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
      dustGeo.dispose();
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
