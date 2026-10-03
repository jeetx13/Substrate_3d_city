import { create } from "zustand";
import { buildCity } from "@/lib/cityMath";
import { makeAmbientPayload } from "@/lib/ambient";
import { initAnim } from "@/lib/anim";

export const ambientCity = buildCity(makeAmbientPayload(), true);
initAnim(ambientCity.buildings.length, 0);

const _initTheme = (() => {
  try {
    const v = localStorage.getItem("substrate-theme");
    if (v === "day" || v === "night") return v;
  } catch (_) { /* storage unavailable */ }
  return "day";
})();

export const useStore = create((set) => ({
  mode: "landing",
  timeOfDay: _initTheme,
  city: ambientCity,
  jobId: null,
  stages: [],
  error: null,
  hovered: -1,
  selected: -1,
  snapshot: -1,
  playing: false,
  set: (patch) => set(patch),
}));
