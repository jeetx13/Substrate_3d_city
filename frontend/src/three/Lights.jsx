import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { anim } from "@/lib/anim";

const DAY_SKY = new THREE.Color("#f4ead8");
const NIGHT_SKY = new THREE.Color("#667da7");
const DAY_GROUND = new THREE.Color("#777163");
const NIGHT_GROUND = new THREE.Color("#28364c");
const DAY_SUN = new THREE.Color("#ffedcf");
const NIGHT_MOON = new THREE.Color("#a9c2f0");
const DAY_FILL = new THREE.Color("#d8d7c9");
const NIGHT_FILL = new THREE.Color("#8093bc");
const DAY_RIM = new THREE.Color("#eadfc8");
const NIGHT_RIM = new THREE.Color("#7995c8");
const DAY_POSITION = new THREE.Vector3(1.1, 0.95, 0.55);
const NIGHT_POSITION = new THREE.Vector3(-0.72, 1.2, -0.5);

export function Lights({ radius, hero = false, timeOfDay = "day" }) {
  const sun = useRef();
  const fill = useRef();
  const hemi = useRef();
  const rim = useRef();
  const nightMix = useRef(timeOfDay === "night" ? 1 : 0);
  useFrame((_, dt) => {
    const l = anim.light;
    const target = timeOfDay === "night" ? 1 : 0;
    nightMix.current = THREE.MathUtils.damp(nightMix.current, target, 1.5, dt);
    const mix = nightMix.current;
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(0.35 + 2.0 * l, 0.08 + 0.12 * l, mix);
      sun.current.color.copy(DAY_SUN).lerp(NIGHT_MOON, mix);
      sun.current.position.copy(DAY_POSITION).lerp(NIGHT_POSITION, mix).multiplyScalar(radius);
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.lerp(0.2 + 0.7 * l, 0.35 + 0.35 * l, mix);
      fill.current.color.copy(DAY_FILL).lerp(NIGHT_FILL, mix);
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(0.5 + 0.55 * l, 0.25 + 0.16 * l, mix);
      hemi.current.color.copy(DAY_SKY).lerp(NIGHT_SKY, mix);
      hemi.current.groundColor.copy(DAY_GROUND).lerp(NIGHT_GROUND, mix);
    }
    if (rim.current) {
      rim.current.intensity = THREE.MathUtils.lerp((hero ? 0.55 : 0.3) * l, 0.78 * l, mix);
      rim.current.color.copy(DAY_RIM).lerp(NIGHT_RIM, mix);
    }
  });
  const s = Math.max(radius * 1.5, 40);
  return (
    <>
      <hemisphereLight ref={hemi} args={["#f4ead8", "#777163", 0.8]} />
      <directionalLight
        ref={sun}
        position={[radius * DAY_POSITION.x, radius * DAY_POSITION.y, radius * DAY_POSITION.z]}
        intensity={2.5}
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
      <directionalLight ref={fill} position={[-radius, radius * 0.5, -radius * 0.7]} intensity={0.5} color={DAY_FILL} />
      {/* subtle rim light for depth — no shadow cast, negligible cost even at full city scale */}
      <directionalLight
        ref={rim}
        position={[-radius * 0.4, radius * 0.35, radius * 1.2]}
        intensity={0.3}
        color={DAY_RIM}
      />
    </>
  );
}
