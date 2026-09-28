import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/store";
import { Ground } from "./Ground";
import { Lights } from "./Lights";
import { Buildings } from "./Buildings";
import { Roads } from "./Roads";
import { CameraRig } from "./CameraRig";

export function Scene() {
  const city = useStore((s) => s.city);
  const mode = useStore((s) => s.mode);
  const R = Math.max(city.radius, 30);
  return (
    <div className="canvas-layer" data-testid="city-canvas">
      <Canvas
        shadows="soft"
        dpr={[1, 1.6]}
        camera={{ fov: 36, near: 0.5, far: R * 12 + 400, position: [50, 34, 66] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02 }}
      >
        <fog attach="fog" args={["#e2dbcb", R * 1.1, R * 4.8 + 60]} />
        <Lights radius={R} hero={mode === "landing"} />
        <Ground radius={R} />
        <Buildings city={city} interactive={mode === "city"} />
        <Roads city={city} />
        <CameraRig mode={mode} radius={R} />
      </Canvas>
    </div>
  );
}
