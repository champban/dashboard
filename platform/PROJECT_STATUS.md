# PROJECT_STATUS — Engineering Digital Twin Platform

**Single source of truth.** Updated at the close of every AWP.
Version 1 · Last updated: 2026-07-17 (AWP-002)

## Snapshot

| | |
|---|---|
| Current AWP | **002 — Architecture Foundation (COMPLETE)** |
| Overall completion | **15 %** |
| Current milestone | Architecture approved → begin simulation kernel |
| Project status | 🟡 (healthy, blocked only on founder decisions) |
| Timeline | Day 7 → v0.1 demonstrator · Day ~28 → v1 (pending founder confirmation) |
| Repo | temporary home `champban/dashboard` → `platform/` folder, branch `claude/first-time-user-guide-lupsqy` |

## Timeline

| Day | Phase | Status |
|---|---|---|
| 1 | AWP-001 Understanding + PoC · AWP-002 Architecture + standards | ✅ done |
| 2–3 | AWP-003 Simulation kernel + unit tests | ⬜ next |
| 4 | AWP-004 Machine library v0 + 2D line builder | ⬜ |
| 5 | AWP-005 3D view | ⬜ |
| 6 | AWP-006 OEE dashboard + timeline | ⬜ |
| 7 | AWP-007 Save/load + PWA + hardening → **v0.1 demo** | ⬜ |
| 8–28 | v1 scope per AWP-000 (machine editor, richer library, polish) | ⬜ |

## Decisions

| ID | Decision | Status |
|---|---|---|
| EDR-001 | Simulation physically separated from rendering (Worker) | ✅ decided |
| EDR-002 | Machines = data-defined instances of 7 archetypes | ✅ decided |
| EDR-003 | Transparent `CalcValue` for every derived number | ✅ decided |
| EDR-004 | Deterministic hybrid kernel, seeded PRNG | ✅ decided |
| EDR-005 | Item-level + flow-level simulation behind entity budget | ✅ decided |
| T1–T11 | Technology stack (see TDR.md): TS, Vite, React, Three.js, Worker, Zod, Vitest, PWA | ✅ decided |

## Open Questions (founder decisions needed)

1. **Platform repository** — create private repo (proposed name `engineering-digital-twin`)? Docs currently parked in `dashboard` repo.
2. **Timeline framing** — confirm Day 7 = v0.1 demonstrator, Day ~28 = v1.
3. **AI scope v1** — recommended: architecture hooks only, copilot post-v1.
4. **Mobile scope v1** — recommended: view/simulate on phones, full editing desktop/tablet.
5. **Reference data** — any real machine rates / line OEE figures to validate against?

## Risks (top, live)

| Risk | Rank | Mitigation |
|---|---|---|
| No reference data for engineering validation | Critical | Founder to supply even 3–4 real numbers; until then, hand-calculated acceptance tests |
| Knowledge parked in dashboard repo, platform repo not approved | High | Decision #1; migration is a folder move |
| Archetype behavior design (AWP-003) is the hardest reusable-IP step | High | Design configs before coding; review against 3 domains (bakery, pharma, warehouse) on paper |
| Scope creep vs Day-7 target | Medium | AWP discipline; PROJECT_STATUS is the scope gate |

## Capabilities (company assets)

| Proposal | Status | Priority |
|---|---|---|
| sim-kernel-standard | proposed (AWP-001) — create as skill in AWP-003 alongside the real kernel | Critical |
| machine-definition-standard | proposed (AWP-001) — draft exists as ARCHITECTURE.md §D | High |
| transparent-calc-pattern | proposed (AWP-001) — draft exists as EDR-003 | High |
| hexagonal-platform-architecture | **new (AWP-002)** — pure core + adapters + message protocol as reusable pattern | High |
| edr-practice | **new (AWP-002)** — decision-record format now in use | Medium |
| awp-workflow | proposed (AWP-001) | Medium |
| engineering-units-standard | drafted as STANDARDS.md §Units | Medium |

## Demo Status

| Demo | Content | Status |
|---|---|---|
| PoC (AWP-001) | Conveyor → 10 cookies → flow wrapper → counter; live bottleneck | ✅ delivered, browser-verified |
| Demo-001 (AWP-002) | Architecture walkthrough: system/module diagrams, data flow, navigation concept | ✅ delivered (`platform/demos/demo-001-architecture.html`) |

## Next AWP (recommendation)

**AWP-003 — Simulation Kernel.** Scaffold the monorepo (needs repo decision),
implement `@dtp/engine` + `@dtp/calc` per EDR-001/003/004, archetype behavior
configs per EDR-002, unit tests vs hand calculations, and create the first two
company capability skills (sim-kernel-standard, transparent-calc-pattern).
Estimated token: **High** (this is the deepest engineering step).
