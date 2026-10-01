import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const dummy = new THREE.Object3D();

// Cool neutral concrete / stone environment palette - Day (P2: NOT beige, NOT cream, NOT sand)
const blockTones = ["#858d98", "#8b939e", "#808893", "#89919c"];
const sidewalkTones = ["#9ba3ae", "#a3abb7", "#969ea9", "#a0a8b3"];
const parcelTones = ["#7a828d", "#828a95", "#757d88", "#7e8691"];

// Cool deep slate environment palette - Night (P2: readable slate, not pure black)
const nightBlockTones = ["#232b3a", "#273041", "#1f2736", "#252e3e"];
const nightSidewalkTones = ["#333c4f", "#384256", "#2f384a", "#3b455b"];
const nightParcelTones = ["#1c2330", "#202837", "#19202c", "#1e2634"];

const sidewalkMargin = 0.38;
const curbWidth = 0.14;

function makeGroundTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Cool neutral gray concrete base (Day)
  ctx.fillStyle = "#6f7680";
  ctx.fillRect(0, 0, size, size);
  let seed = 41;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.95));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.98));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 1.05)); // Cool leaning tint
  }
  ctx.putImageData(img, 0, 0);

  // Subtle architectural expansion joints on an urban rhythm
  ctx.strokeStyle = "rgba(35, 40, 48, 0.12)";
  ctx.lineWidth = 2;
  for (let p = 0; p <= size; p += 128) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function environmentInstances(city) {
  if (!city?.buildings?.length) return { blocks: [], sidewalks: [], parcels: [] };
  const { blockCells, gridPitch } = city;
  const groups = new Map();
  city.buildings.forEach((building) => {
    const row = Math.floor(building.gridRow / blockCells);
    const col = Math.floor(building.gridCol / blockCells);
    const key = `${row}:${col}`;
    if (!groups.has(key)) groups.set(key, { row, col, buildings: [] });
    groups.get(key).buildings.push(building);
  });

  const blocks = [...groups.values()].map((group, i) => {
    const xs = group.buildings.map((b) => b.x);
    const zs = group.buildings.map((b) => b.z);
    let minX = Math.min(...xs) - gridPitch * 0.5;
    let maxX = Math.max(...xs) + gridPitch * 0.5;
    let minZ = Math.min(...zs) - gridPitch * 0.5;
    let maxZ = Math.max(...zs) + gridPitch * 0.5;
    const west = city.streets.find((s) => s.axis === "z" && s.boundary === group.col * blockCells);
    const east = city.streets.find((s) => s.axis === "z" && s.boundary === (group.col + 1) * blockCells);
    const north = city.streets.find((s) => s.axis === "x" && s.boundary === group.row * blockCells);
    const south = city.streets.find((s) => s.axis === "x" && s.boundary === (group.row + 1) * blockCells);
    if (west) minX = west.x + (west.renderWidth + curbWidth) * 0.5;
    if (east) maxX = east.x - (east.renderWidth + curbWidth) * 0.5;
    if (north) minZ = north.z + (north.renderWidth + curbWidth) * 0.5;
    if (south) maxZ = south.z - (south.renderWidth + curbWidth) * 0.5;
    return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5, w: Math.max(0.5, maxX - minX), d: Math.max(0.5, maxZ - minZ), tone: i % blockTones.length };
  });

  const sidewalks = city.buildings.map((building, i) => {
    const frontage = building.tiers.filter(Boolean).reduce((max, tier) => Math.max(max,
      tier.w + Math.abs(tier.ox) * 2,
      tier.d + Math.abs(tier.oz) * 2), building.size);
    const extent = Math.min(gridPitch - 0.12, frontage + sidewalkMargin * 2);
    return { x: building.x, z: building.z, extent, tone: i % sidewalkTones.length };
  });

  // Parcel / lot pad directly anchored beneath each building footprint
  const parcels = city.buildings.map((building, i) => {
    const w = building.size * 1.10;
    return { x: building.x, z: building.z, w, d: w, tone: i % parcelTones.length };
  });

  return { blocks, sidewalks, parcels };
}

