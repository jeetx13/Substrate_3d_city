import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/store";
import { Ground } from "./Ground";
import { Lights } from "./Lights";
import { Buildings } from "./Buildings";
import { Roads } from "./Roads";
import { CameraRig } from "./CameraRig";

function DistrictLabels({ city, visible }) {
  if (!visible) return null;
  return city.districts.slice(0, 12).map((district) => (
    <Html key={district.name} position={[district.x, district.y, district.z]} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {district.name}
      </span>
    </Html>
  ));
}

function ScreenshotBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    window.__captureCityPng = () => {
      // Render and read the canvas synchronously so the drawing buffer is still available.
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    };
    return () => { delete window.__captureCityPng; };
  }, [gl, scene, camera]);
  return null;
}

export function Scene() {
  const city = useStore((s) => s.city);
  const mode = useStore((s) => s.mode);
  const timeOfDay = useStore((s) => s.timeOfDay);
  const R = Math.max(city.radius, 30);
  return (
    <div className="canvas-layer" data-testid="city-canvas">
      <Canvas
        shadows="soft"
        dpr={[1, 1.6]}
        camera={{ fov: 36, near: 0.5, far: R * 12 + 400, position: [50, 34, 66] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02 }}
      >
        <fog attach="fog" args={[timeOfDay === "night" ? "#101928" : "#d5cfc2", R * 1.1, R * 4.8 + 60]} />
        <Lights radius={R} hero={mode === "landing"} timeOfDay={timeOfDay} />
        <Ground radius={R} city={city} timeOfDay={timeOfDay} />
        <Buildings city={city} interactive={mode === "city"} timeOfDay={timeOfDay} />
        <Roads city={city} timeOfDay={timeOfDay} />
        <CameraRig mode={mode} radius={R} />
        <DistrictLabels city={city} visible={mode === "city"} />
        <ScreenshotBridge />
      </Canvas>
    </div>
  );
}
