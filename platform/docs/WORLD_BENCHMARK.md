# WORLD_BENCHMARK.md

v1.0 (AWP-003) · Updated every AWP.
Source honesty: compiled from public product knowledge (docs, published
material) as of my knowledge cutoff — not hands-on testing. Entries to be
re-verified against vendor sites before any marketing claim.

## Incumbent analysis

| Product | Strengths (study) | Weaknesses (our opening) |
|---|---|---|
| **FlexSim** | Mature 3D DES, drag-drop modeling, strong stats/experimenter, big object library | Windows desktop install, enterprise pricing, closed calculations |
| **Siemens Plant Simulation** | Deep manufacturing semantics, hierarchical models, enterprise integration (Teamcenter) | Steep learning curve, cost, installs, closed ecosystem |
| **AnyLogic** | Multi-method (DES+agents+system dynamics), flexible, Java-extensible | Generalist UI overwhelms line engineers; desktop; per-seat cost |
| **Visual Components** | Excellent 3D layout & robotics, OEM component catalogs (eCatalog model we emulate in marketplace) | Desktop, GPU-heavy, pricey; simulation math not transparent |
| **Factory I/O** | Brilliant approachability — PLC training via game-like 3D | Not a real capacity/throughput simulator; niche |
| **NVIDIA Omniverse** | Photoreal USD digital twins, physics, ecosystem momentum | Heavy infrastructure/GPU; twin *visualization* more than line *engineering math* |
| **Blender** | Proof that free + community beats incumbents over a decade | Not a simulator — study its OSS community strategy, not features |
| **Onshape** | THE existence proof: full parametric CAD in a browser took enterprise share on zero-install + collaboration | SaaS-only data residency concerns → our local-first answers this |
| **Figma** | The playbook we follow: browser-first + free tier + multiplayer beat desktop incumbents (Sketch) | — study, nothing to avoid |

## Competitive gaps (what nobody serves today)

1. Zero-install line simulation usable on locked-down corporate PCs — nobody.
2. Transparent, auditable simulation math — nobody (all black boxes).
3. Affordable tier between "Excel" and "€20k/seat" — effectively nobody.
4. OEM-authored certified machine libraries in an open marketplace — Visual
   Components' eCatalog is closest but closed and desktop-bound.

## What we adopt (with credit)

- Figma/Onshape: browser-first + generous free tier + shareable links as the
  growth engine.
- FlexSim: the experimenter concept (parameter sweeps) — planned post-v1.
- Visual Components: OEM catalog model → our marketplace vision.
- Plant Simulation: hierarchical modeling (line-of-lines) — architecture
  already allows it (a line is composable data).

## What we deliberately do differently

- Engineering math transparency (CalcValue) over photorealism — Omniverse
  owns pretty; we own *provable*.
- Determinism as a headline feature (reproducible evidence), not a footnote.
- Data-defined machines instead of scripting (AnyLogic's power, without
  handing users a programming language as the entry bar).

## Innovation ideas harvested this AWP

- "Explain this number" drill-down from any KPI to its CalcValue tree (no
  incumbent has it; cheap for us — the data structure already exists).
- Seed-pinned shareable runs: a URL that reproduces a simulation bit-exactly
  — turns debates into replays. Enabled by determinism + PWA.
- Bottleneck narrative: the upstream-blockage detector (built today) can
  explain *why* in words a junior engineer understands.
