# SUBSTRATE. PRD

## Original problem statement
Turn any public GitHub repo into an explorable, time-scrubbable 3D city. Deterministic pipeline only (no AI). Cinematic landing page with the city living inside the hero, scroll-driven camera, repo input that hands off gracefully into the parsed city, staggered reveal animation with genuine pipeline progress text, building info cards with code preview, styled time scrubber over bucketed git history. Natural architectural palette (bone, stone, sage, olive, earth). No purple gradients, pills, glassmorphism, fake social proof, em dashes.

## User choices
- Existing React (CRA/CRACO) + JSX, React Three Fiber, drei, GSAP, Lenis (not Vite/TS)
- Regex-based JS/TS import parser with tsconfig/alias + workspace package resolution; dynamic imports = confidence "low"
- Caps: 1,500 files, clone depth 400 commits, 60 history snapshots
- Domain skipped for now; favicon, privacy, terms added

## Architecture
- Backend: FastAPI `/api`. `pipeline/`: clone (shallow git), scan (LOC, ignore dirs), py_imports (ast), js_imports (regex + tsconfig paths + monorepo packages), history (git log numstat, churn, bucketed snapshots with exact LOC reconstruction), layout (networkx spring layout with directory nodes + numpy collision/centroid relaxation). Jobs run in a thread with stage progress; results persisted to Mongo `analyses`; clones kept in `SUBSTRATE_WORK_DIR` for read-only previews.
- Endpoints: POST /api/repos/analyze, GET /api/repos/{id}/status, GET /api/repos/{id}, GET /api/repos/{id}/file?path=
- Frontend: single continuous experience (`pages/Experience.jsx`): fixed R3F canvas (`three/`), Lenis + ScrollTrigger landing overlay, `lib/flow.js` orchestrates submit -> transition -> reveal -> city; zustand store; instanced buildings (3 tiers, language massing, churn color), instanced roads (dashed = low confidence), procedural ground texture, warm directional sun with soft shadows, fog.

## Implemented (2026-06)
- Full pipeline validated on pallets/flask (small), pmndrs/drei (TS mid), django/django (capped large)
- Data contract exact; scipy needed for large spring layouts
- Landing: opening sequence, scroll camera path ending top-down, sections, footer input, privacy/terms, favicon
- City: reveal by directory cluster, progressive roads, orbit controls, hover/click card + code preview, time scrubber with replay
- Testing agent iteration 1: backend 12/12, frontend all flows pass

## Backlog
- P1: deep links to finished analyses (/city/:jobId); dispose old clones (disk growth); layout speed for 1500 nodes (~25s)
- P2: depth-of-field/post-processing; per-directory ground districts; custom domain
- Known limits: commit history limited by clone depth; Python 2 / newest-syntax files logged as unparsable; unresolved imports (external packages) skipped
