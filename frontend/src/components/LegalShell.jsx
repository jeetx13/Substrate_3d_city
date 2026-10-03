import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/store";

export function LegalShell({ title, children, testId }) {
  const timeOfDay = useStore((s) => s.timeOfDay);
  useEffect(() => {
    document.documentElement.dataset.theme = timeOfDay;
  }, [timeOfDay]);

  return (
    <div className="legal" data-testid={testId}>
      <Link to="/" className="mono text-[12px] tracking-[0.22em] no-underline" data-testid="legal-home-link">SUBSTRATE</Link>
      <h1 className="mt-10">{title}</h1>
      {children}
    </div>
  );
}
