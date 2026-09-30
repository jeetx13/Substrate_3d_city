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
function makeFacadeMaps() {
  const size = 256;
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

  const courses = 16;
  const courseH = size / courses;
  for (let row = 0; row < courses; row++) {
    hctx.fillStyle = row % 2 === 0 ? "#a5a5a5" : "#8c8c8c";
    hctx.fillRect(0, row * courseH, size, courseH - 1);
  }

  const cols = 6;
  const rows = 8;
  const cw = size / cols;
  const rh = size / rows;
  const margin = 0.22;
  facadeCtx.fillStyle = "#b7b4aa";
  facadeCtx.fillRect(0, 0, size, size);
  facadeCtx.fillStyle = "#eeeae0";
  facadeCtx.fillRect(2, 2, size - 4, size - 4);
  facadeCtx.strokeStyle = "rgba(52, 50, 44, 0.1)";
  facadeCtx.lineWidth = 1;
  for (let row = 1; row < rows; row++) {
    const y = row * rh;
    facadeCtx.beginPath();
    facadeCtx.moveTo(0, y);
    facadeCtx.lineTo(size, y);
    facadeCtx.stroke();
  }

  hctx.fillStyle = "#6c6c6c";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * margin;
      const y = r * rh + rh * margin;
      hctx.fillRect(x, y, cw * (1 - margin * 2), rh * (1 - margin * 2));

      const windowW = cw * (1 - margin * 2);
      const windowH = rh * (1 - margin * 2);
      facadeCtx.fillStyle = "#a4a49c";
      facadeCtx.fillRect(x - 1, y - 1, windowW + 2, windowH + 2);
      facadeCtx.fillStyle = "#647078";
      facadeCtx.fillRect(x, y, windowW, windowH);
      facadeCtx.fillStyle = "rgba(213, 220, 218, 0.34)";
      facadeCtx.fillRect(x + windowW * 0.12, y + 1, Math.max(1, windowW * 0.12), windowH - 2);
      facadeCtx.fillStyle = "rgba(27, 35, 40, 0.35)";
      facadeCtx.fillRect(x, y + windowH * 0.58, windowW, Math.max(1, windowH * 0.12));

      emissiveCtx.fillStyle = "#000000";
      emissiveCtx.fillRect(x, y, windowW, windowH);
      emissiveCtx.fillStyle = (r + c) % 4 === 0 ? "#f1c77e" : "#c78b4f";
      emissiveCtx.fillRect(x + 2, y + 2, Math.max(1, windowW - 4), Math.max(1, windowH - 4));
    }
  }

  let seed = 99;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const img = hctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
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
  const strength = 2.2;
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
    const rough = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(hv, 0.35, 0.75, 0.4, 0.92), 0.3, 0.95);
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
      const lighten = k * 0.045;
      city.buildings.forEach((b, i) => {
        tmp.copy(b.color);
        if (lighten) tmp.lerp(HOVER, lighten);
        mesh.setColorAt(i, tmp);
      });
      mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
    });
    hoverState.current.prev = -1;
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
          key={`${city.isAmbient ? "a" : city.meta.slug}-${n}-${k}`}
          ref={r}
          args={[geo, undefined, n]}
          castShadow
          receiveShadow
          onPointerMove={onMove}
          onPointerOut={onOut}
          onClick={onClick}
        >
          <meshStandardMaterial
            roughness={1}
            metalness={0.02}
            color="#ffffff"
            map={map}
            emissive={timeOfDay === "night" ? "#ffd091" : "#000000"}
            emissiveMap={emissiveMap}
            emissiveIntensity={timeOfDay === "night" ? 1.15 : 0}
            normalMap={normalMap}
            normalScale={[0.55, 0.55]}
            roughnessMap={roughnessMap}
          />
        </instancedMesh>
      ))}
    </group>
  );
}
