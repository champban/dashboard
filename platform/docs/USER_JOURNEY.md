# USER_JOURNEY.md

AWP-G0 Parts 3–4 · v1.0 · The first-time experience, minute by minute, then
the full engineering workflow. Persona for the journey: packaging engineer,
corporate laptop, no admin rights, skeptical of simulation tools.

## Part 3 — First User Experience

### First launch (0:00–0:20)
**Sees:** URL opens (no install, no signup wall) → a *running* cookie line:
products flowing, one machine pulsing amber, OEE ticking at 81 %. A single
quiet banner: "This line has a problem. Can you find it?"
**Thinks:** "It already works. Nothing asked me for a license."
**Feels:** curiosity instead of setup dread.
**Learns:** this is a live simulator, not a brochure.
**Does:** watches. (Deliberate: the first user action is *observation* — the
engineer's native move.)

### First minute (0:20–1:00)
**Sees:** hovering the amber machine shows "FW-01 · BLOCKED upstream · queue
14"; the bottleneck badge points at the wrapper. Clicking it opens the
property panel with cycle time and a visible formula: `wrapper max = 60 ÷ 1.5 s = 40 ppm`.
**Thinks:** "It shows the math. And infeed is 50 ppm — that's the mismatch."
**Feels:** respected — the tool assumes engineering literacy.
**Learns:** Law 2 — every number explains itself.
**Does:** finds the bottleneck *by reading, not by being told.*

### First five minutes (1:00–5:00)
**Sees:** a nudge: "try changing cycle time." Dragging 1.5 s → 1.2 s: the
queue drains live, OEE climbs, the amber pulse stops. A quiet toast:
"Throughput +18 %. Here's what changed →" linking a before/after strip.
**Thinks:** "I just fixed a line in four minutes."
**Feels:** the success moment — competence, not tutorial-completion.
**Learns:** parameters are live; simulation reacts; results are measured, not
animated.
**Does:** the first optimization — before ever creating anything.

### First project (5:00–15:00)
Templates gallery ("Start from: biscuit line · flow-wrap line · blank").
Picks a template close to their real line; drags machines from the library;
connects; the validator flags an unconnected port *inline* (no dialog).
**Learns:** layout is drag-drop; validation is continuous, never a gate you
hit at the end.

### First simulation → first success (15:00–30:00)
Presses ▶ on *their* line. Watches states propagate. Opens Mission Control:
bottleneck named, OEE decomposed A×P×Q with formulas. Exports the first
report; copies a **replay link**.
**The success metric for the whole journey:** within 30 minutes the engineer
has produced *shareable evidence about their own line* — the activation
event (> 40 % target, Part J KPI).

### Emotional arc design note
Every stage ends with the *engineer* having done the smart thing — the
product never says "great job!", it shows the numbers that prove it. Pride
of competence, not gamification, is what retains engineers.

## Part 4 — Engineering Workflow (the complete chain)

| # | Stage | Screen (SCREEN_FLOW.md) | Engineer does | Artifact produced |
|---|---|---|---|---|
| 1 | Project | Project Hub | create/open/duplicate; template or blank | project file (versioned JSON) |
| 2 | Layout | Design canvas | place machines, arrange floor | layout geometry |
| 3 | Machine library | Library panel | search, drag in; see teaser items (marketplace) | machine instances |
| 4 | Connections | Design canvas | link ports; splitter/merger routing | line topology |
| 5 | Configuration | Property panel | set parameters (SI, ranges, live formulas) | parameterized line |
| 6 | Validation | inline, continuous | resolve flags (unconnected port, missing param, unit range) | runnable config — ▶ enabled |
| 7 | Simulation | Simulate mode | ▶ · speed ladder · watch states | run + recorded history |
| 8 | Playback | timeline | scrub, bookmark events, step, replay | bookmarked moments |
| 9 | Optimization | property panel + live sim | adjust parameters, watch KPIs react; (v2: sweep experiments) | improved configuration |
| 10 | Comparison | Analytics — compare | A/B runs side-by-side (same seed = honest diff) | decision evidence |
| 11 | Report | Reports | one-click engineering report: line, KPIs, formulas, assumptions | PDF/HTML report |
| 12 | Share | share sheet | replay link (seed-pinned) or file export | link — the growth loop |
| 13 | Cloud | sync (v2, optional) | workspace sync, team access | synced workspace |
| 14 | Marketplace | Marketplace | install libraries/templates; experts: publish | installed content / published SKU |

Loop-back rule: steps 7–10 cycle freely (optimize is the product's heartbeat);
the UI must make 7→9→7 a zero-friction loop — parameter changes never require
stopping the simulation.
