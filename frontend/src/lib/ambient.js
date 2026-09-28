import { footprintSize } from "./cityMath";

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = ["core", "render", "graph", "history", "layout", "parse", "ui"];
const NAMES = ["scene", "camera", "light", "mesh", "index", "walk", "resolve", "bucket", "force", "node", "edge", "reader", "writer", "state", "route", "shell", "types", "utils", "config", "model"];
const LANGS = ["python", "typescript", "javascript"];

export function makeAmbientPayload() {
  const rnd = mulberry32(1913);
  const files = [];
  const clusterCount = DIRS.length;
  for (let c = 0; c < clusterCount; c++) {
    const ang = (c / clusterCount) * Math.PI * 2 + rnd() * 0.5;
    const rad = 9 + rnd() * 17;
    const cx = Math.cos(ang) * rad, cz = Math.sin(ang) * rad;
    const count = 16 + Math.floor(rnd() * 14);
    const lang = LANGS[c % 3];
    for (let k = 0; k < count; k++) {
      const loc = Math.floor(Math.exp(3 + rnd() * 4.3));
      const r = Math.sqrt(rnd()) * (6 + count * 0.28);
      const a = rnd() * Math.PI * 2;
      const churnBase = rnd();
      files.push({
        file_id: `a${c}_${k}`,
        path: `${DIRS[c]}/${NAMES[(k * 7 + c) % NAMES.length]}_${k}.${lang === "python" ? "py" : lang === "typescript" ? "ts" : "js"}`,
        language: lang, loc,
        churn_score: Math.round(Math.pow(churnBase, 2.2) * 1000) / 1000,
        layout_x: cx + Math.cos(a) * r, layout_y: cz + Math.sin(a) * r,
        last_modified: "", top_author: "",
      });
    }
  }
  const R = files.map((f) => footprintSize(f.loc) * 0.85 + 0.7);
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
      const dx = files[j].layout_x - files[i].layout_x, dz = files[j].layout_y - files[i].layout_y;
      const d = Math.hypot(dx, dz) || 0.001;
      const ov = R[i] + R[j] - d;
      if (ov > 0) {
        const px = (dx / d) * ov * 0.5, pz = (dz / d) * ov * 0.5;
        files[i].layout_x -= px; files[i].layout_y -= pz; files[j].layout_x += px; files[j].layout_y += pz;
      }
    }
  }
  const edges = [];
  const byCluster = {};
  files.forEach((f) => { (byCluster[f.path.split("/")[0]] ||= []).push(f); });
  Object.values(byCluster).forEach((list) => {
    list.forEach((f) => {
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const t = list[Math.floor(rnd() * list.length)];
        if (t !== f) edges.push({ source_file_id: f.file_id, target_file_id: t.file_id, weight: 1 + Math.floor(rnd() * 3), confidence: rnd() < 0.14 ? "low" : "high" });
      }
    });
  });
  for (let k = 0; k < 22; k++) {
    const a = files[Math.floor(rnd() * files.length)], b = files[Math.floor(rnd() * files.length)];
    if (a !== b) edges.push({ source_file_id: a.file_id, target_file_id: b.file_id, weight: 1, confidence: rnd() < 0.3 ? "low" : "high" });
  }
  return { files, edges, snapshots: [], meta: { slug: "" } };
}
