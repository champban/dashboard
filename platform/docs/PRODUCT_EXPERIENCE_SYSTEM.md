# PRODUCT_EXPERIENCE_SYSTEM.md — The Product Experience Constitution

AWP-G0 · v1.0 · Status: awaiting founder approval — **no production UI before approval.**
Companion docs: DESIGN_SYSTEM.md · SCREEN_FLOW.md · USER_JOURNEY.md

## Part 1 — Philosophy

**One sentence:** *Evidence at the speed of thought.*

**What makes us unique** (each maps to shipped architecture, not aspiration):

1. **No black boxes.** Every number explains itself — click any KPI and see
   formula → inputs → assumptions (CalcValue, EDR-003). No competitor does this.
2. **Replayable truth.** Deterministic runs (EDR-004) mean a simulation is
   *evidence* you can share as a link that replays bit-exactly.
3. **Zero friction to first insight.** No install, no signup wall, no empty
   canvas: first launch opens a running line with a visible bottleneck.
4. **The engineer stays in command.** AI and automation propose; the engineer
   disposes. Always.

**Why engineers enjoy it:** time-to-first-insight under 5 minutes; keyboard
speed (Linear-class); interactions at 60 fps; nothing interrupts a running
simulation; undo covers everything, so exploration is fearless.

**How beginners become experts:** the product teaches in place — formula
drill-downs teach the engineering math; the command palette shows hotkeys as
you use it (VS Code pattern); progressive disclosure keeps day-one screens
simple while expert density is one toggle away; Academy lessons run inside
real (sandboxed) projects, never videos-about-the-product.

**How experts become evangelists:** share-links that replay exactly (the
Figma loop); published machine libraries with their name on them; Certified
Engineer status that has market value; a product that respects their time
becomes the one they recommend.

### The Ten UX Laws (every screen is audited against these)

1. **Flow is sacred.** Nothing modal, blocking, or focus-stealing while an
   engineer is designing or a simulation is running.
2. **Every number can explain itself.** If a value can't show its formula, it
   doesn't ship.
3. **Direct manipulation first**, panels second, dialogs last.
4. **Keyboard parity.** Any action ≤ 2 keystrokes away via the command
   palette; the palette teaches the shortcut.
5. **State is always visible.** The machine-state color language (RUNNING/
   STARVED/BLOCKED/DOWN…) is identical everywhere: canvas, panels, reports.
6. **Undo everything; confirm almost nothing.** Reversible actions never ask
   "are you sure" — only destructive ones do (delete project).
7. **Speed is a feature.** < 2 s cold load; 60 fps canvas; sim controls
   respond < 50 ms.
8. **Modes are lenses, not places.** Design/Simulate/Analyze view the same
   project; switching never relocates or de-selects the engineer's context.
9. **Progressive disclosure.** Beginner default is calm; expert density
   (more panels, more numbers) is opt-in and remembered.
10. **Offline is normal.** No feature silently requires the network; degraded
    states are explicit, never mysterious.

### Benchmark synthesis (study, never copy)

| Source | What we take |
|---|---|
| Apple | defaults over settings; hardware-grade polish expectations |
| Figma | zero-install + share-link as the growth engine; multiplayer later |
| Notion | teach-in-place; templates as onboarding |
| **Linear** | speed cult + command palette as the product's spine |
| Onshape | browser engineering credibility; versioned documents |
| VS Code | panel/dock system; palette; everything-is-a-command architecture |
| Blender | workspace tabs per task; expert density done right (avoid its pre-2.8 hostility) |
| Tesla UI / SCADA / control rooms | glanceable state, strict alarm hierarchy, dark high-contrast, no decorative motion |
| NASA mission control | KPI wall discipline: every pixel answers "is it healthy, and if not, why?" |

## Part 2 — Personas

