import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Full-desk ambient particle field — chain-like nodes + drifting packets.
 * Sits behind all panels (pointer-events: none).
 */
export function ChainParticles({
  pulseKey = 0,
  activity = 0.3,
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
    mount.appendChild(renderer.domElement);
    renderer.domElement.className = "chain-particles-canvas";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 28;

    const NODE_COUNT = 56;
    const PACKET_COUNT = 80;

    // fixed lattice nodes
    const nodePos = new Float32Array(NODE_COUNT * 3);
    for (let i = 0; i < NODE_COUNT; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      nodePos[i * 3] = (col - 3.5) * 3.2 + (row % 2) * 0.8;
      nodePos[i * 3 + 1] = (row - 3) * 2.4;
      nodePos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    const nodeMat = new THREE.PointsMaterial({
      color: 0xff9a1a,
      size: 0.18,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(nodeGeo, nodeMat));

    // edges between nearby nodes
    const edgePts: number[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const dx = nodePos[i * 3]! - nodePos[j * 3]!;
        const dy = nodePos[i * 3 + 1]! - nodePos[j * 3 + 1]!;
        const dz = nodePos[i * 3 + 2]! - nodePos[j * 3 + 2]!;
        const d = Math.hypot(dx, dy, dz);
        if (d < 4.2) {
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
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // drifting packets along random edges
    const pktPos = new Float32Array(PACKET_COUNT * 3);
    const pktFrom = new Float32Array(PACKET_COUNT * 3);
    const pktTo = new Float32Array(PACKET_COUNT * 3);
    const pktPhase = new Float32Array(PACKET_COUNT);
    const pktSpeed = new Float32Array(PACKET_COUNT);

    function pickEdge(i: number) {
      const a = Math.floor(Math.random() * NODE_COUNT);
      let b = Math.floor(Math.random() * NODE_COUNT);
      if (b === a) b = (b + 1) % NODE_COUNT;
      pktFrom[i * 3] = nodePos[a * 3]!;
      pktFrom[i * 3 + 1] = nodePos[a * 3 + 1]!;
      pktFrom[i * 3 + 2] = nodePos[a * 3 + 2]!;
      pktTo[i * 3] = nodePos[b * 3]!;
      pktTo[i * 3 + 1] = nodePos[b * 3 + 1]!;
      pktTo[i * 3 + 2] = nodePos[b * 3 + 2]!;
      pktPhase[i] = Math.random();
      pktSpeed[i] = 0.12 + Math.random() * 0.25;
    }
    for (let i = 0; i < PACKET_COUNT; i++) pickEdge(i);

    const pktGeo = new THREE.BufferGeometry();
    pktGeo.setAttribute("position", new THREE.BufferAttribute(pktPos, 3));
    const pktMat = new THREE.PointsMaterial({
      color: 0xffc266,
      size: 0.22,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(pktGeo, pktMat));

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
      const act = Math.min(1, Math.max(0.15, activityRef.current));

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        burst = 1;
      }
      burst *= 0.92;

      // slow orbit of whole field
      scene.rotation.y = Math.sin(t * 0.07) * 0.12;
      scene.rotation.x = Math.sin(t * 0.05) * 0.06;

      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PACKET_COUNT; i++) {
        let u = pktPhase[i]! + t * pktSpeed[i]! * (0.7 + act);
        if (u > 1) {
          pickEdge(i);
          u = 0;
          pktPhase[i] = 0;
        } else {
          pktPhase[i] = u;
        }
        const s = u * u * (3 - 2 * u); // smoothstep
        pos.setXYZ(
          i,
          pktFrom[i * 3]! + (pktTo[i * 3]! - pktFrom[i * 3]!) * s,
          pktFrom[i * 3 + 1]! +
            (pktTo[i * 3 + 1]! - pktFrom[i * 3 + 1]!) * s +
            Math.sin(t * 3 + i) * 0.05,
          pktFrom[i * 3 + 2]! + (pktTo[i * 3 + 2]! - pktFrom[i * 3 + 2]!) * s
        );
      }
      pos.needsUpdate = true;

      nodeMat.opacity = 0.35 + act * 0.25 + burst * 0.35;
      pktMat.opacity = 0.45 + act * 0.35 + burst * 0.4;
      edgeMat.opacity = 0.08 + act * 0.08 + burst * 0.12;
      pktMat.size = 0.18 + burst * 0.2;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      nodeGeo.dispose();
      edgeGeo.dispose();
      pktGeo.dispose();
      nodeMat.dispose();
      edgeMat.dispose();
      pktMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="chain-particles" aria-hidden />;
}
