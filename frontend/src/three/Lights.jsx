import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { anim } from "@/lib/anim";

const DAY_SKY = new THREE.Color("#dce6f2");
const NIGHT_SKY = new THREE.Color("#344663");
const DAY_GROUND = new THREE.Color("#6e757d");
const NIGHT_GROUND = new THREE.Color("#171d27");
const DAY_SUN = new THREE.Color("#fff7ec");
const NIGHT_MOON = new THREE.Color("#829ec9");
const DAY_FILL = new THREE.Color("#cddae8");
const NIGHT_FILL = new THREE.Color("#364761");
const DAY_RIM = new THREE.Color("#dce7f5");
const NIGHT_RIM = new THREE.Color("#4a6388");
const DAY_POSITION = new THREE.Vector3(1.15, 1.30, 0.65);
const NIGHT_POSITION = new THREE.Vector3(-0.85, 1.25, -0.6);

export function Lights({ radius, hero = false, timeOfDay = "day" }) {
  const sun = useRef();
  const fill = useRef();
  const hemi = useRef();
  const rim = useRef();
  const nightMix = useRef(timeOfDay === "night" ? 1 : 0);

  useFrame((_, dt) => {
    // Ensure base light is active even if anim.light is still ramping
    const l = Math.max(anim.light, 0.85);
    const target = timeOfDay === "night" ? 1 : 0;
    nightMix.current = THREE.MathUtils.damp(nightMix.current, target, 2.2, dt);
    const mix = nightMix.current;

    if (sun.current) {
      // Clear key light direction for Day with crisp architectural shading
      sun.current.intensity = THREE.MathUtils.lerp(2.35 * l, 0.30 * l, mix);
      sun.current.color.copy(DAY_SUN).lerp(NIGHT_MOON, mix);
      sun.current.position.copy(DAY_POSITION).lerp(NIGHT_POSITION, mix).multiplyScalar(radius);
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.lerp(0.48 * l, 0.28 * l, mix);
      fill.current.color.copy(DAY_FILL).lerp(NIGHT_FILL, mix);
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(0.72 * l, 0.24 * l, mix);
      hemi.current.color.copy(DAY_SKY).lerp(NIGHT_SKY, mix);
      hemi.current.groundColor.copy(DAY_GROUND).lerp(NIGHT_GROUND, mix);
    }
    if (rim.current) {
      rim.current.intensity = THREE.MathUtils.lerp((hero ? 0.45 : 0.32) * l, 0.42 * l, mix);
      rim.current.color.copy(DAY_RIM).lerp(NIGHT_RIM, mix);
    }
  });

  const s = Math.max(radius * 1.5, 40);
  return (
    <>
      <hemisphereLight ref={hemi} args={["#dce6f2", "#6e757d", 0.85]} />
      <directionalLight
        ref={sun}
        position={[radius * DAY_POSITION.x, radius * DAY_POSITION.y, radius * DAY_POSITION.z]}
        intensity={2.2}
        color={DAY_SUN}
        castShadow
        shadow-mapSize={hero ? [3072, 3072] : [2048, 2048]}
        shadow-bias={-0.00035}
        shadow-normalBias={0.04}
        shadow-radius={hero ? 5 : 3}
        shadow-camera-near={1}
        shadow-camera-far={radius * 5}
        shadow-camera-left={-s}
        shadow-camera-right={s}
        shadow-camera-top={s}
        shadow-camera-bottom={-s}
      />
      <directionalLight ref={fill} position={[-radius, radius * 0.6, -radius * 0.7]} intensity={0.65} color={DAY_FILL} />
      <directionalLight
        ref={rim}
        position={[-radius * 0.4, radius * 0.4, radius * 1.2]}
        intensity={0.35}
        color={DAY_RIM}
      />
    </>
  );
}
