import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "@/store";
import { selectAndFly } from "@/three/CameraRig";

export function SearchBox() {
  const mode = useStore((s) => s.mode);
  const city = useStore((s) => s.city);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const needle = query.trim().toLowerCase();
    return city.buildings.filter((building) => building.file.path.toLowerCase().includes(needle)).slice(0, 8);
  }, [city, query]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
      if (event.key === "/" && !isTyping && mode === "city") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") setQuery("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  if (mode !== "city") return null;

  const choose = (building) => {
    selectAndFly(building.i);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className="overlay fixed left-1/2 top-24 z-30 w-[min(92vw,380px)] -translate-x-1/2" data-testid="city-search">
      <label className="card flex items-center gap-3 px-4 py-3">
        <Search size={15} strokeWidth={1.5} aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              choose(matches[0]);
            }
          }}
          className="min-w-0 flex-1 bg-transparent outline-none mono text-[11px]"
          placeholder="Search files  /"
          aria-label="Search files by path"
          data-testid="city-search-input"
        />
        <span className="mono text-[10px] opacity-50">ENTER</span>
      </label>
      {query && (
        <div className="card mt-1 max-h-[40vh] overflow-auto p-2">
          {matches.length ? matches.map((building) => (
            <button key={building.i} type="button" onClick={() => choose(building)} className="block w-full truncate px-2 py-1 text-left mono text-[10px] hover:bg-black/5" title={building.file.path}>
              {building.file.path}
            </button>
          )) : <div className="p-2 mono text-[10px] opacity-60">No matching files</div>}
        </div>
      )}
    </div>
  );
}
