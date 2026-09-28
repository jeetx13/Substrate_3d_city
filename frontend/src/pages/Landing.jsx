import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { rig } from "@/lib/anim";
import { lenisRef, openingSequence } from "@/lib/flow";
import { RepoInput } from "@/components/RepoInput";

gsap.registerPlugin(ScrollTrigger);

export function Landing({ hidden }) {
  const root = useRef();

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9 });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.6,
        onUpdate: (self) => { rig.scroll = self.progress; },
      });
      gsap.to(".hero-copy", { y: -110, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 35%", scrub: true } });
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
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
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
        <nav className="mono text-[11px] tracking-[0.12em] flex gap-6" style={{ color: "var(--warm-gray)" }}>
          <Link to="/privacy" data-testid="nav-privacy">PRIVACY</Link>
          <Link to="/terms" data-testid="nav-terms">TERMS</Link>
        </nav>
      </header>

      <section className="hero relative z-[1] min-h-screen flex items-end md:items-center px-6 md:px-12 pb-20 md:pb-0">
        <div className="hero-copy w-full max-w-[720px] md:ml-[4vw]">
          <div className="hero-eyebrow eyebrow mb-8">A code city, built from git</div>
          <h1 className="serif text-4xl sm:text-5xl lg:text-6xl leading-[1.02] m-0" data-testid="hero-headline">
            <span className="h1-line"><span>Every file becomes a building.</span></span>
            <span className="h1-line"><span>Every import becomes a road.</span></span>
            <span className="h1-line"><span style={{ color: "var(--olive)" }}>History replays as the city grows.</span></span>
          </h1>
          <p className="hero-sub mt-8 mb-10 max-w-[520px] text-sm md:text-base" style={{ color: "var(--ink-soft)" }} data-testid="hero-subheadline">
            Paste a public GitHub repository. SUBSTRATE clones it, parses the import graph, lays it out as a city, and replays the git log as buildings rising from the ground.
          </p>
          <div className="hero-form"><RepoInput id="hero" /></div>
        </div>
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
        <span>Public repositories only. Up to 1,500 files per city. Clones are discarded after parsing.</span>
        <span className="flex gap-6"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></span>
      </footer>
    </div>
  );
}
