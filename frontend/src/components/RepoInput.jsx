import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { submitRepo } from "@/lib/flow";

const GITHUB = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+|^[\w.-]+\/[\w.-]+$/;

export function RepoInput({ id = "hero", compact = false }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!GITHUB.test(v)) { setError("Enter a public GitHub repository, like github.com/pallets/flask"); return; }
    setError("");
    submitRepo(v);
  };
  return (
    <form onSubmit={submit} className="w-full" data-testid={`repo-form-${id}`}>
      <div className="flex gap-3" style={{ maxWidth: compact ? 560 : 620 }}>
        <input
          className="field"
          data-testid={`repo-input-${id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="github.com/owner/repository"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn" type="submit" data-testid={`repo-submit-${id}`}>
          Build the city <ArrowRight size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="mono mt-3 text-[12px]" style={{ minHeight: 18, color: error ? "var(--terracotta)" : "var(--warm-gray)" }} data-testid={`repo-hint-${id}`}>
        {error || "Public repositories. Python, JavaScript and TypeScript are parsed."}
      </div>
    </form>
  );
}
