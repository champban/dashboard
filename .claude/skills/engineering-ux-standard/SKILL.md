---
name: engineering-ux-standard
description: Company engineering-UX standard — the Ten UX Laws, simulation transport spec, transparency drill-down, state visibility, command palette rules. Load before designing ANY user-facing feature, workflow, screen behavior, or interaction for the platform.
---

# Engineering UX Standard

Company Capability CC-004 · v1.0 (AWP-G0) · Authority:
`platform/docs/PRODUCT_EXPERIENCE_SYSTEM.md` (the Constitution)

## Purpose
Features are designed experience-first against the Ten UX Laws, so the
product stays the one "engineers never want to close".

## The Ten Laws (memorize; full text in the Constitution)
1 Flow is sacred (nothing modal during work) · 2 Every number explains
itself · 3 Direct manipulation > panels > dialogs · 4 Keyboard parity via
palette (≤2 keystrokes, palette teaches hotkeys) · 5 State always visible
(one state-color language) · 6 Undo everything, confirm almost nothing ·
7 Speed is a feature (<2 s load, 60 fps, <50 ms controls) · 8 Modes are
lenses, not places · 9 Progressive disclosure (expert density opt-in) ·
10 Offline is normal.

## Workflow (for any new feature)
1. Name the persona + the job (persona table in the Constitution).
2. Place it in the 14-step engineering workflow (USER_JOURNEY.md Part 4) —
   if it doesn't fit a step, question the feature.
3. Write the see/think/feel/learn/do sketch BEFORE any layout.
4. Register every action as a palette command (id, title, hotkey, context) —
   toolbar/menu/touch/AI all dispatch through the command registry.
5. Apply the checklist; then mock; then build.

## Checklist (gate)
- [ ] Zero modals/focus-steals during design or simulation.
- [ ] Every engineering value routes through CalcDrill (formula → inputs →
      assumptions → units → history).
- [ ] All actions in the command registry; hotkey shown; undoable.
- [ ] Machine states visible wherever machines appear.
- [ ] Works offline; degraded states explicit.
- [ ] Simulation controls follow the transport spec (speed ladder 0.1×–256×
      + MAX headless; step; timeline scrub; bookmarks; seed-replay).
- [ ] First-run path considered: what does a day-one user see here?
      (progressive disclosure applied)
- [ ] AI-touching features: propose-as-diff, never silent mutation.

## Example
Demo-004 (`platform/demos/demo-004-experience.html`) implements the journey,
palette, transport bar, and CalcDrill patterns interactively.

## Token optimization
Sketch against this checklist in ~10 lines before building; it prevents the
expensive rework loop (build → violates a Law → rebuild).

## Version / future
v1.0 · Future: automated Law-7 performance budgets in CI; palette command
registry package; UX review template for PRs.
