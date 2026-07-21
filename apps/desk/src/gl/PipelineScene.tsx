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
  const w = 256;
  const h = 192;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // face
  ctx.fillStyle = active ? "#2a1608" : "#140c06";
  ctx.fillRect(0, 0, w, h);

  // border
  ctx.strokeStyle = active ? "#ffc266" : "#5c3310";
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // label
  ctx.fillStyle = active ? "#ffb000" : "#c47a22";
  ctx.font = "bold 36px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s.label, w / 2, 52);

  // pass count
  ctx.fillStyle = "#ffb000";
  ctx.font = "bold 56px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(String(s.pass), w / 2, 112);

  // drop
  ctx.fillStyle = s.drop > 0 ? "#ff5533" : "#5c3310";
  ctx.font = "24px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(s.drop > 0 ? `−${s.drop}` : "pass", w / 2, 158);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Floating labeled blocks on a chain bus. No halos.
 */
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
    scene.fog = new THREE.FogExp2(0x070402, 0.026);

    const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 80);
    camera.position.set(0, 4.2, 12.5);
    camera.lookAt(0, 0.3, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.55));
    const key = new THREE.PointLight(0xffc266, 2.0, 50);
    key.position.set(0, 6, 7);
    scene.add(key);

    const grid = new THREE.GridHelper(36, 36, 0x8a4a12, 0x3a2008);
    grid.position.y = -1.5;
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

    const spacing = 2.55;
    const x0 = -((N - 1) * spacing) / 2;

    // bus line (thin, no halo)
    const busPts = [
      new THREE.Vector3(x0 - 0.9, 0, 0),
      ...Array.from(
        { length: N },
        (_, i) => new THREE.Vector3(x0 + i * spacing, 0, 0)
      ),
      new THREE.Vector3(x0 + (N - 1) * spacing + 0.9, 0, 0),
    ];
    const busCurve = new THREE.CatmullRomCurve3(busPts);
    const busGeo = new THREE.TubeGeometry(busCurve, 64, 0.03, 6, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(busGeo, busMat));

    // labeled boxes
    const nodes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const boxGeo = new THREE.BoxGeometry(1.35, 1.05, 0.55);

    for (let i = 0; i < N; i++) {
      const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
      const tex = makeLabelTexture(sv, false);
      textures.push(tex);

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.15,
        emissiveMap: tex,
        metalness: 0.35,
        roughness: 0.45,
      });
      materials.push(mat);

      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + i * spacing, 0.15, 0);
      scene.add(mesh);
      nodes.push(mesh);
    }

    // unidirectional particles
    const PKT = 80;
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
      size: 0.11,
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
      const w = mount.clientWidth || 900;
      const h = mount.clientHeight || 240;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // initial labels
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
      burst *= 0.93;

      // update textures when metrics or active stage change
      const sig =
        active +
        "|" +
        stagesRef.current.map((s) => `${s.pass}:${s.drop}`).join(",");
      if (sig !== lastStageSig) {
        lastStageSig = sig;
        refreshTextures(active);
      }

      camera.position.x = Math.sin(t * 0.09) * 0.35;
      camera.position.y = 4.1 + Math.sin(t * 0.07) * 0.1;
      camera.lookAt(0, 0.2, 0);

      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = materials[i]!;
        const isOn = i <= active;
        const isCur = i === active;

        mat.emissiveIntensity = isCur
          ? 0.55 + burst * 0.45
          : isOn
            ? 0.28
            : 0.12;

        const bob = Math.sin(t * 1.5 + i * 0.65) * 0.06;
        mesh.position.y = 0.2 + (isCur ? 0.38 : isOn ? 0.12 : 0) + bob;
        // slight face toward camera, no spin (labels readable)
        mesh.rotation.x = -0.12;
        mesh.rotation.y = Math.sin(t * 0.2 + i * 0.1) * 0.05;
      }

      const maxU = Math.max(0.08, (active + 0.55) / N);
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PKT; i++) {
        let u = (pktU[i]! + t * pktSp[i]!) % 1;
        u = u * maxU;
        const pt = busCurve.getPointAt(Math.min(0.999, u));
        pos.setXYZ(i, pt.x, pt.y + 0.05, pt.z);
      }
      pos.needsUpdate = true;
      pktMat.opacity = 0.5 + inten * 0.3 + burst * 0.3;

      busMat.opacity = 0.28 + (active / N) * 0.3 + burst * 0.15;
      key.intensity = 1.6 + burst * 1.2 + inten * 0.4;

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
