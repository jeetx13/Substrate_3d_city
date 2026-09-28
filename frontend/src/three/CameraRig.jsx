import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { rig } from "@/lib/anim";
import { useStore } from "@/store";

const P = new THREE.Vector3();
const T = new THREE.Vector3();
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// Parallax state — module-level so the event handler can write it cheaply
const mouse = { nx: 0, ny: 0 };          // normalized -1..1
const parallax = { x: 0, y: 0 };         // current damped offset
const PARALLAX_STRENGTH = 2.2;           // max world-unit shift per axis
const PARALLAX_LERP     = 0.045;         // damping speed (lower = more lag)
let activeCamera = null;
let activeControls = null;

export function selectAndFly(idx) {
  const { city, set } = useStore.getState();
  const building = city.buildings[idx];
  const camera = activeCamera;
  const controls = activeControls;
  set({ selected: idx });
  if (!building || !controls || !camera) return;

  const target = controls.target.clone().set(building.x, building.h * 0.42, building.z);
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.001) direction.set(1, 0.7, 1);
  direction.normalize();
  const distance = Math.max(18, Math.min(42, camera.position.distanceTo(controls.target) * 0.32));
  const destination = target.clone().addScaledVector(direction, distance);
  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);
  const apply = () => controls.update();
  gsap.to(camera.position, { x: destination.x, y: destination.y, z: destination.z, duration: 0.9, ease: "power2.inOut", onUpdate: apply });
  gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: 0.9, ease: "power2.inOut", onUpdate: apply });
}

export function CameraRig({ mode, radius }) {
  const { camera } = useThree();
  const controls = useRef();
  const isTouch  = useRef(false);

  useEffect(() => {
    rig.camera = camera;
    activeCamera = camera;
    return () => { rig.camera = null; activeCamera = null; activeControls = null; };
  }, [camera]);

  useEffect(() => {
    activeControls = controls.current;
    return () => { activeControls = null; };
  }, [mode]);

  useEffect(() => {
    if (mode === "city") rig.mode = "orbit";
  }, [mode]);

  // Cursor parallax — only on non-touch devices
  useEffect(() => {
    const onPointerMove = (e) => {
      // Treat any touch-initiated pointer as touch so we bail out
      if (e.pointerType === "touch") { isTouch.current = true; return; }
      const hw = window.innerWidth  * 0.5;
      const hh = window.innerHeight * 0.5;
      mouse.nx = (e.clientX - hw) / hw;   // -1 (left) … +1 (right)
      mouse.ny = (e.clientY - hh) / hh;   // -1 (top)  … +1 (bottom)
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useFrame((state) => {
    rig.time = state.clock.elapsedTime;

    // Accumulate damped parallax offset (skip on touch)
    if (!isTouch.current) {
      parallax.x += (mouse.nx * PARALLAX_STRENGTH - parallax.x) * PARALLAX_LERP;
      parallax.y += (-mouse.ny * PARALLAX_STRENGTH - parallax.y) * PARALLAX_LERP;
    }

    if (rig.mode === "path") {
      const s = Math.min(1, Math.max(0, rig.scroll));
      rig.pathPos.getPoint(s, P);
      rig.pathTarget.getPoint(s, T);
      const e = easeOut(rig.intro);
      P.lerpVectors(rig.introStart, P, e);
      T.lerpVectors(rig.introTarget, T, e);
      const calm = (1 - s) * e;
      P.x += Math.sin(rig.time * 0.11) * 0.9 * calm;
      P.y += Math.sin(rig.time * 0.07 + 1) * 0.45 * calm;
      P.z += Math.cos(rig.time * 0.09) * 0.6 * calm;
      // Additive parallax offset on top of scroll path
      P.x += parallax.x;
      P.y += parallax.y * 0.5;  // vertical feels more natural at half-strength
      camera.position.copy(P);
      camera.lookAt(T);
    } else if (rig.mode === "orbit") {
      // In orbit mode apply parallax as a small additive nudge to camera position
      // without disrupting the OrbitControls target — nudge is purely cosmetic
      camera.position.x += (parallax.x * 0.35 - 0) * 0.02;
      camera.position.y += (parallax.y * 0.35 - 0) * 0.02;
    } else if (rig.mode === "tween") {
      camera.position.copy(rig.pos);
      camera.lookAt(rig.target);
    }
  });

  if (mode !== "city") return null;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={rig.target}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={radius * 0.25}
      maxDistance={radius * 3.2}
      maxPolarAngle={Math.PI / 2 - 0.06}
    />
  );
}
