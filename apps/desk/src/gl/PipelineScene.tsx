import { useEffect, useRef } from "react";
import * as THREE from "three";

const STAGE_LABELS = [
  "POLL",
  "PARSE",
  "CLASS",
  "DECAY",
  "EDGE",
  "RISK",
  "POLICY",
  "BOOK",
];

/**
 * Spectacular Three.js underlay for the decision pipeline.
 * Nodes + beams + unidirectional packets. Lights up to activeStage.
 */
export function PipelineScene({
  pulseKey = 0,
  activeStage = 2,
  intensity = 0.6,
}: {
  pulseKey?: number;
  activeStage?: number;
  intensity?: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef(pulseKey);
  const stageRef = useRef(activeStage);
  const intensityRef = useRef(intensity);
  pulseRef.current = pulseKey;
  stageRef.current = activeStage;
  intensityRef.current = intensity;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

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
    scene.fog = new THREE.FogExp2(0x0a0602, 0.035);

    const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 100);
    camera.position.set(0, 2.2, 14);
    camera.lookAt(0, 0, 0);

    // soft ambient + key
    scene.add(new THREE.AmbientLight(0xff9a1a, 0.25));
    const key = new THREE.PointLight(0xffb000, 1.4, 40);
    key.position.set(0, 6, 8);
    scene.add(key);

    const N = STAGE_LABELS.length;
    const spacing = 2.35;
    const x0 = -((N - 1) * spacing) / 2;

    // ground grid (subtle chain lattice)
    const grid = new THREE.GridHelper(28, 28, 0x5c3310, 0x3a2008);
    grid.position.y = -1.6;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    // stage nodes
    const nodes: THREE.Mesh[] = [];
    const glows: THREE.Mesh[] = [];
    const nodeGroup = new THREE.Group();

    const boxGeo = new THREE.BoxGeometry(1.15, 0.85, 0.55);
    const glowGeo = new THREE.SphereGeometry(0.55, 16, 16);

    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a0e04,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.15,
        metalness: 0.7,
        roughness: 0.35,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + i * spacing, 0, 0);
      nodeGroup.add(mesh);
      nodes.push(mesh);

      const gMat = new THREE.MeshBasicMaterial({
        color: 0xffb000,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeo, gMat);
      glow.position.copy(mesh.position);
      glow.scale.setScalar(1.6);
      nodeGroup.add(glow);
      glows.push(glow);
    }
    scene.add(nodeGroup);

    // beams between nodes
    const beams: THREE.Line[] = [];
    for (let i = 0; i < N - 1; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x0 + i * spacing + 0.6, 0, 0),
        new THREE.Vector3(x0 + (i + 1) * spacing - 0.6, 0, 0),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: 0xff9f1a,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      beams.push(line);
    }

    // unidirectional packets along the bus
    const PKT = 64;
    const pktPos = new Float32Array(PKT * 3);
    const pktPhase = new Float32Array(PKT);
    const pktSpeed = new Float32Array(PKT);
    for (let i = 0; i < PKT; i++) {
      pktPhase[i] = Math.random();
      pktSpeed[i] = 0.08 + Math.random() * 0.12;
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
    const packets = new THREE.Points(pktGeo, pktMat);
    scene.add(packets);

    // ambient spark field
    const SPARK = 120;
    const sparkPos = new Float32Array(SPARK * 3);
    for (let i = 0; i < SPARK; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * 22;
      sparkPos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xc47a22,
      size: 0.04,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(sparkGeo, sparkMat));

    let raf = 0;
    let alive = true;
    let lastPulse = pulseRef.current;
    let burst = 0;
    const t0 = performance.now();

    const resize = () => {
      const w = mount.clientWidth || 900;
      const h = mount.clientHeight || 180;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      const active = Math.max(0, Math.min(N - 1, stageRef.current));
      const inten = intensityRef.current;

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        burst = 1;
      }
      burst *= 0.94;

      // gentle camera drift
      camera.position.x = Math.sin(t * 0.12) * 0.35;
      camera.position.y = 2.1 + Math.sin(t * 0.09) * 0.15;
      camera.lookAt(0, 0, 0);

      // nodes react to active stage
      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const glow = glows[i]!;
        const gMat = glow.material as THREE.MeshBasicMaterial;

        const isOn = i <= active;
        const isCurrent = i === active;

        mat.emissiveIntensity = isCurrent
          ? 0.85 + burst * 0.6
          : isOn
            ? 0.35 + burst * 0.2
            : 0.12;
        mat.color.setHex(isCurrent ? 0x3a1e08 : 0x1a0e04);

        const bob = Math.sin(t * 1.4 + i * 0.5) * 0.04;
        mesh.position.y = (isCurrent ? 0.25 : 0) + bob;
        mesh.rotation.y = Math.sin(t * 0.5 + i) * 0.04;

        glow.position.copy(mesh.position);
        gMat.opacity = isCurrent
          ? 0.35 + burst * 0.35
          : isOn
            ? 0.12
            : 0.04;
        const sc = isCurrent ? 2.2 + burst * 0.5 : isOn ? 1.7 : 1.4;
        glow.scale.setScalar(sc);
      }

      // beams
      for (let i = 0; i < beams.length; i++) {
        const mat = beams[i]!.material as THREE.LineBasicMaterial;
        mat.opacity = i < active ? 0.55 + burst * 0.25 : 0.15;
      }

      // packets only flow up to active stage (unidirectional)
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      const pathLen = Math.max(0.15, active / Math.max(1, N - 1));
      for (let i = 0; i < PKT; i++) {
        let u = (pktPhase[i]! + t * pktSpeed[i]!) % 1;
        // map into [0, pathLen]
        u = u * pathLen;
        const x = x0 + u * (N - 1) * spacing;
        const y = Math.sin(u * Math.PI * 4 + t * 2) * 0.08;
        pos.setXYZ(i, x, y, (Math.random() - 0.5) * 0.05);
      }
      pos.needsUpdate = true;
      pktMat.opacity = 0.5 + inten * 0.35 + burst * 0.3;
      pktMat.size = 0.1 + burst * 0.08;

      // slow spark drift
      const sp = sparkGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < SPARK; i++) {
        let y = sp.getY(i) + 0.003 * ((i % 3) + 1);
        if (y > 3) y = -3;
        sp.setY(i, y);
      }
      sp.needsUpdate = true;

      key.intensity = 1.1 + burst * 1.2 + inten * 0.4;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      boxGeo.dispose();
      glowGeo.dispose();
      pktGeo.dispose();
      sparkGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="pipeline-scene" aria-hidden />;
}
