import * as THREE from "three";

export const LOC_CAP = 2000;

export function footprintSize(loc) {
  return 1.0 + 2.2 * Math.sqrt(Math.min(loc, LOC_CAP) / LOC_CAP);
}

export function heightFor(loc, maxLoc) {
  const r = Math.min(1, Math.max(0, loc / Math.max(maxLoc, 1)));
  return 1.4 + 12 * Math.pow(r, 0.75);
}

// heightFor normalizes against maxLoc, so a single outlier file (a vendored
// bundle, a generated migration, a huge fixture) stretches the whole scale
// and flattens everything else near the minimum height. Normalizing against
// a high percentile instead lets real outliers clip at max height while the
// rest of the city keeps a readable height spread.
function percentile(sorted, p) {
  if (sorted.length === 0) return 1;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function heightNormFor(locs) {
  const sorted = [...locs].sort((a, b) => a - b);
  return Math.max(1, percentile(sorted, 0.95));
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

const GRID_PITCH = 5.2;
const STREET_GAP = 2.4;
const STREET_WIDTH = 1.35;

function visualGrid(files) {
  const blockCells = files.length > 36 ? 4 : 2;
  const groups = new Map();
  files.forEach((file, index) => {
    const key = clusterKey(file.path);
    if (!groups.has(key)) groups.set(key, { key, files: [], x: 0, z: 0 });
    const group = groups.get(key);
    group.files.push({ file, index });
    group.x += file.layout_x || 0;
    group.z += file.layout_y || 0;
  });
  const ordered = [...groups.values()].sort((a, b) => {
    const ay = a.z / a.files.length, by = b.z / b.files.length;
    return ay - by || a.x / a.files.length - b.x / b.files.length || a.key.localeCompare(b.key);
  });
  const entries = [];
  ordered.forEach((group) => {
    group.files.sort((a, b) => (a.file.layout_y || 0) - (b.file.layout_y || 0)
      || (a.file.layout_x || 0) - (b.file.layout_x || 0)
      || String(a.file.path).localeCompare(String(b.file.path)));
    entries.push(...group.files);
  });
  const cols = Math.max(1, Math.ceil(Math.sqrt(files.length)));
  const rows = Math.ceil(files.length / cols);
  const coord = (slot) => slot * GRID_PITCH + Math.floor(slot / blockCells) * STREET_GAP;
  const width = cols ? coord(cols - 1) : 0;
  const depth = rows ? coord(rows - 1) : 0;
  const placements = new Map();
  entries.forEach(({ index }, slot) => {
    const row = Math.floor(slot / cols), col = slot % cols;
    placements.set(index, {
      x: coord(col) - width / 2,
      z: coord(row) - depth / 2,
      row,
      col,
    });
  });
  const xStreets = [];
  const zStreets = [];
  for (let col = blockCells; col < cols; col += blockCells) {
    xStreets.push((coord(col - 1) + coord(col)) / 2 - width / 2);
  }
  for (let row = blockCells; row < rows; row += blockCells) {
    zStreets.push((coord(row - 1) + coord(row)) / 2 - depth / 2);
  }
  const margin = GRID_PITCH * 0.5;
  return {
    placements,
    blockCells,
    gridPitch: GRID_PITCH,
    streets: [
      ...xStreets.map((x, i) => ({ axis: "z", x, z: 0, length: depth + margin * 2, width: STREET_WIDTH, renderWidth: STREET_WIDTH, weight: 1, low: false, boundary: (i + 1) * blockCells, blockCells })),
      ...zStreets.map((z, i) => ({ axis: "x", x: 0, z, length: width + margin * 2, width: STREET_WIDTH, renderWidth: STREET_WIDTH, weight: 1, low: false, boundary: (i + 1) * blockCells, blockCells })),
    ],
    intersections: xStreets.flatMap((x) => zStreets.map((z) => ({ x, z, width: STREET_WIDTH }))),
  };
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
  const grid = visualGrid(files);
  const maxLoc = heightNormFor(files.map((f) => f.loc));
  const index = new Map();
  let radius = 10;
  const buildings = files.map((f, i) => {
    index.set(f.file_id, i);
    const seed = hash(f.path);
    const size = footprintSize(f.loc);
    const h = heightFor(f.loc, maxLoc);
    const place = grid.placements.get(i) || { x: 0, z: 0, row: 0, col: 0 };
    radius = Math.max(radius, Math.hypot(place.x, place.z) + size);
    return {
      i, file: f, x: place.x, z: place.z, gridRow: place.row, gridCol: place.col, h, size, seed,
      tiers: tiersFor(f.language, size, seed),
      color: churnColor(f.churn_score, seed),
      cluster: clusterKey(f.path),
    };
  });
  const roads = edges
    .filter((e) => index.has(e.source_file_id) && index.has(e.target_file_id))
    .map((e) => ({ src: index.get(e.source_file_id), tgt: index.get(e.target_file_id), weight: e.weight, low: e.confidence === "low" }));
  grid.streets.forEach((street) => {
    for (const edge of roads) {
      const a = buildings[edge.src], b = buildings[edge.tgt];
      const ca = street.axis === "x" ? a.gridRow : a.gridCol;
      const cb = street.axis === "x" ? b.gridRow : b.gridCol;
      if ((ca < street.boundary && cb >= street.boundary) || (cb < street.boundary && ca >= street.boundary)) {
        street.weight += Math.max(0, Number(edge.weight) || 1);
        street.low = street.low || edge.low;
      }
    }
    street.renderWidth = street.width * (1 + Math.min(0.3, Math.log2(Math.max(1, street.weight)) * 0.08));
  });

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

  return { buildings, roads, streets: grid.streets, intersections: grid.intersections, blockCells: grid.blockCells, gridPitch: grid.gridPitch, snapshots, snapTargets, groups, districts, meta, radius, isAmbient, maxLoc };
}
