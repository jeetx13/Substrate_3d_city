import { useMemo } from "react";
import * as THREE from "three";

function makeGroundTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Dark cool asphalt/concrete base — clearly darker than road color
  ctx.fillStyle = "#3a3c3e";
  ctx.fillRect(0, 0, size, size);

  // Fine-grain high-frequency concrete noise (no large soft blobs)
  let seed = 41;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Small amplitude noise to simulate concrete grain texture
    const n = (rnd() - 0.5) * 22;
    d[i]     = Math.max(0, Math.min(255, d[i]     + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.95));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.88));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);   // higher repeat = finer grain visible
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Ground({ radius }) {
  const tex = useMemo(makeGroundTexture, []);
  const hills = useMemo(() => {
    const out = [];
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.5;
      const dist = radius * (3.0 + rnd() * 1.8);
      // Desaturated, darker horizon hills so they don't compete with the ground
      out.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        sx: radius * (0.7 + rnd() * 1.1),
        sy: radius * (0.1 + rnd() * 0.12),
        color: i % 3 === 0 ? "#4a4d4a" : i % 3 === 1 ? "#52554f" : "#464944",
      });
    }
    return out;
  }, [radius]);
  return (
    <group>
      {/* Base ground plane — cool charcoal concrete, tinted slightly by material color */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[2400, 2400]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} color="#4a4d50" />
      </mesh>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, -h.sy * 0.35, h.z]} scale={[h.sx, h.sy, h.sx * 0.7]}>
          <sphereGeometry args={[1, 24, 12]} />
          <meshStandardMaterial color={h.color} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
