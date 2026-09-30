import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { anim } from "@/lib/anim";

export function Lights({ radius, hero = false }) {
  const sun = useRef();
  const fill = useRef();
  const hemi = useRef();
  const rim = useRef();
  useFrame(() => {
    const l = anim.light;
    if (sun.current) sun.current.intensity = 0.35 + 2.0 * l;
    if (fill.current) fill.current.intensity = 0.2 + 0.7 * l;
    if (hemi.current) hemi.current.intensity = 0.5 + 0.55 * l;
    if (rim.current) rim.current.intensity = (hero ? 0.55 : 0.3) * l;
  });
  const s = Math.max(radius * 1.5, 40);
  return (
    <>
      <hemisphereLight ref={hemi} args={["#f4ead8", "#777163", 0.8]} />
      <directionalLight
        ref={sun}
        position={[radius * 1.1, radius * 0.95, radius * 0.55]}
        intensity={2.5}
        color="#ffedcf"
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
      <directionalLight ref={fill} position={[-radius, radius * 0.5, -radius * 0.7]} intensity={0.5} color="#d8d7c9" />
      {/* subtle rim light for depth — no shadow cast, negligible cost even at full city scale */}
      <directionalLight
        ref={rim}
        position={[-radius * 0.4, radius * 0.35, radius * 1.2]}
        intensity={0.3}
        color="#eadfc8"
      />
    </>
  );
}
