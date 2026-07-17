# Product Experience Playbook

Knowledge Asset KA-003 · v1.0 (AWP-G0) · How any feature goes from idea to
approved experience. Pairs with capabilities CC-003 (ui-design-standard) and
CC-004 (engineering-ux-standard).

## The pipeline (experience-first, code-last)

1. **Persona + job.** One sentence: "*{persona}* needs to *{job}* so that
   *{outcome}*." No persona → no feature.
2. **Workflow placement.** Which of the 14 workflow steps does it serve
   (USER_JOURNEY.md)? Features that serve no step are scope creep — park them.
3. **Experience sketch.** Write see/think/feel/learn/do for the happy path
   AND the first-time path. ~10 lines. This is the cheapest place to find
   design mistakes.
4. **Law audit.** Run the Ten-Laws checklist (CC-004). Any violation needs a
   written justification or a redesign.
5. **Command registration.** List the commands (id, title, hotkey, context)
   the feature adds. If an action can't be a palette command, its design is
   probably tangled.
6. **Mock.** Lo-fi in an existing demo file's token system (CC-003). Founder
   sees the mock, not a spec.
7. **Gate review.** Approve/iterate on the mock. Only then implement.
8. **Evidence.** Ship with the measurable claim it was designed for
   ("reduces time-to-bottleneck to X") and verify it in the demo.

## First-experience rules (from the AWP-G0 journey design)

- The first user action should be **observation of something already
  working** — never an empty canvas, never a form.
- Success moments are **shown in numbers, not congratulated** — engineers
  trust measurements, resent gamification.
- Every teaching moment happens **in place** (drill-downs, palette hotkey
  hints, inline validation) — never a separate manual.
- The activation target: shareable evidence about the user's own problem in
  ≤ 30 minutes.

## Anti-patterns

- Screen-first design ("let's add a page for X") — always job-first.
- Settings as a fix for indecision (Apple rule: pick the right default).
- Onboarding tours that narrate UI ("this is the toolbar") — replace with a
  problem the user solves.
- Dashboard decoration — every mission-control pixel answers "healthy? if
  not, why?" or it goes.
- "We'll make it accessible later" — later never comes; the checklist is
  part of the gate.
