import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const dummy = new THREE.Object3D();
const blockTones = ["#817d73", "#878379", "#7b776e", "#8a857a"];
const sidewalkTones = ["#a7a193", "#ada797", "#a19b8e", "#b1aa9b"];
const sidewalkMargin = 0.34;
const curbWidth = 0.12;

function makeGroundTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#89857b";
  ctx.fillRect(0, 0, size, size);
  let seed = 41;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 12;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.96));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9));
  }
  ctx.putImageData(img, 0, 0);

  // Light expansion joints on a block-sized rhythm keep the open city edge from reading as a blank plane.
  ctx.strokeStyle = "rgba(48, 43, 35, 0.14)";
  ctx.lineWidth = 2;
  for (let p = 0; p <= size; p += 128) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function environmentInstances(city) {
  if (!city?.buildings?.length) return { blocks: [], sidewalks: [] };
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
    return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5, w: maxX - minX, d: maxZ - minZ, tone: i % blockTones.length };
  });
  const sidewalks = city.buildings.map((building, i) => {
    const frontage = building.tiers.filter(Boolean).reduce((max, tier) => Math.max(max,
      tier.w + Math.abs(tier.ox) * 2,
      tier.d + Math.abs(tier.oz) * 2), building.size);
    const extent = Math.min(gridPitch - 0.12, frontage + sidewalkMargin * 2);
    return { x: building.x, z: building.z, extent, tone: i % sidewalkTones.length };
  });
  return { blocks, sidewalks };
}

export function Ground({ radius, city }) {
  const tex = useMemo(makeGroundTexture, []);
  const blockRef = useRef();
  const sidewalkRef = useRef();
  const instances = useMemo(() => environmentInstances(city), [city]);
  const blockGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.04, 1), []);
  const sidewalkGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.03, 1), []);

  useEffect(() => {
    const blocks = blockRef.current;
    if (blocks) {
      instances.blocks.forEach((block, i) => {
        dummy.position.set(block.x, -0.005, block.z);
        dummy.scale.set(block.w, 1, block.d);
        dummy.updateMatrix();
        blocks.setMatrixAt(i, dummy.matrix);
        blocks.setColorAt(i, new THREE.Color(blockTones[block.tone]));
      });
      blocks.instanceMatrix.needsUpdate = true;
      if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
      blocks.frustumCulled = false;
    }
    const sidewalks = sidewalkRef.current;
    if (sidewalks) {
      instances.sidewalks.forEach((sidewalk, i) => {
        dummy.position.set(sidewalk.x, 0.02, sidewalk.z);
        dummy.scale.set(sidewalk.extent, 1, sidewalk.extent);
        dummy.updateMatrix();
        sidewalks.setMatrixAt(i, dummy.matrix);
        sidewalks.setColorAt(i, new THREE.Color(sidewalkTones[sidewalk.tone]));
      });
      sidewalks.instanceMatrix.needsUpdate = true;
      if (sidewalks.instanceColor) sidewalks.instanceColor.needsUpdate = true;
      sidewalks.frustumCulled = false;
    }
  }, [instances]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[2400, 2400]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} color="#ffffff" />
      </mesh>
      {instances.blocks.length > 0 && (
        <instancedMesh key={`${city.meta.slug}-blocks-${instances.blocks.length}`} ref={blockRef} args={[blockGeometry, undefined, instances.blocks.length]} receiveShadow>
          <meshStandardMaterial roughness={0.98} color="#ffffff" />
        </instancedMesh>
      )}
      {instances.sidewalks.length > 0 && (
        <instancedMesh key={`${city.meta.slug}-sidewalks-${instances.sidewalks.length}`} ref={sidewalkRef} args={[sidewalkGeometry, undefined, instances.sidewalks.length]} receiveShadow>
          <meshStandardMaterial roughness={0.92} color="#ffffff" />
        </instancedMesh>
      )}
    </group>
  );
}
