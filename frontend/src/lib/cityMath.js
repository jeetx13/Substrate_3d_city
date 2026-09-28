import * as THREE from "three";

export const LOC_CAP = 2000;

export function footprintSize(loc) {
  return 1.0 + 2.2 * Math.sqrt(Math.min(loc, LOC_CAP) / LOC_CAP);
}

export function heightFor(loc, maxLoc) {
  const r = Math.min(1, Math.max(0, loc / Math.max(maxLoc, 1)));
  return 1.4 + 12 * Math.pow(r, 0.75);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const C_BONE = new THREE.Color("#e6dfcf");
const C_STONE = new THREE.Color("#c7b99f");
const C_EARTH = new THREE.Color("#b5714b");
const C_SAGE = new THREE.Color("#a8ae97");

export function churnColor(churn, seed) {
  const c = new THREE.Color();
  if (churn < 0.5) c.lerpColors(C_BONE, C_STONE, churn / 0.5);
  else c.lerpColors(C_STONE, C_EARTH, (churn - 0.5) / 0.5);
  if (churn < 0.18) c.lerp(C_SAGE, (0.18 - churn) * 1.6 * seed);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h + (seed - 0.5) * 0.02, hsl.s, hsl.l + (seed - 0.5) * 0.05);
  return c;
}

export function clusterKey(path) {
  const parts = path.split("/");
  if (parts.length <= 1) return ".";
  if (parts.length >= 4) return parts.slice(0, 2).join("/");
  return parts[0];
}

// Roof silhouette varies by `seed` (not language) so buildings of the same
// language don't all read identically at city scale: roughly a third flat,
// a third stepped-setback, a third topped with a single offset tower.
function roofVariant(seed, s, topY) {
  const bucket = seed * 3;
  if (bucket < 1) return null; // flat roof
  if (bucket < 2) {
    // stepped setback: a broad, short shelf inset from the tier below
    return { ox: 0, oz: 0, w: s * 0.58, d: s * 0.56, y0: topY, hf: 0.16 };
  }
  // single offset tower: slim, taller volume pushed toward one corner
  const cx = seed > 0.83 ? 1 : -1;
  const cz = seed > 0.75 ? -1 : 1;
  return { ox: cx * s * 0.26, oz: cz * s * 0.22, w: s * 0.24, d: s * 0.22, y0: topY, hf: 0.4 };
}

function tiersFor(language, size, seed) {
  const s = size;
  let base;
  if (language === "python") {
    base = [
      { ox: 0, oz: 0, w: s * 0.9, d: s * 0.9, y0: 0, hf: 0.58 },
      { ox: (seed - 0.5) * s * 0.15, oz: 0, w: s * 0.7, d: s * 0.72, y0: 0.58, hf: 0.3 },
    ];
  } else if (language === "typescript") {
    const side = seed > 0.5 ? 1 : -1;
    base = [
      { ox: 0, oz: 0, w: s * 1.02, d: s * 0.82, y0: 0, hf: 0.62 },
      { ox: side * s * 0.2, oz: 0, w: s * 0.62, d: s * 0.82, y0: 0.62, hf: 0.38 },
    ];
  } else if (language === "javascript") {
    base = [
      { ox: 0, oz: 0, w: s * 1.15, d: s * 0.9, y0: 0, hf: 0.72 },
      { ox: 0, oz: 0, w: s * 1.24, d: s * 0.98, y0: 0.72, hf: 0.06 },
    ];
  } else {
    base = [
      { ox: 0, oz: 0, w: s, d: s * 1.1, y0: 0, hf: 0.9 },
      { ox: 0, oz: 0, w: s * 1.08, d: s * 1.18, y0: 0.9, hf: 0.1 },
    ];
  }
  const topY = base[1].y0 + base[1].hf;
  base.push(roofVariant(seed, s, topY));
  return base;
}

export function buildCity(payload, isAmbient = false) {
  const { files, edges, snapshots = [], meta = {} } = payload;
  const maxLoc = files.reduce((m, f) => Math.max(m, f.loc), 1);
  const index = new Map();
  let radius = 10;
  const buildings = files.map((f, i) => {
    index.set(f.file_id, i);
    const seed = hash(f.path);
    const size = footprintSize(f.loc);
    const h = heightFor(f.loc, maxLoc);
    radius = Math.max(radius, Math.hypot(f.layout_x, f.layout_y) + size);
    return {
      i, file: f, x: f.layout_x, z: f.layout_y, h, size, seed,
      tiers: tiersFor(f.language, size, seed),
      color: churnColor(f.churn_score, seed),
      cluster: clusterKey(f.path),
    };
  });
  const roads = edges
    .filter((e) => index.has(e.source_file_id) && index.has(e.target_file_id))
    .map((e) => ({ src: index.get(e.source_file_id), tgt: index.get(e.target_file_id), weight: e.weight, low: e.confidence === "low" }));

  const snapTargets = snapshots.map((snap) => {
    const arr = new Float32Array(buildings.length);
    const map = new Map(snap.file_states.map((s) => [s.file_id, s]));
    buildings.forEach((b, i) => {
      const st = map.get(b.file.file_id);
      arr[i] = st && st.exists ? Math.max(0.04, heightFor(st.loc, maxLoc) / b.h) : 0;
    });
    return arr;
  });

  const clusters = new Map();
  buildings.forEach((b) => {
    if (!clusters.has(b.cluster)) clusters.set(b.cluster, { idx: [], cx: 0, cy: 0, cz: 0, name: b.cluster });
    const c = clusters.get(b.cluster);
    c.idx.push(b.i); c.cx += b.x; c.cy += b.h; c.cz += b.z;
  });
  const districts = [...clusters.values()]
    .map((c) => ({
      name: c.name === "." ? "root" : c.name.split("/").filter(Boolean).at(-1),
      x: c.cx / c.idx.length,
      y: c.cy / c.idx.length + 3.5,
      z: c.cz / c.idx.length,
      count: c.idx.length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);
  const groups = [...clusters.values()].map((c) => ({ idx: c.idx, dist: Math.hypot(c.cx / c.idx.length, c.cz / c.idx.length) }));
  groups.sort((a, b) => a.dist - b.dist);

  return { buildings, roads, snapshots, snapTargets, groups, districts, meta, radius, isAmbient, maxLoc };
}
