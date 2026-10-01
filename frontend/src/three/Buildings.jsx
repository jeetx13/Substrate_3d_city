import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { anim } from "@/lib/anim";
import { useStore } from "@/store";

const dummy = new THREE.Object3D();
const HOVER = new THREE.Color("#f6f1e6");
const tmp = new THREE.Color();

// One shared, static "kit of parts" building block: a straight body, a
// tapered (chamfered) band, and a thin inset roofline cap slab. Built from
// primitives so every tier instance still shares a single draw call — the
// bevel lives in the geometry, not per instance. Total height spans 0..1 and
// max footprint spans -0.5..0.5, matching the plain BoxGeometry it replaces,
// so the existing per-tier scale/position logic in useFrame needs no changes.
function makeBuildingGeometry() {
  const mainH = 0.76;
  const taperH = 0.16;
  const capH = 0.08;
  const baseW = 1;
  const taperTopW = 0.88;
  const capW = 0.62;

  const main = new THREE.BoxGeometry(baseW, mainH, baseW);
  main.translate(0, mainH / 2, 0);

  // A 4-sided cylinder is a square frustum: tapering the top width in gives
  // a chamfered-edge read instead of a hard box corner.
  const taper = new THREE.CylinderGeometry(
    (taperTopW * Math.SQRT2) / 2,
    (baseW * Math.SQRT2) / 2,
    taperH,
    4,
    1,
    false
  );
  taper.rotateY(Math.PI / 4);
  taper.translate(0, mainH + taperH / 2, 0);

  const cap = new THREE.BoxGeometry(capW, capH, capW);
  cap.translate(0, mainH + taperH + capH / 2, 0);

  const geo = mergeGeometries(
    [main.toNonIndexed(), taper.toNonIndexed(), cap.toNonIndexed()],
    false
  );
  geo.computeVertexNormals();
  return geo;
}

