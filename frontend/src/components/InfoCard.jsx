import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/store";
import { getPreview } from "@/lib/api";

function fmtDate(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function InfoCard() {
  const mode = useStore((s) => s.mode);
  const city = useStore((s) => s.city);
  const hovered = useStore((s) => s.hovered);
  const selected = useStore((s) => s.selected);
  const jobId = useStore((s) => s.jobId);
  const set = useStore((s) => s.set);
  const [preview, setPreview] = useState(null);

  const idx = selected >= 0 ? selected : hovered;
  const b = idx >= 0 ? city.buildings[idx] : null;
  const path = selected >= 0 && b ? b.file.path : null;

  useEffect(() => {
    setPreview(null);
    if (!path || !jobId) return;
    let live = true;
    getPreview(jobId, path).then((p) => live && setPreview(p)).catch((e) => live && setPreview({ error: e?.response?.data?.detail || "Preview unavailable" }));
    return () => { live = false; };
  }, [path, jobId]);

  if (mode !== "city" || !b) return null;
  const f = b.file;
  return (
    <aside className="overlay card fixed right-4 md:right-8 top-20 w-[min(92vw,400px)] fade-in" data-testid="building-info-card">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="mono text-[12px] break-all leading-snug" data-testid="info-path">{f.path}</div>
          {selected >= 0 && (
            <button onClick={() => set({ selected: -1 })} className="opacity-60 hover:opacity-100" aria-label="Close" data-testid="info-close-btn">
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-y-3 gap-x-6 mt-5 m-0 text-[13px]">
          <div><dt className="eyebrow">Language</dt><dd className="m-0 mt-1 capitalize" data-testid="info-language">{f.language}</dd></div>
          <div><dt className="eyebrow">Lines</dt><dd className="m-0 mt-1 mono" data-testid="info-loc">{f.loc.toLocaleString()}</dd></div>
          <div><dt className="eyebrow">Top author</dt><dd className="m-0 mt-1 truncate" data-testid="info-author">{f.top_author || "unknown"}</dd></div>
          <div><dt className="eyebrow">Last modified</dt><dd className="m-0 mt-1" data-testid="info-modified">{fmtDate(f.last_modified)}</dd></div>
        </dl>
        <div className="mt-5">
          <div className="flex justify-between eyebrow"><span>Churn</span><span className="mono" data-testid="info-churn">{f.churn_score.toFixed(2)}</span></div>
          <div className="churn-bar mt-2"><i style={{ width: `${Math.round(f.churn_score * 100)}%` }} /></div>
        </div>
        {selected < 0 && <div className="mono text-[11px] mt-5" style={{ color: "var(--warm-gray)" }}>Click the building to read the file</div>}
      </div>
      {selected >= 0 && (
        <div className="code p-4" data-testid="code-preview">
          {!preview && "Loading preview"}
          {preview?.error && <span style={{ color: "var(--terracotta)" }}>{preview.error}</span>}
          {preview?.lines && preview.lines.map((l, i) => (
            <div key={i}><span className="ln">{i + 1}</span>{l || " "}</div>
          ))}
          {preview?.lines && preview.total_lines > preview.lines.length && (
            <div className="mt-2 opacity-60">{(preview.total_lines - preview.lines.length).toLocaleString()} more lines</div>
          )}
        </div>
      )}
    </aside>
  );
}
