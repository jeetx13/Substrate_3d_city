import gsap from "gsap";
import { anim, initAnim, rig, framingFor } from "@/lib/anim";
import { buildCity } from "@/lib/cityMath";
import { useStore, ambientCity } from "@/store";
import { startAnalysis, getStatus, getResult } from "@/lib/api";

export const lenisRef = { current: null };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tweenGroups(groups, to, { per, total, ease, delay = 0 }) {
  const tl = gsap.timeline({ delay });
  const stagger = groups.length > 1 ? (total - per) / (groups.length - 1) : 0;
  groups.forEach((g, gi) => {
    const proxy = { v: to === 1 ? 0 : 1 };
    tl.to(proxy, {
      v: to, duration: per, ease,
      onUpdate: () => { for (const i of g.idx) anim.rise[i] = proxy.v; },
    }, gi * stagger);
  });
  return tl;
}

export function openingSequence() {
  gsap.to(rig, { intro: 1, duration: 3.8, ease: "power2.inOut" });
  gsap.to(anim, { light: 1, duration: 3.2, ease: "power2.out", delay: 0.2 });
  tweenGroups(ambientCity.groups, 1, { per: 2.2, total: 3.2, ease: "power3.out", delay: 0.35 });
}

function lockCamera() {
  if (rig.camera) rig.pos.copy(rig.camera.position);
  rig.target.copy(rig.pathTarget.getPoint(Math.min(1, rig.scroll)));
  rig.mode = "tween";
}

export async function submitRepo(url) {
  const store = useStore.getState();
  if (store.mode !== "landing") return;
  store.set({ mode: "transition", stages: [], error: null, selected: -1, hovered: -1 });
  lenisRef.current?.stop();
  lockCamera();

  const top = framingFor(ambientCity.radius).topDown;
  gsap.to(rig.pos, { x: top.x, y: top.y, z: top.z, duration: 2.0, ease: "power2.inOut" });
  gsap.to(rig.target, { x: 0, y: 0, z: 0, duration: 2.0, ease: "power2.inOut" });
  const sink = tweenGroups([...ambientCity.groups].reverse(), 0, { per: 1.3, total: 2.0, ease: "power3.in", delay: 0.25 });

  let jobId;
  try {
    const res = await startAnalysis(url);
    jobId = res.job_id;
    useStore.getState().set({ jobId, stages: res.stages || [] });
    let status = res;
    while (status.status === "running") {
      await sleep(650);
      status = await getStatus(jobId);
      useStore.getState().set({ stages: status.stages });
    }
    if (status.status === "error") throw new Error(status.error || "Analysis failed");
    const data = await getResult(jobId);
    await new Promise((r) => (sink.progress() >= 1 ? r() : sink.eventCallback("onComplete", r)));
    revealCity(buildCity(data));
  } catch (e) {
    const msg = e?.response?.data?.detail || e.message || "Analysis failed";
    useStore.getState().set({ error: msg });
  }
}

export function revealCity(city) {
  const store = useStore.getState();
  initAnim(city.buildings.length, 0);
  store.set({ city, snapshot: -1, playing: false });
  const frame = framingFor(city.radius);
  rig.mode = "tween";

  const tl = gsap.timeline();
  tl.to(rig.pos, { x: frame.topDown.x, y: frame.topDown.y, z: frame.topDown.z, duration: 0.9, ease: "power2.inOut" }, 0);
  tl.add(tweenGroups(city.groups, 1, { per: 1.7, total: 3.6, ease: "power3.out" }), 0.6);
  tl.to(rig.pos, { x: frame.pos.x, y: frame.pos.y, z: frame.pos.z, duration: 4.4, ease: "power2.inOut" }, 0.9);
  tl.to(rig.target, { x: frame.target.x, y: frame.target.y, z: frame.target.z, duration: 4.4, ease: "power2.inOut" }, 0.9);
  tl.call(() => useStore.getState().set({ mode: "city" }), null, 5.3);
}

export function returnToLanding() {
  const store = useStore.getState();
  store.set({ mode: "transition", error: null, selected: -1, hovered: -1, playing: false, snapshot: -1, stages: [] });
  if (rig.mode === "orbit" && rig.camera) {
    rig.pos.copy(rig.camera.position);
  }
  rig.mode = "tween";
  const current = store.city;
  const sink = current.isAmbient ? null : tweenGroups([...current.groups].reverse(), 0, { per: 1.0, total: 1.4, ease: "power3.in" });
  const heroPos = rig.pathPos.getPoint(0), heroTgt = rig.pathTarget.getPoint(0);
  gsap.to(rig.pos, { x: heroPos.x, y: heroPos.y, z: heroPos.z, duration: 2.2, ease: "power2.inOut" });
  gsap.to(rig.target, { x: heroTgt.x, y: heroTgt.y, z: heroTgt.z, duration: 2.2, ease: "power2.inOut" });
  const swap = () => {
    initAnim(ambientCity.buildings.length, 0);
    useStore.getState().set({ city: ambientCity, jobId: null });
    tweenGroups(ambientCity.groups, 1, { per: 1.4, total: 1.6, ease: "power3.out" });
  };
  if (sink) sink.eventCallback("onComplete", swap); else swap();
  gsap.delayedCall(2.2, () => {
    rig.scroll = 0; rig.intro = 1; rig.mode = "path";
    useStore.getState().set({ mode: "landing" });
    lenisRef.current?.start();
    lenisRef.current?.scrollTo(0, { immediate: true });
  });
}

export function applySnapshot(idx) {
  const { city } = useStore.getState();
  if (idx < 0 || idx >= city.snapTargets.length) anim.timeTarget.fill(1);
  else anim.timeTarget.set(city.snapTargets[idx]);
  useStore.getState().set({ snapshot: idx });
}
