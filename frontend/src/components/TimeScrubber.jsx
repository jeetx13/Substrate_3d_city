import { useEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { useStore } from "@/store";
import { applySnapshot } from "@/lib/flow";

function fmt(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function TimeScrubber() {
  const mode = useStore((s) => s.mode);
  const city = useStore((s) => s.city);
  const snapshot = useStore((s) => s.snapshot);
  const playing = useStore((s) => s.playing);
  const set = useStore((s) => s.set);
  const track = useRef();
  const drag = useRef(false);
  const n = city.snapshots.length;
  const idx = snapshot < 0 ? n - 1 : snapshot;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const cur = useStore.getState().snapshot;
      const next = cur < 0 ? 0 : cur + 1;
      if (next >= n - 1) { applySnapshot(-1); set({ playing: false }); }
      else applySnapshot(next);
    }, 520);
    return () => clearInterval(t);
  }, [playing, n, set]);

  if (mode !== "city" || n < 2) return null;

  const pick = (clientX) => {
    const r = track.current.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const i = Math.round(p * (n - 1));
    applySnapshot(i >= n - 1 ? -1 : i);
  };
  const snap = city.snapshots[idx];
  const pct = (idx / (n - 1)) * 100;

  return (
    <div className="overlay card fixed left-1/2 bottom-6 -translate-x-1/2 w-[min(92vw,760px)] fade-in px-5 pt-4 pb-3" data-testid="time-scrubber">
      <div className="flex items-end justify-between gap-6 mb-3">
        <div className="min-w-0">
          <div className="eyebrow">{idx === n - 1 ? "Present day" : `Snapshot ${idx + 1} of ${n}`}</div>
          <div className="serif text-[22px] leading-tight mt-1" data-testid="scrub-date">{fmt(snap.commit_date)}</div>
          <div className="mono text-[11.5px] truncate mt-1" style={{ color: "var(--warm-gray)" }} data-testid="scrub-message">{snap.commit_message_summary}</div>
        </div>
        <button
          className="btn btn-ghost !h-10 !px-4"
          onClick={() => { if (!playing && snapshot < 0) applySnapshot(0); set({ playing: !playing }); }}
          data-testid="scrub-play-btn"
        >
          {playing ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
          <span className="mono text-[11px] tracking-[0.12em]">{playing ? "PAUSE" : "REPLAY"}</span>
        </button>
      </div>
      <div
        ref={track}
        className="scrub-track"
        data-testid="scrub-track"
        onPointerDown={(e) => { drag.current = true; track.current.setPointerCapture(e.pointerId); set({ playing: false }); pick(e.clientX); }}
        onPointerMove={(e) => { if (drag.current) pick(e.clientX); }}
        onPointerUp={(e) => { drag.current = false; track.current.releasePointerCapture(e.pointerId); }}
      >
        {city.snapshots.map((_, i) => (
          <i key={i} className="scrub-tick" style={{ left: `${(i / (n - 1)) * 100}%` }} />
        ))}
        <div className="scrub-fill" style={{ width: `${pct}%` }} />
        <div className="scrub-handle" style={{ left: `${pct}%` }} data-testid="scrub-handle" />
      </div>
    </div>
  );
}
