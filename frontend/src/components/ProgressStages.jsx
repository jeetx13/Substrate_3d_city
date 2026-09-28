import { useStore } from "@/store";
import { returnToLanding } from "@/lib/flow";

export function ProgressStages() {
  const stages = useStore((s) => s.stages);
  const error = useStore((s) => s.error);
  const mode = useStore((s) => s.mode);
  if (mode !== "transition") return null;
  return (
    <div className="overlay card fixed left-6 md:left-12 bottom-10 max-w-[560px] fade-in px-6 py-5" data-testid="progress-stages">
      <div className="eyebrow mb-4">Building</div>
      <ul className="m-0 p-0 list-none mono text-[12.5px] leading-[1.9]" style={{ color: "var(--ink)" }}>
        {stages.length === 0 && !error && (
          <li data-testid="stage-item"><i className="stage-dot live" />Contacting the parser</li>
        )}
        {stages.map((s, i) => (
          <li key={i} className="fade-in" data-testid="stage-item">
            <i className={`stage-dot ${i === stages.length - 1 && !error && s.stage !== "done" ? "live" : ""}`} />
            {s.message}
          </li>
        ))}
        {error && (
          <li className="fade-in mt-3" style={{ color: "#8f4f2c" }} data-testid="stage-error">
            <i className="stage-dot" style={{ background: "var(--terracotta)" }} />{error}
          </li>
        )}
      </ul>
      {error && (
        <button className="btn btn-ghost mt-6" onClick={returnToLanding} data-testid="progress-back-btn">Back to the entrance</button>
      )}
    </div>
  );
}
