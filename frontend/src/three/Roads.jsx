import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { anim } from "@/lib/anim";
import { useStore } from "@/store";

const dummy = new THREE.Object3D();
// Dark asphalt charcoal — clearly distinct from the concrete ground
const C_HIGH = new THREE.Color("#454749");
const C_LOW  = new THREE.Color("#515558");
// Lighter curb/edge strip color
const C_CURB = new THREE.Color("#7a7e82");
const C_DIM = new THREE.Color("#292c2d");
const C_CONNECTED = new THREE.Color("#a8ae97");
const C_CURB_DIM = new THREE.Color("#3a3d3e");
const C_CURB_CONNECTED = new THREE.Color("#c1c7ae");

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function Roads({ city }) {
  const selected = useStore((s) => s.selected);
  const roadRef  = useRef();
  const curbRef  = useRef();

  // Road body geometry — same as before
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 0.09, 1);
    g.translate(0.5, 0.045, 0);
    return g;
  }, []);

  // Curb strip geometry: thin, slightly taller strip along each long edge
  const curbGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 0.11, 1);
    g.translate(0.5, 0.055, 0);
    return g;
  }, []);

  const segs = useMemo(() => {
    const out = [];
    for (const r of city.roads) {
      const a = city.buildings[r.src], b = city.buildings[r.tgt];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const angle = Math.atan2(dz, dx);
      const width = r.weight >= 4 ? 0.62 : r.weight >= 2 ? 0.46 : 0.34;
      const pad = a.size * 0.35;
      const span = L - pad - b.size * 0.35;
      if (span <= 0.3) continue;
      if (r.low) {
        for (let s = 0; s < span; s += 1.9) out.push({ src: r.src, tgt: r.tgt, x: a.x, z: a.z, angle, L, start: pad + s, len: Math.min(1.05, span - s), width, low: true });
      } else {
        out.push({ src: r.src, tgt: r.tgt, x: a.x, z: a.z, angle, L, start: pad, len: span, width, low: false });
      }
    }
    return out;
  }, [city]);

  // Assign road body colors
  useEffect(() => {
    const m = roadRef.current;
    if (!m) return;
    segs.forEach((s, i) => {
      const connected = selected >= 0 && (s.src === selected || s.tgt === selected);
      const color = selected < 0 ? (s.low ? C_LOW : C_HIGH) : connected ? C_CONNECTED : C_DIM;
      m.setColorAt(i, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
  }, [segs, selected]);

  // Keep both curb strips aligned with the selected dependency neighborhood.
  useEffect(() => {
    const m = curbRef.current;
    if (!m) return;
    segs.forEach((s, i) => {
      const connected = selected >= 0 && (s.src === selected || s.tgt === selected);
      const color = selected < 0 ? C_CURB : connected ? C_CURB_CONNECTED : C_CURB_DIM;
      m.setColorAt(i * 2, color);
      m.setColorAt(i * 2 + 1, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
  }, [segs, selected]);

  const dummyCurb = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const m = roadRef.current;
    const c = curbRef.current;
    if (!m || !c || anim.rise.length !== city.buildings.length || !anim.moving) return;
    const { lastS } = anim;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const draw = smooth(0.62, 1.0, Math.min(lastS[s.src], lastS[s.tgt]));
      const vis = Math.min(s.len, s.L * draw - s.start);
      if (vis <= 0.02) {
        dummy.position.set(s.x, -1, s.z);
        dummy.scale.set(0.001, 0.001, 0.001);
        // Hide both curb strips too
        dummyCurb.position.set(s.x, -1, s.z);
        dummyCurb.scale.set(0.001, 0.001, 0.001);
        dummyCurb.updateMatrix();
        c.setMatrixAt(i * 2,     dummyCurb.matrix);
        c.setMatrixAt(i * 2 + 1, dummyCurb.matrix);
      } else {
        const ox = Math.cos(s.angle) * s.start;
        const oz = Math.sin(s.angle) * s.start;
        // Road body
        dummy.position.set(s.x + ox, 0, s.z + oz);
        dummy.rotation.set(0, -s.angle, 0);
        dummy.scale.set(vis, 1, s.width);

        // Perpendicular offset for left / right curb strips
        const perpX = Math.sin(s.angle);
        const perpZ = -Math.cos(s.angle);
        const halfW  = s.width * 0.5;
        const curbW  = 0.045; // thin strip width

        // Left curb
        dummyCurb.position.set(s.x + ox + perpX * halfW, 0, s.z + oz + perpZ * halfW);
        dummyCurb.rotation.set(0, -s.angle, 0);
        dummyCurb.scale.set(vis, 1, curbW);
        dummyCurb.updateMatrix();
        c.setMatrixAt(i * 2, dummyCurb.matrix);

        // Right curb
        dummyCurb.position.set(s.x + ox - perpX * halfW, 0, s.z + oz - perpZ * halfW);
        dummyCurb.rotation.set(0, -s.angle, 0);
        dummyCurb.scale.set(vis, 1, curbW);
        dummyCurb.updateMatrix();
        c.setMatrixAt(i * 2 + 1, dummyCurb.matrix);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
  });

  if (!segs.length) return null;
  const key = `${city.isAmbient ? "a" : city.meta.slug}-${segs.length}`;
  return (
    <group>
      {/* Road body — dark asphalt */}
      <instancedMesh key={`${key}-road`} ref={roadRef} args={[geo, undefined, segs.length]} receiveShadow>
        <meshStandardMaterial roughness={0.95} metalness={0} color="#ffffff" />
      </instancedMesh>
      {/* Curb strips — lighter edge highlight */}
      <instancedMesh key={`${key}-curb`} ref={curbRef} args={[curbGeo, undefined, segs.length * 2]} receiveShadow>
        <meshStandardMaterial roughness={0.85} metalness={0} color="#ffffff" />
      </instancedMesh>
    </group>
  );
}
