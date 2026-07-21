import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Lightweight Three.js underlay for the execution circuit.
 * Sits under the SVG — additive particles along the bus, not a full 3D scene.
 */
export function CircuitThree({ pulseKey = 0 }: { pulseKey?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef(pulseKey);
  pulseRef.current = pulseKey;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 900;
    const height = mount.clientHeight || 148;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.className = "circuit-three-canvas";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      width / -2,
      width / 2,
      height / 2,
      height / -2,
      0.1,
      100
    );
    camera.position.z = 10;

    // Bus line (very subtle)
    const busGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width * 0.42, 4, 0),
      new THREE.Vector3(width * 0.42, 4, 0),
    ]);
    const busMat = new THREE.LineBasicMaterial({
      color: 0x3d5a80,
      transparent: true,
      opacity: 0.35,
    });
    scene.add(new THREE.Line(busGeo, busMat));

    // Particle stream
    const COUNT = 48;
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      phases[i] = Math.random();
      positions[i * 3] = (phases[i] - 0.5) * width * 0.84;
      positions[i * 3 + 1] = 4 + (Math.random() - 0.5) * 3;
      positions[i * 3 + 2] = 0;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x00e5c0,
      size: 2.4,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    let raf = 0;
    let alive = true;
    let lastPulse = pulseRef.current;
    let burst = 0;
    const t0 = performance.now();

    const onResize = () => {
      const w = mount.clientWidth || 900;
      const h = mount.clientHeight || 148;
      renderer.setSize(w, h, false);
      camera.left = w / -2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = h / -2;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const frame = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      const w = mount.clientWidth || 900;

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        burst = 1;
      }
      burst *= 0.94;

      const pos = pGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        let u = (phases[i] + t * (0.08 + (i % 5) * 0.01)) % 1;
        pos.setX(i, (u - 0.5) * w * 0.84);
        pos.setY(i, 4 + Math.sin(t * 2 + i) * (1.2 + burst * 4));
      }
      pos.needsUpdate = true;
      pMat.opacity = 0.35 + burst * 0.55;
      pMat.color.setHex(burst > 0.2 ? 0x5b9dff : 0x00e5c0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      pGeo.dispose();
      busGeo.dispose();
      busMat.dispose();
      pMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="circuit-three" aria-hidden />;
}
