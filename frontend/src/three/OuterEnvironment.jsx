import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";

const dummy = new THREE.Object3D();

// Mulberry32 deterministic PRNG
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate deterministic outer urban elements around city radius
function makeOuterElements(radius) {
  const rnd = mulberry32(54321);
  const plazas = [];
  const trees = [];
  const silhouettes = [];

  const innerR = Math.max(radius * 1.05, 34);
  const midR = innerR + 24;
  const outerR = midR + 65;

  // 1. Secondary urban transition plazas / open paved spaces (derived deterministically)
  const plazaCount = 8;
  for (let i = 0; i < plazaCount; i++) {
    const angle = (i / plazaCount) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const dist = innerR + 4 + rnd() * 14;
    const w = 12 + rnd() * 16;
    const d = 12 + rnd() * 16;
    plazas.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      w,
      d,
      park: rnd() > 0.45,
    });
  }

  // 2. Sparse muted vegetation clusters (park pockets & buffer zones)
  const treeCount = 28;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const dist = innerR + 2 + rnd() * 32;
    const scale = 0.85 + rnd() * 0.75;
    trees.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      scale,
      rotY: rnd() * Math.PI,
    });
  }

  // 3. Distant low-contrast urban silhouettes / secondary massing (well beyond repository extent)
  const silhouetteCount = 38;
  for (let i = 0; i < silhouetteCount; i++) {
    const angle = (i / silhouetteCount) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const dist = midR + 12 + rnd() * (outerR - midR);
    const w = 8 + rnd() * 18;
    const d = 8 + rnd() * 18;
    // Lower than core city tallest buildings, dissolving softly into fog
    const h = 4 + rnd() * 12;
    silhouettes.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      w,
      d,
      h,
    });
  }

  return { plazas, trees, silhouettes };
}

export function OuterEnvironment({ radius = 30, timeOfDay = "day" }) {
  const night = timeOfDay === "night";
  const { plazas, trees, silhouettes } = useMemo(() => makeOuterElements(radius), [radius]);

  const plazaRef = useRef();
  const treeRef = useRef();
  const silhouetteRef = useRef();

  const plazaGeo = useMemo(() => new THREE.BoxGeometry(1, 0.02, 1), []);
  const treeGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.7, 1.8, 5);
    g.translate(0, 0.9, 0);
    return g;
  }, []);
  const silhouetteGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);

  useEffect(() => {
    if (plazaRef.current) {
      const mesh = plazaRef.current;
      plazas.forEach((p, i) => {
        dummy.position.set(p.x, 0.012, p.z);
        dummy.scale.set(p.w, 1, p.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Muted stone or quiet park green
        const col = p.park
          ? (night ? "#19241f" : "#68766c")
          : (night ? "#212836" : "#7d8692");
        mesh.setColorAt(i, new THREE.Color(col));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
    }

    if (treeRef.current) {
      const mesh = treeRef.current;
      trees.forEach((t, i) => {
        dummy.position.set(t.x, 0.02, t.z);
        dummy.scale.set(t.scale, t.scale, t.scale);
        dummy.rotation.set(0, t.rotY, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const col = night ? "#151e18" : "#4e594b";
        mesh.setColorAt(i, new THREE.Color(col));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
    }

    if (silhouetteRef.current) {
      const mesh = silhouetteRef.current;
      silhouettes.forEach((s, i) => {
        dummy.position.set(s.x, 0, s.z);
        dummy.scale.set(s.w, s.h, s.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Low-contrast silhouette tone matching fog depth
        const col = night ? "#121822" : "#8a96a4";
        mesh.setColorAt(i, new THREE.Color(col));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
    }
  }, [plazas, trees, silhouettes, night]);

  return (
    <group name="OuterEnvironment">
      {/* 1. Secondary Plazas & Transitional Green Pockets */}
      {plazas.length > 0 && (
        <instancedMesh
          key="outer-plazas"
          ref={plazaRef}
          args={[plazaGeo, undefined, plazas.length]}
          receiveShadow
        >
          <meshStandardMaterial roughness={0.96} color="#ffffff" />
        </instancedMesh>
      )}

      {/* 2. Sparse Muted Foliage Buffer */}
      {trees.length > 0 && (
        <instancedMesh
          key="outer-trees"
          ref={treeRef}
          args={[treeGeo, undefined, trees.length]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial roughness={0.92} color="#ffffff" />
        </instancedMesh>
      )}

      {/* 3. Distant Urban Silhouettes (Non-interactive, excluded from raycasting/data) */}
      {silhouettes.length > 0 && (
        <instancedMesh
          key="outer-silhouettes"
          ref={silhouetteRef}
          args={[silhouetteGeo, undefined, silhouettes.length]}
          receiveShadow
          raycast={() => null} // Completely non-interactive
        >
          <meshStandardMaterial
            roughness={0.90}
            metalness={0.04}
            color="#ffffff"
          />
        </instancedMesh>
      )}
    </group>
  );
}
