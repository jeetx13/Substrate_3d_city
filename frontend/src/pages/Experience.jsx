import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "@/store";
import { buildCity } from "@/lib/cityMath";
import { getResult } from "@/lib/api";
import { revealCity } from "@/lib/flow";
import { Scene } from "@/three/Scene";
import { Landing } from "@/pages/Landing";
import { ProgressStages } from "@/components/ProgressStages";
import { CityHud } from "@/components/CityHud";
import { InfoCard } from "@/components/InfoCard";
import { TimeScrubber } from "@/components/TimeScrubber";

export default function Experience() {
  const mode = useStore((s) => s.mode);
  const timeOfDay = useStore((s) => s.timeOfDay);
  const { jobId } = useParams();
  const [routeError, setRouteError] = useState("");

  useEffect(() => {
    if (!jobId) {
      setRouteError("");
      return undefined;
    }

    let active = true;
    setRouteError("");
    useStore.getState().set({
      mode: "transition",
      jobId,
      error: null,
      stages: [],
      selected: -1,
      hovered: -1,
      playing: false,
      snapshot: -1,
    });

    getResult(jobId).then((result) => {
      if (active) revealCity(buildCity(result));
    }).catch((error) => {
      if (!active) return;
      setRouteError(error?.response?.status === 404
        ? "This city could not be found. It may have expired."
        : error?.response?.data?.detail || "Couldn't load this city. Check your connection and try again.");
    });

    return () => { active = false; };
  }, [jobId]);

  return (
    <>
      <div className="sky" />
      <Scene />
      <Landing hidden={Boolean(jobId) || mode !== "landing"} />
      {routeError ? (
        <div className="overlay card fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,440px)] px-6 py-5" data-testid="city-load-error">
          <div className="eyebrow mb-3">City unavailable</div>
          <p className="m-0 mb-5 text-sm" style={{ color: "var(--ink-soft)" }}>{routeError}</p>
          <a className="btn inline-flex items-center" href="/">Return home</a>
        </div>
      ) : <ProgressStages />}
      <CityHud />
      <InfoCard />
      <TimeScrubber />
    </>
  );
}

