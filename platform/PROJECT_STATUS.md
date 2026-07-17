# PROJECT_STATUS — Engineering Digital Twin Platform

**Single source of truth.** Updated at the close of every AWP.
Version 3 · Last updated: 2026-07-17 (ABP-001 — commercial platform architecture)

## Business readiness (ABP-001 — runs parallel to all AWPs)

| Dimension | Readiness | Evidence / gap |
|---|---|---|
| Commercial architecture | **90 % designed / 5 % implemented** | COMMERCIAL_PLATFORM_ARCHITECTURE.md (Parts A–L); implementation deliberately deferred — v1 needs only the inert registry |
| License readiness | designed | EDR-007: signed offline-verifiable capability documents (all license types = one schema); implementation v2 |
| Feature-gate readiness | designed, seam exists | EDR-006 registry spec extended (surfaces: ui/api/mobile/ai/plugin; teaser visibility) |
| Marketplace readiness | seams ready | SKU format = MachineDefinition data files (already exists); store is v3 |
| Passive income readiness | strategy set | 7 streams sequenced; content-is-data means partners author it |
| Payment readiness | strategy set | Merchant-of-Record first (VAT/tax outsourced); PaymentProvider adapter interface |
| Owner KPI frame | defined | cost < $10/customer/mo — structurally supported (static PWA, local compute, MoR, support deflection) |
| Demo | ✅ Demo-003 | commercial platform mockup (login/license/team/billing/marketplace/settings), browser-verified |

## Snapshot

| | |
|---|---|
| Current AWP | **003 — Engineering Company Foundation (COMPLETE)** |
| Overall completion | **30 %** |
| Current milestone | Kernel v0.1 shipped & tested → next: 2D line builder + machine library UI |
| Project status | 🟢 (engineering on track; founder decisions still open but no longer blocking day-to-day) |
| Timeline | Day 7 → v0.1 demonstrator · Day ~28 → v1 (pending founder confirmation) |
| Repo | temporary home `champban/dashboard` → `platform/`, branch `claude/first-time-user-guide-lupsqy` |

## Working software (evidence, not claims)

| Asset | Evidence |
|---|---|
| `@dtp/engine` v0.1 — deterministic kernel, 7 archetypes | **11/11 tests passing**, `tsc --noEmit` clean |
| Determinism | same seed ⇒ bit-identical fingerprint incl. failures/rejects; reset reproduces run |
| Engineering validation | hand-calculated tests: transit time, throughput (74±1 in 120 s), 6:1 batch, conservation |
| Performance | 60 machines, 1 h simulated in ≈9 s ⇒ **~400× real time** (logged by test) |
| Physical honesty | blocked machines stop (no infinite buffers); backpressure chain verified visually in Demo-002 |
| `@dtp/calc` — CalcValue + SI units | OEE A/P/Q ship with formulas + inputs; asserted by test |
| Demo-002 | real kernel in a Web Worker, live params, OEE, event feed, bottleneck — browser-verified, 0 errors |

## Timeline

| Day | Phase | Status |
|---|---|---|
| 1 | AWP-001 understanding + PoC · AWP-002 architecture + standards | ✅ |
| 2–3 | AWP-003 kernel + archetypes + tests + company assets | ✅ (completed Day 1 — ahead of plan) |
| 4 | AWP-004 2D line builder + machine library UI (proposed) | ⬜ next |
| 5 | 3D view | ⬜ |
| 6 | OEE dashboard + timeline panel | ⬜ |
| 7 | Save/load + PWA + hardening → **v0.1 demo** | ⬜ |
| 8–28 | v1 scope per AWP-000 | ⬜ |

## Decision registry

| ID | Decision | Status |
|---|---|---|
| EDR-001…006 | sim/render separation · data-defined machines · CalcValue · deterministic kernel · item/flow hybrid · edition gating | ✅ EDR-001..004 now **implemented & test-proven** |
| T1–T11 | Tech stack (TDR.md) | ✅ in use (TS strict, Vitest, esbuild, Worker) |
| GP-1.0 | Global Engineering Principles adopted | ✅ |
| NEW (AWP-003) | Bottleneck = upstream-blockage heuristic, utilization fallback (documented in recorder) | ✅ implemented |

## Capability registry (company assets — real, loadable skills)

| ID | Capability | Status |
|---|---|---|
| CC-001 | `sim-kernel-standard` (.claude/skills/) | ✅ **created** v1.0 |
| CC-002 | `transparent-calc` (.claude/skills/) | ✅ **created** v1.0 |
| — | hexagonal-platform-architecture, edr-practice, awp-workflow, machine-definition-standard, engineering-units-standard | proposed; create when next used in anger |

## Knowledge assets

| ID | Asset | Status |
|---|---|---|
| KA-001 | Simulation Development Playbook | ✅ created |
| KA-002 | Machine Design Playbook (incl. domain-entry recipe + certification gate) | ✅ created |

## Commercial assets

| Asset | Status |
|---|---|
| COMMERCIAL.md (market, segments, editions, SaaS/marketplace/plugin strategy) | ✅ created — **needs founder review** |
| WORLD_BENCHMARK.md (9 products; gaps, adoptions, differentiators, innovations) | ✅ created v1 — update every AWP |

## Demo status

| Demo | Content | Status |
|---|---|---|
| PoC (AWP-001) | throwaway architecture proof | ✅ superseded |
| Demo-001 (AWP-002) | architecture walkthrough | ✅ |
| Demo-002 (AWP-003) | **real kernel live in Worker**: line with oven+wrapper, random failures, live OEE with formulas, event feed, bottleneck detection | ✅ delivered & committed |
| Demo-003 (ABP-001) | commercial platform mockup: sign-in, license (signed doc + registry view), team/org, subscription tiers, marketplace, data-ownership settings | ✅ delivered & committed |

## Risks (live)

| Risk | Rank | Change |
|---|---|---|
| No reference engineering data for validation | Critical | unchanged — hand calcs mitigate, real data still needed |
| Founder decisions open (repo, timeline, AI, mobile) | High | ↓ no longer blocking, but repo move gets costlier every AWP |
| UI layer (AWP-004+) is where scope creep historically starts | Medium | new — mitigate: build only panels shown in Demo-001 concept |
| Benchmark facts from training knowledge, not verified | Low | re-verify before external marketing use |

## Open questions (founder)

Unchanged from v1.1: (1) platform repo, (2) timeline framing, (3) AI-in-app
scope, (4) mobile scope, (5) reference data. Plus new: (6) COMMERCIAL.md
placeholder pricing — review when convenient.

## Next AWP (recommendation)

**AWP-004 — Line Builder + Machine Library UI:** Vite+React app shell
(Design mode from Demo-001 concept), drag-drop 2D layout editor producing
`LineConfig`, machine library panel with parameter forms auto-generated from
definitions, live kernel behind it. Estimated token: High.
