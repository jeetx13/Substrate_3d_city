import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useStore } from "@/store";
import { rig } from "@/lib/anim";
import { lenisRef, openingSequence } from "@/lib/flow";
import { RepoInput } from "@/components/RepoInput";

gsap.registerPlugin(ScrollTrigger);

export function Landing({ hidden }) {
  const root = useRef();
  const timeOfDay = useStore((s) => s.timeOfDay);
  const set = useStore((s) => s.set);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const originalTimeScale = gsap.globalTimeline.timeScale();
    if (prefersReducedMotion) gsap.globalTimeline.timeScale(4);

    const lenis = prefersReducedMotion ? null : new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9 });
    lenisRef.current = lenis;
    if (lenis) lenis.on("scroll", ScrollTrigger.update);
    const tick = (t) => lenis.raf(t * 1000);
    if (lenis) gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.6,
        onUpdate: (self) => { rig.scroll = self.progress; },
      });
      gsap.to(".hero-copy", { y: -130, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 35%", scrub: true } });
      gsap.to(".veil", { opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 45%", scrub: true } });
      gsap.utils.toArray(".reveal").forEach((el) => {
        gsap.to(el, { opacity: 1, y: 0, ease: "none", scrollTrigger: { trigger: el, start: "top 88%", end: "top 55%", scrub: true } });
      });
      const tl = gsap.timeline({ delay: 0.25 });
      tl.to(".h1-line > span", { y: 0, duration: 1.6, ease: "power4.out", stagger: 0.16 }, 0.3)
        .fromTo(".hero-sub", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.2, ease: "power2.out" }, 1.25)
        .fromTo(".hero-form", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.2, ease: "power2.out" }, 1.6)
        .fromTo(".site-header, .hero-eyebrow", { opacity: 0 }, { opacity: 1, duration: 1.4, ease: "power2.out" }, 0.9);
    }, root);
    openingSequence();

    return () => {
      ctx.revert();
      if (lenis) {
        gsap.ticker.remove(tick);
        lenis.destroy();
      }
      lenisRef.current = null;
      if (prefersReducedMotion) gsap.globalTimeline.timeScale(originalTimeScale);
    };
  }, []);

  return (
    <div
      ref={root}
      className="overlay landing relative"
      data-testid="landing-page"
      style={{ opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto", transition: "opacity 900ms ease" }}
    >
      <div className="veil" />
      <header className="site-header fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-6 md:px-12 py-6" data-testid="site-header">
        <div className="mono text-[12px] tracking-[0.22em]" data-testid="wordmark">SUBSTRATE</div>
        <div className="flex items-center gap-6">
          <div
            className="pointer-events-auto inline-flex items-center rounded border border-[var(--surface-border)] bg-[var(--surface-glass)] p-0.5 shadow-sm backdrop-blur-[var(--glass-blur)]"
            role="group"
            aria-label="Lighting mode"
            data-testid="landing-day-night-control"
          >
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 mono text-[10px] tracking-[0.14em] transition-all cursor-pointer ${
                timeOfDay === "day"
                  ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold shadow-xs"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              onClick={() => set({ timeOfDay: "day" })}
              aria-pressed={timeOfDay === "day"}
              aria-label="Switch to Day lighting"
              data-testid="landing-day-segment"
            >
              <Sun size={11} strokeWidth={2} />
              <span>DAY</span>
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 mono text-[10px] tracking-[0.14em] transition-all cursor-pointer ${
                timeOfDay === "night"
                  ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold shadow-xs"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              onClick={() => set({ timeOfDay: "night" })}
              aria-pressed={timeOfDay === "night"}
              aria-label="Switch to Night lighting"
              data-testid="landing-night-segment"
            >
              <Moon size={11} strokeWidth={2} />
              <span>NIGHT</span>
            </button>
          </div>
          <nav className="mono text-[11px] tracking-[0.12em] flex gap-5" style={{ color: "var(--warm-gray)" }}>
            <Link to="/privacy" className="hover:opacity-100 transition-opacity" data-testid="nav-privacy">PRIVACY</Link>
            <Link to="/terms" className="hover:opacity-100 transition-opacity" data-testid="nav-terms">TERMS</Link>
          </nav>
        </div>
      </header>

      <section className="hero relative z-[1] min-h-screen flex items-end md:items-center px-6 md:px-12 pb-20 md:pb-0">
        <div className="hero-copy w-full max-w-[760px] md:ml-[2vw]">
          <div className="hero-layout flex flex-col items-start">
            <div className="hero-eyebrow-scrim mb-3">
              <div className="hero-eyebrow eyebrow">A code city, built from git</div>
            </div>
            <div className="hero-headline-scrim">
              <h1 className="hero-headline serif leading-[1.02] m-0" data-testid="hero-headline">
                <span className="h1-line"><span>Every file becomes a building.</span></span>
                <span className="h1-line"><span>Every import becomes a road.</span></span>
                <span className="h1-line"><span style={{ color: "var(--olive)" }}>History replays as the city grows.</span></span>
              </h1>
            </div>
            <div className="hero-sub-scrim mt-6">
              <p className="hero-sub m-0 max-w-[520px] text-sm md:text-base" style={{ color: "var(--ink-soft)" }} data-testid="hero-subheadline">
                Paste a public GitHub repository. SUBSTRATE clones it, parses the import graph, lays it out as a city, and replays the git log as buildings rising from the ground.
              </p>
            </div>
            <div className="hero-form-scrim mt-6 w-full max-w-[560px]">
              <div className="hero-form"><RepoInput id="hero" /></div>
            </div>
          </div>
        </div>
        <aside className="hero-spec mono" aria-label="City key">
          <div>Files = buildings</div>
          <div>Imports = roads</div>
          <div>Commits = time</div>
        </aside>
      </section>

      <section className="relative z-[1] min-h-screen flex items-center px-6 md:px-12">
        <div className="reveal copy-veil ml-auto max-w-[460px] md:mr-[6vw]">
          <div className="eyebrow mb-6">01 &nbsp; Massing</div>
          <h2 className="serif text-base md:text-lg m-0" style={{ fontSize: "clamp(26px, 3vw, 40px)", lineHeight: 1.1 }}>
            Height is lines of code. Footprint follows language. Color follows churn.
          </h2>
          <p className="mt-6 text-sm md:text-base" style={{ color: "var(--ink-soft)" }}>
            Python files rise as stepped towers, TypeScript as offset slabs, JavaScript as wide blocks with a cornice. Files that change often warm toward terracotta. Stable files stay the color of bone.
          </p>
        </div>
      </section>

      <section className="relative z-[1] min-h-screen flex items-center px-6 md:px-12">
        <div className="reveal copy-veil max-w-[460px] md:ml-[8vw]">
          <div className="eyebrow mb-6">02 &nbsp; Infrastructure</div>
          <h2 className="serif m-0" style={{ fontSize: "clamp(26px, 3vw, 40px)", lineHeight: 1.1 }}>
            Roads are imports. A dashed road is a guess.
          </h2>
          <p className="mt-6 text-sm md:text-base" style={{ color: "var(--ink-soft)" }}>
            Static imports resolved from the syntax tree are drawn solid. Dynamic imports found by pattern matching are drawn dashed, so the city never overstates what it knows.
          </p>
        </div>
      </section>

      <section className="relative z-[1] min-h-screen flex items-center px-6 md:px-12">
        <div className="reveal copy-veil max-w-[560px] mx-auto w-full">
          <div className="eyebrow mb-6">03 &nbsp; Time</div>
          <h2 className="serif m-0" style={{ fontSize: "clamp(26px, 3vw, 40px)", lineHeight: 1.1 }}>
            Then the city replays its own history.
          </h2>
          <p className="mt-6 mb-10 text-sm md:text-base" style={{ color: "var(--ink-soft)" }}>
            Recent commits are bucketed into up to sixty snapshots. Scrub through them and watch buildings appear, grow, shrink and disappear.
          </p>
          <RepoInput id="footer" compact />
        </div>
      </section>

      <footer className="relative z-[1] px-6 md:px-12 pb-10 pt-24 flex flex-wrap gap-6 justify-between mono text-[11px] tracking-[0.08em]" style={{ color: "var(--warm-gray)" }}>
        <span>Public repositories only. Up to 1,500 files per city. Clones are kept for up to an hour for file previews, then deleted.</span>
        <span className="flex gap-6"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></span>
      </footer>
    </div>
  );
}
