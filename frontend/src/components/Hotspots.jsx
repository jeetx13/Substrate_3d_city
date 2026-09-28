import { useMemo } from "react";
import { useStore } from "@/store";
import { selectAndFly } from "@/three/CameraRig";

export function Hotspots() {
  const mode = useStore((s) => s.mode);
  const city = useStore((s) => s.city);
  const hotspots = useMemo(() => [...city.buildings]
    .sort((a, b) => b.file.churn_score - a.file.churn_score)
    .slice(0, 8), [city]);

  if (mode !== "city") return null;

  const saveScreenshot = () => {
    try {
      const dataUrl = window.__captureCityPng?.();
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${city.meta.slug || "substrate-city"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Unable to save city screenshot", error);
    }
  };

  return (
    <>
      <aside className="overlay card fixed left-6 top-24 z-20 hidden w-[260px] p-4 lg:block" data-testid="hotspots-panel">
        <div className="eyebrow mb-3">High churn files</div>
        <ol className="m-0 list-none space-y-1 p-0">
          {hotspots.map((building) => (
            <li key={building.i}>
              <button type="button" onClick={() => selectAndFly(building.i)} className="flex w-full items-center gap-2 text-left mono text-[10px] leading-5 opacity-75 hover:opacity-100" title={building.file.path}>
                <span className="min-w-0 flex-1 truncate">{building.file.path}</span>
                <span>{building.file.churn_score.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={saveScreenshot} className="btn btn-ghost mt-4 h-9 w-full mono text-[10px] tracking-[0.1em]" data-testid="city-screenshot-btn">
          SAVE PNG
        </button>
      </aside>
      <button type="button" onClick={saveScreenshot} className="overlay card fixed bottom-24 left-4 z-20 h-9 px-3 mono text-[10px] lg:hidden" data-testid="city-screenshot-btn-mobile">
        SAVE PNG
      </button>
    </>
  );
}
