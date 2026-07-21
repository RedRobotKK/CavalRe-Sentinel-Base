import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Full-viewport transparent blockchain loop behind the desk.
 * Hex-ish block nodes + links + circulating packets. Never competes with UI.
 */
export function ChainParticles({
  pulseKey = 0,
  activity = 0.35,
}: {
  pulseKey?: number;
  activity?: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef(pulseKey);
  const activityRef = useRef(activity);
  pulseRef.current = pulseKey;
  activityRef.current = activity;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "chain-particles-canvas";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    camera.position.set(0, 6, 22);
    camera.lookAt(0, 0, 0);

    // --- block lattice (rows of chain "blocks") ---
    const COLS = 10;
    const ROWS = 6;
    const NODE_COUNT = COLS * ROWS;
    const nodePos = new Float32Array(NODE_COUNT * 3);
    const blockMeshes: THREE.Mesh[] = [];

    const blockGeo = new THREE.BoxGeometry(0.55, 0.35, 0.55);
    const blockMat = new THREE.MeshBasicMaterial({
      color: 0xff9a1a,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const x = (c - (COLS - 1) / 2) * 2.4 + (r % 2) * 1.2;
        const y = (r - (ROWS - 1) / 2) * 1.9;
        const z = (Math.sin(c * 0.7 + r) - 0.5) * 3;
        nodePos[i * 3] = x;
        nodePos[i * 3 + 1] = y;
        nodePos[i * 3 + 2] = z;

        const m = new THREE.Mesh(blockGeo, blockMat.clone());
        m.position.set(x, y, z);
        m.rotation.y = 0.4;
        scene.add(m);
        blockMeshes.push(m);
      }
    }

    // links between neighbors (chain)
    const edgePts: number[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const dx = nodePos[i * 3]! - nodePos[j * 3]!;
        const dy = nodePos[i * 3 + 1]! - nodePos[j * 3 + 1]!;
        const dz = nodePos[i * 3 + 2]! - nodePos[j * 3 + 2]!;
        const d = Math.hypot(dx, dy, dz);
        if (d < 3.2) {
          edgePts.push(
            nodePos[i * 3]!,
            nodePos[i * 3 + 1]!,
            nodePos[i * 3 + 2]!,
            nodePos[j * 3]!,
            nodePos[j * 3 + 1]!,
            nodePos[j * 3 + 2]!
          );
        }
      }
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(edgePts, 3)
    );
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xff8c1a,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // circulating packets along random links (the "loop")
    const PKT = 90;
    const pktPos = new Float32Array(PKT * 3);
    const pktFrom = new Float32Array(PKT * 3);
    const pktTo = new Float32Array(PKT * 3);
    const pktPhase = new Float32Array(PKT);
    const pktSpeed = new Float32Array(PKT);

    function pickHop(i: number) {
      const a = Math.floor(Math.random() * NODE_COUNT);
      let b = Math.floor(Math.random() * NODE_COUNT);
      if (b === a) b = (b + 1) % NODE_COUNT;
      // prefer nearby
      for (let tries = 0; tries < 6; tries++) {
        const t = Math.floor(Math.random() * NODE_COUNT);
        const d = Math.hypot(
          nodePos[a * 3]! - nodePos[t * 3]!,
          nodePos[a * 3 + 1]! - nodePos[t * 3 + 1]!,
          nodePos[a * 3 + 2]! - nodePos[t * 3 + 2]!
        );
        if (d < 3.5 && t !== a) {
          b = t;
          break;
        }
      }
      pktFrom[i * 3] = nodePos[a * 3]!;
      pktFrom[i * 3 + 1] = nodePos[a * 3 + 1]!;
      pktFrom[i * 3 + 2] = nodePos[a * 3 + 2]!;
      pktTo[i * 3] = nodePos[b * 3]!;
      pktTo[i * 3 + 1] = nodePos[b * 3 + 1]!;
      pktTo[i * 3 + 2] = nodePos[b * 3 + 2]!;
      pktPhase[i] = 0;
      pktSpeed[i] = 0.15 + Math.random() * 0.25;
    }
    for (let i = 0; i < PKT; i++) {
      pickHop(i);
      pktPhase[i] = Math.random();
    }

    const pktGeo = new THREE.BufferGeometry();
    pktGeo.setAttribute("position", new THREE.BufferAttribute(pktPos, 3));
    const pktMat = new THREE.PointsMaterial({
      color: 0xffe0a0,
      size: 0.16,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(pktGeo, pktMat));

    // soft hash dust
    const DUST = 100;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 30;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 16;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    scene.add(
      new THREE.Points(
        dustGeo,
        new THREE.PointsMaterial({
          color: 0xc47a22,
          size: 0.05,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );

    let raf = 0;
    let alive = true;
    let lastPulse = pulseRef.current;
    let burst = 0;
    const t0 = performance.now();

    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      const act = Math.min(1, Math.max(0.2, activityRef.current));

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        burst = 1;
      }
      burst *= 0.93;

      // slow orbit of whole lattice
      scene.rotation.y = t * 0.04;
      scene.rotation.x = Math.sin(t * 0.03) * 0.08;

      // blocks gently breathe
      for (let i = 0; i < blockMeshes.length; i++) {
        const m = blockMeshes[i]!;
        const mat = m.material as THREE.MeshBasicMaterial;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 + i * 0.35);
        mat.opacity = 0.08 + act * 0.08 + pulse * 0.06 + burst * 0.12;
        m.rotation.y = 0.4 + t * 0.08;
        m.position.y =
          nodePos[i * 3 + 1]! + Math.sin(t * 0.9 + i * 0.2) * 0.08;
      }

      // packets hop forever
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PKT; i++) {
        let u = pktPhase[i]! + t * 0; // phase advanced below
        u = (pktPhase[i]! +
          ((performance.now() - t0) / 1000) * pktSpeed[i]!) %
          1;
        // store back via recompute - use modular
        const phase =
          (Math.sin(i * 12.9898) * 43758.5453 +
            t * pktSpeed[i]!) %
          1;
        const p = phase < 0 ? phase + 1 : phase;
        if (p < 0.02) {
          // occasional re-pick for variety - actually pick when crossing
        }
        // continuous hop using stored from/to, re-pick when complete
        pktPhase[i] = (pktPhase[i]! + 0.016 * pktSpeed[i]!) % 1;
        if (pktPhase[i]! < 0.016 * pktSpeed[i]!) pickHop(i);
        const s = pktPhase[i]! * pktPhase[i]! * (3 - 2 * pktPhase[i]!);
        pos.setXYZ(
          i,
          pktFrom[i * 3]! + (pktTo[i * 3]! - pktFrom[i * 3]!) * s,
          pktFrom[i * 3 + 1]! +
            (pktTo[i * 3 + 1]! - pktFrom[i * 3 + 1]!) * s +
            Math.sin(t * 2 + i) * 0.04,
          pktFrom[i * 3 + 2]! + (pktTo[i * 3 + 2]! - pktFrom[i * 3 + 2]!) * s
        );
      }
      pos.needsUpdate = true;

      pktMat.opacity = 0.35 + act * 0.25 + burst * 0.3;
      edgeMat.opacity = 0.07 + act * 0.06 + burst * 0.08;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      blockGeo.dispose();
      edgeGeo.dispose();
      pktGeo.dispose();
      dustGeo.dispose();
      blockMeshes.forEach((m) => (m.material as THREE.Material).dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="chain-particles" aria-hidden />;
}