export function Ground({ radius, city, timeOfDay = "day" }) {
  const tex = useMemo(makeGroundTexture, []);
  const blockRef = useRef();
  const sidewalkRef = useRef();
  const parcelRef = useRef();
  const instances = useMemo(() => environmentInstances(city), [city]);
  const blockGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.035, 1), []);
  const sidewalkGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.026, 1), []);
  const parcelGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.018, 1), []);
  const night = timeOfDay === "night";

  useEffect(() => {
    const blocks = blockRef.current;
    if (blocks) {
      instances.blocks.forEach((block, i) => {
        dummy.position.set(block.x, 0.015, block.z);
        dummy.scale.set(block.w, 1, block.d);
        dummy.updateMatrix();
        blocks.setMatrixAt(i, dummy.matrix);
        blocks.setColorAt(i, new THREE.Color((night ? nightBlockTones : blockTones)[block.tone]));
      });
      blocks.instanceMatrix.needsUpdate = true;
      if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
      blocks.frustumCulled = false;
    }

    const sidewalks = sidewalkRef.current;
    if (sidewalks) {
      instances.sidewalks.forEach((sidewalk, i) => {
        dummy.position.set(sidewalk.x, 0.024, sidewalk.z);
        dummy.scale.set(sidewalk.extent, 1, sidewalk.extent);
        dummy.updateMatrix();
        sidewalks.setMatrixAt(i, dummy.matrix);
        sidewalks.setColorAt(i, new THREE.Color((night ? nightSidewalkTones : sidewalkTones)[sidewalk.tone]));
      });
      sidewalks.instanceMatrix.needsUpdate = true;
      if (sidewalks.instanceColor) sidewalks.instanceColor.needsUpdate = true;
      sidewalks.frustumCulled = false;
    }

    const parcels = parcelRef.current;
    if (parcels) {
      instances.parcels.forEach((parcel, i) => {
        dummy.position.set(parcel.x, 0.028, parcel.z);
        dummy.scale.set(parcel.w, 1, parcel.d);
        dummy.updateMatrix();
        parcels.setMatrixAt(i, dummy.matrix);
        parcels.setColorAt(i, new THREE.Color((night ? nightParcelTones : parcelTones)[parcel.tone]));
      });
      parcels.instanceMatrix.needsUpdate = true;
      if (parcels.instanceColor) parcels.instanceColor.needsUpdate = true;
      parcels.frustumCulled = false;
    }
  }, [instances, night]);

  return (
    <group>
      {/* Extended ground plane that dissolves seamlessly into horizon fog */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[3800, 3800]} />
        <meshStandardMaterial
          map={tex}
          roughness={0.96}
          metalness={0.02}
          color={night ? "#323c4e" : "#f2f5f8"}
        />
      </mesh>
      {instances.blocks.length > 0 && (
        <instancedMesh key={`${city.meta.slug || "ambient"}-blocks-${instances.blocks.length}`} ref={blockRef} args={[blockGeometry, undefined, instances.blocks.length]} receiveShadow>
          <meshStandardMaterial roughness={0.94} color="#ffffff" />
        </instancedMesh>
      )}
      {instances.sidewalks.length > 0 && (
        <instancedMesh key={`${city.meta.slug || "ambient"}-sidewalks-${instances.sidewalks.length}`} ref={sidewalkRef} args={[sidewalkGeometry, undefined, instances.sidewalks.length]} receiveShadow>
          <meshStandardMaterial roughness={0.90} color="#ffffff" />
        </instancedMesh>
      )}
      {instances.parcels.length > 0 && (
        <instancedMesh key={`${city.meta.slug || "ambient"}-parcels-${instances.parcels.length}`} ref={parcelRef} args={[parcelGeometry, undefined, instances.parcels.length]} receiveShadow>
          <meshStandardMaterial roughness={0.88} color="#ffffff" />
        </instancedMesh>
      )}
    </group>
  );
}