| Persona | Goals | Pain today | Daily workflow | KPIs they live by | Preferred interface | Training level |
|---|---|---|---|---|---|---|
| Student | learn line design, portfolio | tools unaffordable, locked lab PCs | coursework, experiments | grades, understanding | laptop browser | none → Academy |
| Operator | know line status, what to do next | opaque systems, alarm floods | shift monitoring | uptime, count | tablet/panel, view-only | low; needs clarity |
| Maintenance engineer | predict/prevent stops | no data on failure impact | work orders, RCA | MTBF/MTTR, availability | desktop + tablet on floor | medium |
| Packaging engineer (**primary v1**) | throughput, changeovers, buffer sizing | Excel guesses, consultant tax | line studies, what-ifs | OEE, ppm, waste | desktop, keyboard-heavy | high domain, new to sim |
| Project engineer | deliver line upgrades on time/budget | vendor claims unverifiable | specs, vendor evaluation | capex ROI, schedule | desktop + reports | high |
| Automation engineer | validate control logic & flow | sim tools ignore controls | PLC work, commissioning | cycle accuracy | desktop, wants API | expert |
| Factory manager | hit daily numbers | can't see *why* line underperforms | reviews, escalations | OEE, output, waste | dashboard, mobile glance | low product training |
| Plant manager | capex decisions, capacity | decisions on vendor slides | monthly planning | ROI, capacity, cost/unit | reports + mission control | low |
| Global engineering (enterprise) | standards across plants | every plant models differently | governance, reviews | benchmark OEE across sites | desktop + admin | high |
| Consultant | fast credible studies at client sites | can't install anything on client PCs | client engagements | billable insight/day | laptop browser, offline | expert |
| OEM builder | sell machines with proof | claims not trusted | pre-sales engineering | win rate | desktop + marketplace publishing | high |
| System integrator | de-risk integration projects | integration surprises | proposals, FAT/SAT | project margin | desktop, templates | high |
| CEO (SMB) | confidence before spending | "trust me" engineering | approve/reject capex | payback period | one shared report/replay link | none |

Design rule: **v1 optimizes the packaging engineer and the consultant** (they
convert); operator/manager get view-only excellence (they spread it);
everyone else must never be *blocked*, merely not yet optimized.

## Part 12 — AI Experience (design; implementation post-v1 per founder decision)

The assistant is an **Engineering Coach**, never an autopilot.

- **Roles:** Explain ("why is OEE 81 %?" → walks the CalcValue tree in
  words) · Recommend ("wrapper cycle 1.4 s would lift throughput ~6 %") ·
  Teach (links every explanation to an Academy lesson) · Optimize (proposes
  parameter sets as *diffs*) · Predict ("buffer will saturate in ~40 min").
- **The contract:** AI proposals arrive as reviewable diffs with assumptions
  and confidence stated; the engineer applies, edits, or dismisses. AI never
  mutates a project silently. Every AI claim about numbers cites the same
  CalcValue tree a human would see — the AI is bound by Law 2 like everyone.
- **Architecture-ready today:** the assistant speaks the existing command
  protocol and reads snapshots/reports; a UI slot (right rail) is reserved.
  Zero engine changes when it lands.

## Part 13 — Learning Experience

- **Interactive lessons** run in Practice Mode: a sandboxed project with a
  goal ("find and fix the bottleneck; target OEE ≥ 85 %") — graded by the
  recorder's real numbers, not quiz answers.
- **Academy** = learning paths built from the playbooks (single source);
  fundamentals free, advanced paths paid (Part A streams).
- **Challenge Mode**: timed scenarios with leaderboards (community energy,
  zero content cost — challenges are project files).
- **Knowledge graph**: lessons ↔ features ↔ certification requirements —
  "learn" buttons in-product deep-link into the exact lesson.
- **Certification** gates marketplace publishing (ABP-001) and feeds the
  partner network.

## Part 14 — Community Experience

Template sharing, machine libraries, and simulation sharing are all **the
same mechanism**: a data file + optional replay link, published through the
marketplace (ABP-001 Part I) with ratings and certified-publisher badges.
Forum/discussion deferred to v3 — community forms around artifacts first.
Partner libraries (OEM) get official badging and co-marketing.

## Part 15 — Product Identity

- **Brand personality:** *calm precision* — a trustworthy instrument, not an
  excited app. Think oscilloscope, not social feed.
- **Visual DNA:** dark-first control-room surfaces; state colors as the only
  loud elements; hairline borders; tabular numerals everywhere data lives;
  generous negative space (Apple) around dense engineering clusters (SCADA).
- **Interaction DNA:** immediate, reversible, explainable. Nothing animates
  unless motion carries meaning (product flow, state change).
- **Engineering DNA:** SI units, visible formulas, versioned everything,
  deterministic always.
- **Brand promise:** **"No black boxes."**
- **Brand voice:** precise, plain, quietly confident; never hype ("408× real
  time" not "blazingly fast"); admits limits explicitly.
- **Brand emotion:** the feeling after a good instrument tells you the truth:
  *"now I know — and I can prove it."*
