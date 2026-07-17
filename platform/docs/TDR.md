# Technology Decision Record

AWP-002 · Each entry: choice, why, alternatives considered, exit cost if wrong.

| # | Decision | Why | Alternatives considered | Exit cost |
|---|---|---|---|---|
| T1 | **TypeScript (strict)** everywhere | Engineering software needs type-checked units, schemas, and refactor safety; the compiler is our first reviewer | Plain JS (rejected: silent unit/shape bugs), Rust+WASM for kernel (deferred: premature — revisit if profiling demands it) | Low — TS is the industry default |
| T2 | **npm workspaces monorepo** | Core/UI separation enforced by package boundaries with zero extra tooling | Nx/Turborepo (rejected for now: tooling weight), single package (rejected: erodes the core/adapter boundary) | Low |
| T3 | **Vite** build + dev server | Fast, standard, first-class TS/worker/PWA support | Webpack (slower, more config), no-build (rejected: can't scale past one file — proven by the old dashboard) | Low |
| T4 | **React 18** for the shell | Largest ecosystem, best long-term hiring/maintenance story; panels/dashboards are React's home turf | Svelte (great, smaller ecosystem), Vue, vanilla (rejected: panel complexity) | Medium — hence: **no React inside core packages**, ever |
| T5 | **Zustand** for UI state | Minimal, unopinionated; UI state is small because sim state lives in the engine | Redux (ceremony), React context only (re-render storms from 30 Hz snapshots) | Low |
| T6 | **Three.js** for 3D | De-facto standard, instancing for thousands of products, huge community | Babylon.js (equally valid; Three chosen for ecosystem size), WebGPU-native (too early) | Medium — isolated in one render-adapter module |
| T7 | **Web Worker** hosts the engine | Keeps 60 fps UI while simulating at ×N speed; enforces the sim/render boundary physically, not just by convention | Main thread (rejected: jank + boundary erosion) | Low — engine is pure, host is swappable |
| T8 | **Zod** for project schema | Runtime validation + TS types from one source; versioned migrations | JSON Schema (verbose), hand-rolled (unsafe) | Low |
| T9 | **Vitest** (+ Playwright smoke) | Engine math gets mandatory unit tests vs hand calculations; fast, Vite-native | Jest (slower with ESM/TS) | Low |
| T10 | **PWA on static hosting**, no backend in v1 | Meets browser/no-install/offline/tablet requirements at zero infra cost; project files are local | Electron (installs — violates requirement), SaaS backend now (premature before cloud sync is scoped) | Medium — cloud adapter slot reserved in architecture |
| T11 | **Seeded PRNG (mulberry32)** in engine | Determinism is an engineering requirement, not a nicety | `Math.random` (non-reproducible — rejected outright) | None |
