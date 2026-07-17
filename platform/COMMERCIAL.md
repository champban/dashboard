# COMMERCIAL.md — Commercial Foundation

v1.0 (AWP-003) · Owner: Founder · Status: draft for founder review.
Prices are placeholders for discussion, not decisions.

## Target market

Production-line simulation & digital-twin tooling for discrete manufacturing —
first beachhead: **bakery/food packaging lines**, where incumbent tools
(FlexSim, Plant Simulation) are priced for enterprises (tens of k$/seat/yr)
and require installs that factory IT blocks. Our wedge: **zero-install,
browser-first, transparent engineering math, affordable.**

## Customer segments

| Segment | Pain today | What they buy |
|---|---|---|
| Students / universities | Incumbent licenses unaffordable; lab PCs locked down | Free edition (funnel + future hiring pipeline) |
| Consultants & system integrators | Need fast what-if studies at client sites, on client hardware they can't install on | Professional |
| OEM machine builders | Must show customers line performance pre-sale | Professional / Enterprise |
| SME manufacturers | Excel-based line planning; no simulation at all | Professional |
| Enterprise engineering departments | Have incumbents, need shareable/browser studies + team features | Enterprise |

## Editions (gated via EDR-006 capability registry — inert in v1)

**Free** — full kernel, full transparency, up to ~2 lines / ~15 machines per
project, local files, community machine library. *Rationale: the free tier
must be genuinely useful — it is the marketing.*

**Professional** (per-seat subscription) — unlimited project size, full
machine library, experiment runs (parameter sweeps A/B), report export,
priority updates.

**Enterprise** (per-team) — SSO, cloud sync & team collaboration, floating
licenses, custom machine libraries, API access, support SLA, on-prem option.

## Competitive advantages (defensible)

1. **Zero-install PWA** — incumbents cannot follow quickly; their codebases
   are desktop-native (multi-year rewrite for them, day one for us).
2. **Transparent calculations** — every number shows its formula (CalcValue);
   incumbents are black boxes. Auditable simulation is a genuine differentiator
   for regulated industries (pharma later).
3. **Deterministic, seed-reproducible runs** — simulation results as evidence.
4. **Data-defined machines** — new domain libraries without releases; basis
   for the marketplace.
5. **Price** — 10–50× cheaper than incumbents at Professional tier.

## Value proposition (one sentence)

*"Design and prove your production line in the browser — no install, no black
box, at a price any engineer can justify."*

## Long-term SaaS strategy

v1 static PWA (zero infra cost) → v2 accounts + cloud project sync
(subscription starts) → v3 team collaboration + experiment cloud-runs
(the deterministic kernel runs server-side unchanged — same package) →
v4 marketplace.

## Marketplace vision

Machine definitions are data → third parties (OEMs!) author and certify
libraries of *their own machines* with real parameters. OEMs gain a sales
tool; we gain content, lock-in, and a revenue share. The validation gate in
the Machine Design Playbook becomes the certification standard.

## Plugin ecosystem vision

The capability registry (EDR-006) doubles as the plugin permission surface.
Plugins = definition sets + custom panels speaking the snapshot/command
protocol — they can never corrupt kernel results (EDR-001 boundary), which
makes third-party code safe to admit.
