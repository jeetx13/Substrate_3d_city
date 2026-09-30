import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { anim } from "@/lib/anim";
import { useStore } from "@/store";

const dummy = new THREE.Object3D();
const dark = new THREE.Color("#3c3a35");
const broad = new THREE.Color("#4c4942");
const curbColor = new THREE.Color("#b1a996");
const connected = new THREE.Color("#85866f");
const curbWidth = 0.12;

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function Roads({ city }) {
  const selected = useStore((s) => s.selected);
  const roadRef = useRef();
  const curbRef = useRef();
  const junctionRef = useRef();
  const dashRef = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 0.09, 1);
    g.translate(0.5, 0.045, 0);
    return g;
  }, []);
  const curbGeometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 0.12, 1);
    g.translate(0.5, 0.06, 0);
    return g;
  }, []);
  const junctionGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.092, 1), []);
  const markingGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.016, 1), []);
  const streets = city.streets || [];
  const junctions = city.intersections || [];
  const curbSegments = useMemo(() => streets.flatMap((street, streetIndex) => {
    const vertical = street.axis === "z";
    const cuts = junctions
      .filter((junction) => Math.abs(vertical ? junction.x - street.x : junction.z - street.z) < 0.01)
      .map((junction) => vertical ? junction.z + street.length / 2 : junction.x + street.length / 2)
      .sort((a, b) => a - b);
    const cutHalf = street.width * 0.56 + 0.08;
    let cursor = 0;
    const segments = [];
    cuts.forEach((center) => {
      const start = Math.max(0, center - cutHalf);
      const end = Math.min(street.length, center + cutHalf);
      if (start - cursor > 0.15) segments.push({ streetIndex, from: cursor, length: start - cursor });
      cursor = Math.max(cursor, end);
    });
    if (street.length - cursor > 0.15) segments.push({ streetIndex, from: cursor, length: street.length - cursor });
    return segments;
  }), [streets, junctions]);
  const dashes = useMemo(() => streets.flatMap((street, streetIndex) => {
    if (!street.low) return [];
    const count = Math.floor(street.length / 2.4);
    return Array.from({ length: count }, (_, dashIndex) => ({ streetIndex, dashIndex, count }));
  }), [streets]);

  useEffect(() => {
    const roads = roadRef.current;
    const curbs = curbRef.current;
    if (!roads || !curbs) return;
    streets.forEach((street, i) => {
      const isActive = selected >= 0 && city.roads.some((r) => {
        if (r.src !== selected && r.tgt !== selected) return false;
        const a = city.buildings[r.src], b = city.buildings[r.tgt];
        const ca = street.axis === "x" ? a.gridRow : a.gridCol;
        const cb = street.axis === "x" ? b.gridRow : b.gridCol;
        return (ca < street.boundary && cb >= street.boundary) || (cb < street.boundary && ca >= street.boundary);
      });
      roads.setColorAt(i, selected < 0 ? (street.weight > 1 ? broad : dark) : isActive ? connected : dark);
    });
    curbSegments.forEach((_, i) => {
      curbs.setColorAt(i * 2, curbColor);
      curbs.setColorAt(i * 2 + 1, curbColor);
    });
    if (roads.instanceColor) roads.instanceColor.needsUpdate = true;
    if (curbs.instanceColor) curbs.instanceColor.needsUpdate = true;
    roads.frustumCulled = false;
    curbs.frustumCulled = false;
    if (junctionRef.current) junctionRef.current.frustumCulled = false;
    if (dashRef.current) dashRef.current.frustumCulled = false;
  }, [city, selected, streets, curbSegments]);

  useFrame(() => {
    const roads = roadRef.current;
    const curbs = curbRef.current;
    const junctionMesh = junctionRef.current;
    const dashMesh = dashRef.current;
    if (!roads || !curbs) return;
    const ready = anim.rise.length === city.buildings.length;
    const progress = ready && anim.moving && anim.lastS.length
      ? anim.lastS.reduce((max, v) => Math.max(max, v), 0)
      : 1;
    streets.forEach((street, i) => {
      const reveal = smooth(0.05, 0.9, progress);
      const visibleLength = Math.max(0.001, street.length * reveal);
      const vertical = street.axis === "z";
      const angle = vertical ? Math.PI / 2 : 0;
      const width = street.renderWidth;
      const startX = vertical ? street.x : -street.length / 2;
      const startZ = vertical ? -street.length / 2 : street.z;
      dummy.position.set(startX, 0, startZ);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(visibleLength, 1, width);
      dummy.updateMatrix();
      roads.setMatrixAt(i, dummy.matrix);

    });
    curbSegments.forEach((segment, i) => {
      const street = streets[segment.streetIndex];
      const vertical = street.axis === "z";
      const reveal = smooth(0.05, 0.9, progress);
      const width = street.renderWidth;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const startX = vertical ? street.x + sign * width * 0.5 : -street.length / 2 + segment.from;
        const startZ = vertical ? -street.length / 2 + segment.from : street.z + sign * width * 0.5;
        dummy.position.set(startX, 0, startZ);
        dummy.rotation.set(0, vertical ? -Math.PI / 2 : 0, 0);
        dummy.scale.set(segment.length * reveal, 1, curbWidth);
        dummy.updateMatrix();
        curbs.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    });
    junctions.forEach((junction, i) => {
      const reveal = smooth(0.05, 0.9, progress);
      dummy.position.set(junction.x, 0.045, junction.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(junction.width * 1.12 * reveal, 1, junction.width * 1.12 * reveal);
      dummy.updateMatrix();
      junctionMesh?.setMatrixAt(i, dummy.matrix);
    });
    dashes.forEach((dash, i) => {
      const street = streets[dash.streetIndex];
      const reveal = smooth(0.05, 0.9, progress);
      const along = -street.length / 2 + (dash.dashIndex + 0.5) * street.length / dash.count;
      dummy.position.set(street.axis === "z" ? street.x : along, 0.094, street.axis === "z" ? along : street.z);
      dummy.rotation.set(0, street.axis === "z" ? Math.PI / 2 : 0, 0);
      dummy.scale.set(0.78 * reveal, 1, 0.09);
      dummy.updateMatrix();
      dashMesh?.setMatrixAt(i, dummy.matrix);
    });
    roads.instanceMatrix.needsUpdate = true;
    curbs.instanceMatrix.needsUpdate = true;
    if (junctionMesh) junctionMesh.instanceMatrix.needsUpdate = true;
    if (dashMesh) dashMesh.instanceMatrix.needsUpdate = true;
  });

  if (!streets.length) return null;
  const key = `${city.isAmbient ? "a" : city.meta.slug}-${streets.length}`;
  return (
    <group>
      <instancedMesh key={`${key}-asphalt`} ref={roadRef} args={[geometry, undefined, streets.length]} receiveShadow>
        <meshStandardMaterial roughness={0.96} color="#ffffff" />
      </instancedMesh>
      <instancedMesh key={`${key}-curbs`} ref={curbRef} args={[curbGeometry, undefined, curbSegments.length * 2]} receiveShadow>
        <meshStandardMaterial roughness={0.9} color="#ffffff" />
      </instancedMesh>
      {junctions.length > 0 && (
        <instancedMesh key={`${key}-junctions`} ref={junctionRef} args={[junctionGeometry, undefined, junctions.length]} receiveShadow>
          <meshStandardMaterial color="#3c3a35" roughness={0.98} />
        </instancedMesh>
      )}
      {dashes.length > 0 && (
        <instancedMesh key={`${key}-low-confidence`} ref={dashRef} args={[markingGeometry, undefined, dashes.length]}>
          <meshStandardMaterial color="#c2ad82" roughness={0.9} />
        </instancedMesh>
      )}
    </group>
  );
}
