# Global Engineering Principles

Version 1.0 · Received 2026-07-17 · **Mandatory for every project.**
Company-wide document; lives in `platform/docs/` only until a dedicated
company knowledge repo exists.

> Verbatim founder document below. Platform-specific consequences are recorded
> in `EDR.md` (EDR-006) and the AWP workflow; conflicts, if ever found, are
> raised to the founder — never silently resolved.

## Mission

Build world-class engineering products that become global benchmarks — not
just another software application. Every engineering, architecture, and
business decision is evaluated against this mission.

## Global target

Products shall be: best-in-class · engineering-first · AI-native ·
browser-first · mobile-ready · enterprise-ready · affordable · lean ·
extensible · commercially successful.

## Benchmark rule

Before implementing any major feature, benchmark against current world-class
software (FlexSim, Siemens Tecnomatix Plant Simulation, AnyLogic, Visual
Components, NVIDIA Omniverse, Factory I/O, Blender, Onshape, Figma, Autodesk,
modern SaaS engineering platforms). Never copy — study, understand, improve.
If our approach is better, explain why; if theirs is better, recommend
adopting similar principles.

**Working form (agreed):** each major-feature AWP carries a ~half-page
benchmark note — what the leaders do, what we adopt, what we deliberately do
differently and why — based on public documentation. Depth on demand.

## Global user experience

Simple enough for beginners, powerful enough for experts. Target users:
students, small companies, medium manufacturers, global enterprises,
consultants, system integrators, OEM machine builders, engineering
departments. One platform, different capability levels.

## Installation pain point — highest architectural priority

Corporate computers block EXE installs and admin rights; IT approval takes
weeks. Therefore: browser-first PWA — no installer, no admin privileges,
Windows/macOS/Linux, mobile and tablet, offline after installation, automatic
updates when online, local-first data ownership.
*(Platform status: already decided as TDR T10 — confirmed, elevated to
highest priority.)*

## Lean software principles

Every feature must justify its existence. Prefer small, fast, modular,
maintainable; low memory/CPU/GPU/network/storage. Avoid unnecessary
complexity.

## Lean data principles

Local-first architecture, efficient storage, incremental save, lazy loading,
streaming where appropriate. Memory usage shall be measurable. Large
simulations must remain responsive.

## AI principles

Use AI where it creates measurable value, never because it is fashionable.
AI should reduce engineering effort, improve engineering quality, explain
engineering calculations, generate documentation, assist troubleshooting,
recommend optimization.

## Commercial principles

Every product designed for commercialization: Free / Professional /
Enterprise editions. Future-ready for subscription, floating license, team
collaboration, cloud services, marketplace, plugin ecosystem.
*(Platform consequence: declarative edition gating from day one — EDR-006.)*

## Global success metric

Every release moves closer to "the best engineering web platform in the
world." If a feature does not improve engineering value, do not build it.
