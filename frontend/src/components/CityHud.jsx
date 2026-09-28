import { useState } from "react";
import { useStore } from "@/store";
import { returnToLanding } from "@/lib/flow";
import { Legend } from "@/components/Legend";

export function CityHud() {
  const [copied, setCopied] = useState(false);
  const mode = useStore((s) => s.mode);
  const city = useStore((s) => s.city);
  if (mode !== "city") return null;
  const m = city.meta;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <header className="overlay fixed top-0 left-0 right-0 flex items-start justify-between px-6 md:px-12 py-6 fade-in pointer-events-none" data-testid="city-hud">
        <div>
          <div className="mono text-[12px] tracking-[0.22em]">SUBSTRATE</div>
          <div className="serif text-[22px] leading-tight mt-2" data-testid="city-slug">{m.slug}</div>
          {m.capped && (
            <div className="canvas-text-scrim mono text-[11px] mt-2" data-testid="city-cap-note">
              Showing the first {m.file_count.toLocaleString()} of {m.total_scanned.toLocaleString()} source files
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <button className="btn btn-ghost pointer-events-auto !h-10 !px-4 mono text-[11px] tracking-[0.12em]" onClick={returnToLanding} data-testid="new-repo-btn">
            NEW REPOSITORY
          </button>
          <button className="btn btn-ghost pointer-events-auto !h-10 !px-4 mono text-[11px] tracking-[0.12em]" onClick={copyLink} data-testid="copy-city-link-btn">
            {copied ? "COPIED" : "COPY LINK"}
          </button>
          <div className="canvas-text-scrim mono text-[11px] tracking-[0.08em] text-right hidden md:block">
            Drag to orbit. Scroll to approach. Hover a building.
          </div>
        </div>
      </header>
      <Legend />
    </>
  );
}
