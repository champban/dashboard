# Engineering Decision Records

Format per record: Decision · Reason · Alternative · Impact.
EDRs record *engineering* choices; technology choices live in TDR.md.

---

## EDR-001 — Simulation is physically separated from rendering

**Decision.** The simulation kernel is a pure TypeScript package with zero DOM,
React, or Three.js imports, executed in a Web Worker. Renderers consume
immutable `SimulationSnapshot` messages; the UI sends `SimCommand` messages.

**Reason.** Entangled sim/render code is the primary failure mode of simulator
projects: untestable math, frame-rate-dependent results, unusable on servers.
A process boundary makes the separation physical — it cannot erode silently.

**Alternative.** Same-thread module separation by convention. Rejected: every
deadline pressure erodes conventions; a worker boundary cannot be crossed by
accident.

**Impact.** Engine is unit-testable against hand calculations, reusable in
cloud/CLI contexts, and the message protocol becomes the platform API used
later by AI copilot and cloud sync. Cost: snapshot serialization discipline.
Validated by the AWP-001 proof of concept.

---

## EDR-002 — Machines are data-defined instances of seven archetypes

**Decision.** Engine code implements only generic archetypes — source,
transport, processor, buffer, splitter, combiner, sink. Every real machine
(tunnel oven, flow wrapper…) is a `MachineDefinition` data object: parameters,
transparent formulas, ports, footprint. Projects store instances referencing
definitions by id + version.

**Reason.** The platform's value is entering new domains cheaply. If machines
are code, every domain costs engine work; if machines are data, a pharma
library is authored, not programmed.

**Alternative.** One class per machine type. Rejected: N machines × M domains
of bespoke code, untestable combinatorially, and third parties could never
author machines.

**Impact.** New machine ≈ one definition object. New domain ≈ one definition
set. Engine test surface stays constant at seven behaviors. Cost: archetype
behavior configs must be designed carefully (the hard thinking lands in AWP-003).

---

## EDR-003 — Every derived value is a transparent CalcValue

**Decision.** Derived engineering values cross module boundaries as
`CalcValue { value, unit, formula, inputs }`, so any UI surface can display the
number *with its formula and the inputs that produced it*.

**Reason.** "No hidden assumptions" is a core product requirement and the main
differentiator from black-box simulators. Engineers must be able to audit every
number; auditability must be structural, not a documentation promise.

**Alternative.** Plain numbers + separate documentation. Rejected: docs drift
from code; the UI could not render live formulas.

**Impact.** Properties panels, dashboards, and future reports get "show your
work" for free; unit errors become type errors. Cost: small object overhead —
kept out of per-tick hot paths (recorder aggregates, then wraps).

---

## EDR-004 — Deterministic hybrid kernel: fixed timestep + discrete events, seeded PRNG

**Decision.** Simulated time advances in fixed 0.01 s ticks; discrete events
queue by timestamp; transport integrates per tick; all randomness flows from
one seeded generator. Same project + seed ⇒ bit-identical results at any sim
speed on any machine.

**Reason.** Reproducibility is what makes simulation results *evidence*:
comparable across parameter changes, testable in CI, debuggable by replay.
Pure event-driven DES handles conveyors and accumulation poorly; pure
fixed-step handles rare events wastefully — the hybrid takes both strengths.

**Alternative.** Pure DES (rejected: continuous transport/accumulation is the
heart of packaging lines), variable timestep (rejected: results depend on
frame rate — disqualifying), unseeded randomness (rejected outright).

**Impact.** CI can assert exact simulation outputs; A/B parameter studies are
apples-to-apples; sim speed is a pure multiplier. Cost: 0.01 s resolution
bounds event precision — acceptable for machines with ≥0.1 s cycle times.

---

## EDR-005 — Item-level and flow-level simulation coexist behind one entity budget

**Decision.** Products simulate as individual items up to a configurable entity
budget; beyond it, line sections degrade gracefully to rate-based flow
simulation with identical aggregate mathematics. Containment ratios (24 packs
per case) drive both modes.

**Reason.** The 10× question: item-level gives genealogy and exact blocking
behavior but cannot scale to a full plant on a tablet; flow-level scales
indefinitely but loses per-item stories. Choosing either alone caps the
platform.

**Alternative.** Item-only (rejected: tablet performance ceiling), flow-only
(rejected: no traceability, weak micro-behavior), decide later (rejected: this
choice shapes the product/location model — deferring it is the redesign risk
AWP-000 forbids).

**Impact.** v1 ships item-level (well within budget); the product/location
standard is already flow-compatible, so scaling later is an optimization, not a
redesign.

---

## EDR-006 — Edition gating is declarative from day one

**Decision.** Commercial tiers (Free / Professional / Enterprise, per Global
Engineering Principles v1.0) are enforced through a single capability
registry: each gated feature declares `requiredTier` in one place, and UI/
engine consult the registry. No tier conditionals scattered through feature
code. v1 ships with every feature marked Free and the registry inert.

**Reason.** Editions are a founder-mandated commercial requirement.
Retrofitting licensing into an ungated codebase is one of the classic
expensive rewrites; declaring the seam now costs near zero.

**Alternative.** Add licensing when monetization starts. Rejected: by then
every panel and command would need auditing and touching — weeks of risky
work versus one registry today.

**Impact.** Monetization becomes configuration plus a license-check adapter
(cloud, v2) rather than a rewrite. The registry also doubles as the future
plugin permission surface. Cost: one small module and the discipline to route
gates through it.
