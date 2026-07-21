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
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, active ? "#3a2010" : "#1a1008");
  grd.addColorStop(1, active ? "#1a0c04" : "#0c0804");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = active ? "#ffc266" : "#6a3a12";
  ctx.lineWidth = active ? 10 : 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  ctx.fillStyle = active ? "#ffb000" : "#c47a22";
  ctx.font = "bold 56px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = active ? "rgba(255,176,0,0.55)" : "transparent";
  ctx.shadowBlur = active ? 18 : 0;
  ctx.fillText(s.label, w / 2, 90);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffb000";
  ctx.font = "bold 110px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(String(s.pass), w / 2, 210);

  ctx.fillStyle = s.drop > 0 ? "#ff5533" : "#6a3a12";
  ctx.font = "36px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.fillText(s.drop > 0 ? `drop −${s.drop}` : "pass through", w / 2, 300);

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

    const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
    camera.position.set(0, 5.2, 14);
    camera.lookAt(0, 0.4, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.65));
    const key = new THREE.PointLight(0xffc266, 2.8, 60);
    key.position.set(0, 8, 8);
    scene.add(key);
    const fill = new THREE.PointLight(0xff6a1a, 0.7, 40);
    fill.position.set(-8, 3, 4);
    scene.add(fill);

    const grid = new THREE.GridHelper(48, 48, 0x8a4a12, 0x2a1808);
    grid.position.y = -1.8;
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.5;
      });
    } else {
      gm.transparent = true;
      gm.opacity = 0.5;
    }
    scene.add(grid);

    const spacing = 2.75;
    const x0 = -((N - 1) * spacing) / 2;

    const busPts = [
      new THREE.Vector3(x0 - 1.2, 0, 0),
      ...Array.from(
        { length: N },
        (_, i) => new THREE.Vector3(x0 + i * spacing, 0, 0)
      ),
      new THREE.Vector3(x0 + (N - 1) * spacing + 1.2, 0, 0),
    ];
    const busCurve = new THREE.CatmullRomCurve3(busPts);
    const busGeo = new THREE.TubeGeometry(busCurve, 96, 0.045, 8, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(busGeo, busMat));

    // larger labeled blocks
    const nodes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const boxGeo = new THREE.BoxGeometry(1.7, 1.35, 0.65);

    for (let i = 0; i < N; i++) {
      const sv = stagesRef.current[i] ?? DEFAULT_STAGES[i]!;
      const tex = makeLabelTexture(sv, false);
      textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.2,
        emissiveMap: tex,
        metalness: 0.4,
        roughness: 0.4,
      });
      materials.push(mat);
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + i * spacing, 0.35, 0);
      scene.add(mesh);
      nodes.push(mesh);
    }

    // dense unidirectional packets
    const PKT = 140;
    const pktPos = new Float32Array(PKT * 3);
    const pktU = new Float32Array(PKT);
    const pktSp = new Float32Array(PKT);
    for (let i = 0; i < PKT; i++) {
      pktU[i] = Math.random();
      pktSp[i] = 0.08 + Math.random() * 0.14;
    }
    const pktGeo = new THREE.BufferGeometry();
    pktGeo.setAttribute("position", new THREE.BufferAttribute(pktPos, 3));
    const pktMat = new THREE.PointsMaterial({
      color: 0xffe0a0,
      size: 0.13,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(pktGeo, pktMat));

    // ambient dust
    const DUST = 220;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 30;
      dustPos[i * 3 + 1] = Math.random() * 5 - 1;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
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
          opacity: 0.4,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );

    // expanding pulse rings on journal hit (flat on ground, not halo on boxes)
    const pulseRings: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.RingGeometry(0.2, 0.28, 48);
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
      mesh.position.y = -1.7;
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
      const h = mount.clientHeight || 320;
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

      // cinematic camera
      camera.position.x = Math.sin(t * 0.11) * 0.55;
      camera.position.y = 5.0 + Math.sin(t * 0.08) * 0.2;
      camera.position.z = 13.5 + Math.cos(t * 0.07) * 0.4;
      camera.lookAt(0, 0.35, 0);

      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = materials[i]!;
        const isOn = i <= active;
        const isCur = i === active;

        mat.emissiveIntensity = isCur
          ? 0.7 + burst * 0.55
          : isOn
            ? 0.35
            : 0.14;

        const bob = Math.sin(t * 1.7 + i * 0.7) * 0.08;
        const lift = isCur ? 0.55 : isOn ? 0.2 : 0.05;
        mesh.position.y = 0.35 + lift + bob;
        mesh.rotation.x = -0.15;
        mesh.rotation.y = Math.sin(t * 0.25 + i * 0.12) * 0.06;
        // subtle scale pulse on current
        const sc = isCur ? 1.06 + burst * 0.06 : 1;
        mesh.scale.setScalar(sc);
      }

      // packets to active stage only
      const maxU = Math.max(0.1, (active + 0.6) / N);
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PKT; i++) {
        let u = (pktU[i]! + t * pktSp[i]!) % 1;
        u = u * maxU;
        const pt = busCurve.getPointAt(Math.min(0.999, u));
        pos.setXYZ(
          i,
          pt.x,
          pt.y + Math.sin(t * 5 + i) * 0.05,
          pt.z + Math.cos(t * 4 + i) * 0.03
        );
      }
      pos.needsUpdate = true;
      pktMat.opacity = 0.55 + inten * 0.3 + burst * 0.35;
      pktMat.size = 0.11 + burst * 0.1;

      // ground pulse rings under active node
      const ax = x0 + active * spacing;
      for (let k = 0; k < pulseRings.length; k++) {
        const ring = pulseRings[k]!;
        const rt = ringT - k * 0.18;
        const mat = ring.material as THREE.MeshBasicMaterial;
        if (rt < 0 || rt > 1.2) {
          mat.opacity = 0;
        } else {
          const s = 0.5 + rt * 4;
          ring.scale.set(s, s, s);
          ring.position.x = ax;
          mat.opacity = (1 - rt / 1.2) * 0.45;
        }
      }

      const dp = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DUST; i++) {
        let y = dp.getY(i) + 0.006;
        if (y > 4) y = -1.2;
        dp.setY(i, y);
      }
      dp.needsUpdate = true;

      busMat.opacity = 0.3 + (active / N) * 0.35 + burst * 0.2;
      key.intensity = 2.2 + burst * 1.8 + inten * 0.6;

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
