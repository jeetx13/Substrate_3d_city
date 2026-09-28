import { useStore } from "@/store";

export function Legend() {
  const mode = useStore((s) => s.mode);
  if (mode !== "city") return null;

  return (
    <aside className="overlay city-legend mono hidden md:block" aria-label="City legend">
      <div className="city-legend-row">
        <span className="legend-height" aria-hidden="true"><i /><i /><i /></span>
        <span>Height = lines of code</span>
      </div>
      <div className="city-legend-row">
        <span className="legend-churn" aria-hidden="true" />
        <span>Color = churn</span>
      </div>
      <div className="city-legend-row">
        <span className="legend-road" aria-hidden="true" />
        <span>Dashed road = low confidence</span>
      </div>
    </aside>
  );
}
