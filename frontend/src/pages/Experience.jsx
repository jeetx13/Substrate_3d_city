import { useStore } from "@/store";
import { Scene } from "@/three/Scene";
import { Landing } from "@/pages/Landing";
import { ProgressStages } from "@/components/ProgressStages";
import { CityHud } from "@/components/CityHud";
import { InfoCard } from "@/components/InfoCard";
import { TimeScrubber } from "@/components/TimeScrubber";

export default function Experience() {
  const mode = useStore((s) => s.mode);
  return (
    <>
      <div className="sky" />
      <Scene />
      <Landing hidden={mode !== "landing"} />
      <ProgressStages />
      <CityHud />
      <InfoCard />
      <TimeScrubber />
    </>
  );
}
