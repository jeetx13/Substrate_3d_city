import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useStore } from "@/store";
import { returnToLanding } from "@/lib/flow";
import { Legend } from "@/components/Legend";

export function CityHud() {
  const [copied, setCopied] = useState(false);
  const mode = useStore((s) => s.mode);
  const city = useStore((s) => s.city);
  const timeOfDay = useStore((s) => s.timeOfDay);
  const set = useStore((s) => s.set);
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
        <div className="pointer-events-auto">
          <div className="canvas-text-scrim mono text-[11px] tracking-[0.22em] font-medium">SUBSTRATE</div>
          <div className="serif text-[24px] leading-tight mt-2 font-normal" style={{ color: "var(--ink)" }} data-testid="city-slug">
            <span className="canvas-text-scrim py-1 px-2.5">{m.slug}</span>
          </div>
          {m.capped && (
            <div className="canvas-text-scrim mono text-[11px] mt-2 block" data-testid="city-cap-note">
              Showing the first {m.file_count.toLocaleString()} of {m.total_scanned.toLocaleString()} source files
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-2">
            <div
              className="pointer-events-auto inline-flex items-center rounded border border-[var(--surface-border)] bg-[var(--surface-glass)] p-0.5 shadow-sm backdrop-blur-[var(--glass-blur)]"
              role="group"
              aria-label="Lighting mode"
              data-testid="day-night-control"
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 mono text-[10.5px] tracking-[0.14em] transition-all cursor-pointer ${
                  timeOfDay === "day"
                    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold shadow-xs"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
                onClick={() => set({ timeOfDay: "day" })}
                aria-pressed={timeOfDay === "day"}
                aria-label="Switch to Day lighting"
                data-testid="day-segment"
              >
                <Sun size={12} strokeWidth={2} />
                <span>DAY</span>
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 mono text-[10.5px] tracking-[0.14em] transition-all cursor-pointer ${
                  timeOfDay === "night"
                    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold shadow-xs"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
                onClick={() => set({ timeOfDay: "night" })}
                aria-pressed={timeOfDay === "night"}
                aria-label="Switch to Night lighting"
                data-testid="night-segment"
              >
                <Moon size={12} strokeWidth={2} />
                <span>NIGHT</span>
              </button>
            </div>
            <button className="btn btn-ghost pointer-events-auto !h-9 !px-3.5 mono text-[10.5px] tracking-[0.14em]" onClick={returnToLanding} data-testid="new-repo-btn">
              NEW REPO
            </button>
            <button className="btn btn-ghost pointer-events-auto !h-9 !px-3.5 mono text-[10.5px] tracking-[0.14em]" onClick={copyLink} data-testid="copy-city-link-btn">
              {copied ? "COPIED" : "COPY LINK"}
            </button>
          </div>
          <div className="canvas-text-scrim mono text-[11px] tracking-[0.06em] text-right hidden md:block">
            Drag to orbit · Scroll to approach · Click to inspect
          </div>
        </div>
      </header>
      <Legend />
    </>
  );
}
