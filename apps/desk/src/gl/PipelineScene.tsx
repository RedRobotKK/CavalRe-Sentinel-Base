import { useEffect, useRef } from "react";
import * as THREE from "three";

const N = 8;

/**
 * Hero pipeline visualization — full-bleed under stage labels.
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
    scene.fog = new THREE.FogExp2(0x070402, 0.028);

    const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 80);
    camera.position.set(0, 3.8, 11.5);
    camera.lookAt(0, 0.2, 0);

    scene.add(new THREE.AmbientLight(0xff9a1a, 0.35));
    const key = new THREE.PointLight(0xffc266, 2.2, 50);
    key.position.set(0, 5, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0xff5533, 0.6, 30);
    rim.position.set(-6, 2, -4);
    scene.add(rim);

    // floor plane with grid
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x120a04,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    scene.add(floor);

    const grid = new THREE.GridHelper(36, 36, 0x8a4a12, 0x3a2008);
    grid.position.y = -1.34;
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.45;
      });
    } else {
      gm.transparent = true;
      gm.opacity = 0.45;
    }
    scene.add(grid);

    const spacing = 2.5;
    const x0 = -((N - 1) * spacing) / 2;

    // main bus tube
    const busCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0 - 0.8, 0, 0),
      ...Array.from({ length: N }, (_, i) => new THREE.Vector3(x0 + i * spacing, 0, 0)),
      new THREE.Vector3(x0 + (N - 1) * spacing + 0.8, 0, 0),
    ]);
    const busGeo = new THREE.TubeGeometry(busCurve, 64, 0.04, 8, false);
    const busMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(busGeo, busMat));

    // nodes
    const nodes: THREE.Mesh[] = [];
    const rings: THREE.Mesh[] = [];
    const nodeGeo = new THREE.BoxGeometry(1.05, 0.72, 0.72);
    const ringGeo = new THREE.TorusGeometry(0.72, 0.035, 8, 32);

    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1c1006,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.2,
        metalness: 0.85,
        roughness: 0.28,
      });
      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.set(x0 + i * spacing, 0, 0);
      scene.add(mesh);
      nodes.push(mesh);

      const rMat = new THREE.MeshBasicMaterial({
        color: 0xffb000,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, rMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(mesh.position);
      scene.add(ring);
      rings.push(ring);
    }

    // energy particles along bus (unidirectional)
    const PKT = 100;
    const pktPos = new Float32Array(PKT * 3);
    const pktU = new Float32Array(PKT);
    const pktSp = new Float32Array(PKT);
    for (let i = 0; i < PKT; i++) {
      pktU[i] = Math.random();
      pktSp[i] = 0.06 + Math.random() * 0.1;
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

    // secondary dust
    const DUST = 180;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 24;
      dustPos[i * 3 + 1] = Math.random() * 4 - 0.5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xc47a22,
      size: 0.035,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(dustGeo, dustMat));

    let raf = 0;
    let alive = true;
    let lastPulse = pulseRef.current;
    let burst = 0;
    const t0 = performance.now();

    const resize = () => {
      const w = mount.clientWidth || 900;
      const h = mount.clientHeight || 220;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

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

      camera.position.x = Math.sin(t * 0.1) * 0.4;
      camera.position.y = 3.7 + Math.sin(t * 0.08) * 0.12;
      camera.lookAt(0, 0.15, 0);

      for (let i = 0; i < N; i++) {
        const mesh = nodes[i]!;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const ring = rings[i]!;
        const rMat = ring.material as THREE.MeshBasicMaterial;

        const isOn = i <= active;
        const isCur = i === active;

        mat.emissiveIntensity = isCur
          ? 1.1 + burst * 0.8
          : isOn
            ? 0.45
            : 0.12;
        mat.color.setHex(isCur ? 0x4a2810 : 0x1c1006);

        const bob = Math.sin(t * 1.6 + i * 0.7) * 0.05;
        mesh.position.y = (isCur ? 0.35 : isOn ? 0.1 : 0) + bob;
        mesh.rotation.y = t * 0.15 + i * 0.2;

        ring.position.copy(mesh.position);
        ring.rotation.z = t * (isCur ? 1.2 : 0.3);
        rMat.opacity = isCur ? 0.55 + burst * 0.35 : isOn ? 0.22 : 0.08;
        const rs = isCur ? 1.15 + burst * 0.2 : 1;
        ring.scale.setScalar(rs);
      }

      // packets flow only to active
      const maxU = Math.max(0.08, (active + 0.5) / N);
      const pos = pktGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PKT; i++) {
        let u = (pktU[i]! + t * pktSp[i]!) % 1;
        u = u * maxU;
        const pt = busCurve.getPointAt(Math.min(0.999, u));
        pos.setXYZ(
          i,
          pt.x,
          pt.y + Math.sin(t * 4 + i) * 0.06,
          pt.z + Math.cos(t * 3 + i) * 0.04
        );
      }
      pos.needsUpdate = true;
      pktMat.opacity = 0.55 + inten * 0.3 + burst * 0.35;
      pktMat.size = 0.12 + burst * 0.1;

      busMat.opacity = 0.25 + (active / N) * 0.35 + burst * 0.2;

      const dp = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DUST; i++) {
        let y = dp.getY(i) + 0.004;
        if (y > 3.5) y = -0.8;
        dp.setY(i, y);
      }
      dp.needsUpdate = true;

      key.intensity = 1.8 + burst * 1.5 + inten * 0.5;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      nodeGeo.dispose();
      ringGeo.dispose();
      busGeo.dispose();
      pktGeo.dispose();
      dustGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="pipeline-scene" aria-hidden />;
}
