import * as THREE from "three";

export const anim = {
  n: 0,
  rise: new Float32Array(0),
  timeTarget: new Float32Array(0),
  timeCur: new Float32Array(0),
  lastS: new Float32Array(0),
  moving: true,
  force: true,
  light: 0,
  hovered: -1,
  selected: -1,
};

export function initAnim(n, riseValue) {
  anim.n = n;
  anim.rise = new Float32Array(n).fill(riseValue);
  anim.timeTarget = new Float32Array(n).fill(1);
  anim.timeCur = new Float32Array(n).fill(1);
  anim.lastS = new Float32Array(n).fill(-1);
  anim.force = true;
  anim.moving = true;
  anim.hovered = -1;
  anim.selected = -1;
}

export const rig = {
  mode: "path",
  scroll: 0,
  intro: 0,
  time: 0,
  camera: null,
  pos: new THREE.Vector3(),
  target: new THREE.Vector3(),
  introStart: new THREE.Vector3(70, 46, 84),
  introTarget: new THREE.Vector3(-8, 8, 6),
  pathPos: new THREE.CatmullRomCurve3([
    new THREE.Vector3(46, 22, 54),
    new THREE.Vector3(-46, 26, 42),
    new THREE.Vector3(14, 48, 16),
    new THREE.Vector3(0.05, 88, 0.05),
  ], false, "centripetal"),
  pathTarget: new THREE.CatmullRomCurve3([
    new THREE.Vector3(-13, 2, 11),
    new THREE.Vector3(6, 2, -2),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
  ], false, "centripetal"),
};

export function framingFor(radius) {
  if (typeof window !== "undefined") window.__rig = rig;
  return {
    pos: new THREE.Vector3(radius * 0.74, radius * 0.46, radius * 0.9),
    target: new THREE.Vector3(0, radius * 0.03, 0),
    topDown: new THREE.Vector3(0.05, radius * 1.9 + 10, 0.05),
  };
}