// Bakes a small tileable facade pattern (coursed bands + a window grid) once
// into a height map, then derives a normal map and a roughness map from it.
// Shared across every instance via texture.repeat — cheap, and keeps each
// tier to one draw call — with per-instance vertex/instance color still
// doing the actual churn/language tinting on top.
// Bakes a high-fidelity architectural facade pattern (coursed masonry bands + window grid)
// with deterministic lit/unlit office variations and warm/cool lighting.
function makeFacadeMaps() {
  const size = 1024;
  const facadeCanvas = document.createElement("canvas");
  facadeCanvas.width = size;
  facadeCanvas.height = size;
  const facadeCtx = facadeCanvas.getContext("2d");

  const emissiveCanvas = document.createElement("canvas");
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const emissiveCtx = emissiveCanvas.getContext("2d");
  emissiveCtx.fillStyle = "#000000";
  emissiveCtx.fillRect(0, 0, size, size);

  const hCanvas = document.createElement("canvas");
  hCanvas.width = size;
  hCanvas.height = size;
  const hctx = hCanvas.getContext("2d");
  hctx.fillStyle = "#969696";
  hctx.fillRect(0, 0, size, size);

  // 4 architectural facade quadrant variations in one 1024x1024 atlas:
  // Q0 (top-left): Modern Glass Curtain Wall with slender mullions & high reflectivity
  // Q1 (top-right): Classic Structured Masonry with coursed stone spandrels & punched windows
  // Q2 (bottom-left): Vertical Pier & Fluted Architectural Panels
  // Q3 (bottom-right): Industrial Ribbon Window & Spandrel Panels
  const quads = [
    { x0: 0, y0: 0, w: size / 2, h: size / 2, type: "curtain_glass", cols: 10, rows: 14, marginX: 0.14, marginY: 0.18 },
    { x0: size / 2, y0: 0, w: size / 2, h: size / 2, type: "stone_masonry", cols: 8, rows: 12, marginX: 0.22, marginY: 0.26 },
    { x0: 0, y0: size / 2, w: size / 2, h: size / 2, type: "vertical_pier", cols: 8, rows: 14, marginX: 0.18, marginY: 0.22 },
    { x0: size / 2, y0: size / 2, w: size / 2, h: size / 2, type: "ribbon_panel", cols: 12, rows: 10, marginX: 0.10, marginY: 0.32 },
  ];

  quads.forEach((q, qIndex) => {
    const { x0, y0, w, h, cols, rows, marginX, marginY } = q;
    const cw = w / cols;
    const rh = h / rows;

    // Base architectural wall tone (neutral stone/panel foundation)
    facadeCtx.fillStyle = qIndex === 0 ? "#b8bdc4" : qIndex === 1 ? "#a4a8ad" : qIndex === 2 ? "#b0b4b8" : "#989da3";
    facadeCtx.fillRect(x0, y0, w, h);

    // Spandrel / horizontal panel division courses
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * rh;
      facadeCtx.strokeStyle = "rgba(30, 34, 42, 0.14)";
      facadeCtx.lineWidth = 1;
      facadeCtx.beginPath();
      facadeCtx.moveTo(x0, y);
      facadeCtx.lineTo(x0 + w, y);
      facadeCtx.stroke();
    }

    // Vertical piers for Q2
    if (q.type === "vertical_pier") {
      for (let c = 0; c <= cols; c++) {
        const x = x0 + c * cw;
        facadeCtx.fillStyle = "rgba(240, 244, 250, 0.18)";
        facadeCtx.fillRect(x - 2, y0, 4, h);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * cw + cw * marginX;
        const y = y0 + r * rh + rh * marginY;
        const windowW = cw * (1 - marginX * 2);
        const windowH = rh * (1 - marginY * 2);

        // Depth recess in height map
        hctx.fillStyle = "#555555";
        hctx.fillRect(x, y, windowW, windowH);

        // Window frame
        facadeCtx.fillStyle = "#656a72";
        facadeCtx.fillRect(x - 1, y - 1, windowW + 2, windowH + 2);

        // Day glass: deep architectural dark reflection (non-emissive)
        const glassGrad = facadeCtx.createLinearGradient(x, y, x, y + windowH);
        glassGrad.addColorStop(0, "#4a5563");
        glassGrad.addColorStop(0.35, "#2d3540");
        glassGrad.addColorStop(1, "#181e25");
        facadeCtx.fillStyle = glassGrad;
        facadeCtx.fillRect(x, y, windowW, windowH);

        // Subtle specular highlight on glass mullion
        facadeCtx.fillStyle = "rgba(220, 232, 245, 0.24)";
        facadeCtx.fillRect(x + windowW * 0.12, y + 1, Math.max(1, windowW * 0.10), windowH - 2);

        // Deterministic pseudo-random seed per window and floor
        const winSeed = Math.sin((r + qIndex * 37) * 12.9898 + (c + qIndex * 19) * 78.233 + 19.3) * 43758.5453;
        const p = winSeed - Math.floor(winSeed);
        const floorSeed = Math.sin((r + qIndex * 23) * 31.415) * 1000;
        const floorActive = (floorSeed - Math.floor(floorSeed)) > 0.18; // Occasional dark floors

        // Night emissive (P4: 25-32% of windows lit, ~70% unlit)
        if (floorActive && p < 0.28) {
          let lightColor;
          if (p < 0.09) {
            // Warm tungsten / amber office
            lightColor = "#f5be75";
          } else if (p < 0.18) {
            // Neutral warm amber
            lightColor = "#f0be72";
          } else if (p < 0.24) {
            // Crisp neutral white office
            lightColor = "#edf4fc";
          } else {
            // Pale fluorescent blue-white
            lightColor = "#d6e4f8";
          }
          emissiveCtx.fillStyle = lightColor;
          emissiveCtx.fillRect(x + 1.2, y + 1.2, Math.max(1, windowW - 2.4), Math.max(1, windowH - 2.4));
        }
      }
    }
  });

  // Micro-noise for realistic stone/panel surface
  let seed = 107;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const img = hctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 8;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  hctx.putImageData(img, 0, 0);

  const heightData = hctx.getImageData(0, 0, size, size).data;
  const heightAt = (x, y) => {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    return heightData[(yi * size + xi) * 4] / 255;
  };

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nctx = normalCanvas.getContext("2d");
  const nImg = nctx.createImageData(size, size);
  const strength = 2.0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength;
      const dy = (heightAt(x, y - 1) - heightAt(x, y + 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const idx = (y * size + x) * 4;
      nImg.data[idx] = ((dx / len) * 0.5 + 0.5) * 255;
      nImg.data[idx + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nImg.data[idx + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nImg.data[idx + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d");
  const rImg = rctx.createImageData(size, size);
  for (let i = 0; i < heightData.length; i += 4) {
    const hv = heightData[i] / 255;
    const rough = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(hv, 0.35, 0.75, 0.35, 0.88), 0.25, 0.92);
    const g = Math.round(rough * 255);
    rImg.data[i] = g;
    rImg.data[i + 1] = g;
    rImg.data[i + 2] = g;
    rImg.data[i + 3] = 255;
  }
  rctx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(facadeCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 2);

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.copy(map.repeat);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.copy(map.repeat);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, emissiveMap, normalMap, roughnessMap };
}

// Soft dark radial decal used as a cheap contact-shadow/AO cue at each
// building's base so footprints read as grounded rather than floating.
function makeAOTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(28,24,18,0.5)");
  g.addColorStop(0.55, "rgba(28,24,18,0.24)");
  g.addColorStop(1, "rgba(28,24,18,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Buildings({ city, interactive, timeOfDay = "day" }) {
  const refs = [useRef(), useRef(), useRef()];
  const aoRef = useRef();
  const n = city.buildings.length;
  const set = useStore((s) => s.set);
  const hoverState = useRef({ prev: -1 });

  const geo = useMemo(() => makeBuildingGeometry(), []);
  const { map, emissiveMap, normalMap, roughnessMap } = useMemo(() => makeFacadeMaps(), []);
  const aoTex = useMemo(() => makeAOTexture(), []);
  const aoGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  useEffect(() => {
    refs.forEach((r, k) => {
      const mesh = r.current;
      if (!mesh) return;
      city.buildings.forEach((b, i) => {
        tmp.copy(b.color);
        const toneShift = 0.96 + (b.seed || 0.5) * 0.08;
        tmp.multiplyScalar(toneShift);
        // Tier 2 roof cap: subtle darker mechanical penthouse/roof tone
        if (k === 2) tmp.multiplyScalar(0.86);
        else if (k === 1) tmp.multiplyScalar(0.98);
        mesh.setColorAt(i, tmp);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
    });
    hoverState.current.prev = -1;
    anim.force = true;

    const ao = aoRef.current;
    if (ao) {
      city.buildings.forEach((b, i) => {
        const r = b.size * 1.15;
        dummy.position.set(b.x, 0.012, b.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(r, 1, r);
        dummy.updateMatrix();
        ao.setMatrixAt(i, dummy.matrix);
      });
      ao.instanceMatrix.needsUpdate = true;
      ao.frustumCulled = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  useFrame((state, dt) => {
    const { rise, timeCur, timeTarget } = anim;
    if (rise.length !== n) return;
    const meshes = refs.map((r) => r.current);
    if (meshes.some((m) => !m)) return;
    const t = state.clock.elapsedTime;
    const damp = 1 - Math.exp(-dt * 3.2);
    const base = meshes[0];
    const hovered = interactive ? anim.hovered : -1;
    const hs = hoverState.current;
    if (hs.prev !== hovered) {
      if (hs.prev >= 0 && hs.prev < n) base.setColorAt(hs.prev, city.buildings[hs.prev].color);
      if (hovered >= 0) { tmp.copy(city.buildings[hovered].color).lerp(HOVER, 0.55); base.setColorAt(hovered, tmp); }
      base.instanceColor.needsUpdate = true;
      hs.prev = hovered;
    }
    let pulse = false;
    let moved = hs.prev !== hovered || anim.force;
    const last = anim.lastS;
    for (let i = 0; i < n; i++) {
      timeCur[i] += (timeTarget[i] - timeCur[i]) * damp;
      const b = city.buildings[i];
      let s = rise[i] * timeCur[i];
      if (Math.abs(s - last[i]) > 0.0004) { moved = true; last[i] = s; }
      if (city.isAmbient && b.file.churn_score > 0.7) {
        const p = 0.5 + 0.5 * Math.sin(t * 0.7 + b.seed * 12);
        tmp.copy(b.color).lerp(HOVER, p * 0.18);
        base.setColorAt(i, tmp);
        pulse = true;
      }
    }
    if (pulse) base.instanceColor.needsUpdate = true;
    anim.moving = moved;
    if (!moved) return;
    anim.force = false;
    for (let i = 0; i < n; i++) {
      const b = city.buildings[i];
      const s = last[i];
      const tiny = s < 0.002;
      for (let k = 0; k < 3; k++) {
        const tier = b.tiers[k];
        if (!tier || tiny) {
          dummy.position.set(b.x, -1, b.z);
          dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          const ease = k === 0 ? s : Math.max(0, (s - 0.35 * k * 0.5) / (1 - 0.35 * k * 0.5));
          dummy.position.set(b.x + tier.ox, tier.y0 * b.h * s, b.z + tier.oz);
          dummy.scale.set(tier.w, Math.max(0.001, tier.hf * b.h * s * (0.6 + 0.4 * ease)), tier.d);
        }
        dummy.updateMatrix();
        meshes[k].setMatrixAt(i, dummy.matrix);
      }
    }
    meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  });

  const onMove = (e) => {
    if (!interactive) return;
    e.stopPropagation();
    const id = e.instanceId;
    if (id !== undefined && id !== anim.hovered) {
      anim.hovered = id;
      set({ hovered: id });
      document.body.style.cursor = "pointer";
    }
  };
  const onOut = () => {
    if (!interactive) return;
    anim.hovered = -1;
    set({ hovered: -1 });
    document.body.style.cursor = "";
  };
  const onClick = (e) => {
    if (!interactive) return;
    e.stopPropagation();
    if (e.instanceId !== undefined) set({ selected: e.instanceId });
  };

  return (
    <group>
      <instancedMesh
        key={`${city.isAmbient ? "a" : city.meta.slug}-${n}-ao`}
        ref={aoRef}
        args={[aoGeo, undefined, n]}
        renderOrder={-1}
      >
        <meshBasicMaterial
          map={aoTex}
          transparent
          depthWrite={false}
          blending={THREE.MultiplyBlending}
          toneMapped={false}
        />
      </instancedMesh>
      {refs.map((r, k) => (
        <instancedMesh
          key={`${city.isAmbient ? "a" : city.meta.slug || "ambient"}-${n}-${k}`}
          ref={r}
          args={[geo, undefined, n]}
          castShadow
          receiveShadow
          onPointerMove={onMove}
          onPointerOut={onOut}
          onClick={onClick}
        >
          <meshStandardMaterial
            roughness={0.84}
            metalness={0.08}
            color="#ffffff"
            map={map}
            emissive={timeOfDay === "night" ? "#ffffff" : "#000000"}
            emissiveMap={emissiveMap}
            emissiveIntensity={timeOfDay === "night" ? 0.52 : 0}
            normalMap={normalMap}
            normalScale={[0.55, 0.55]}
            roughnessMap={roughnessMap}
          />
        </instancedMesh>
      ))}
    </group>
  );
}
