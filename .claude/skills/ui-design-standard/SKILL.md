---
name: ui-design-standard
description: Company UI design standard — tokens, layout/panel system, typography, color, motion, accessibility. Load before building or styling ANY user interface, screen, panel, demo page, or component for the platform.
---

# UI Design Standard

Company Capability CC-003 · v1.0 (AWP-G0) · Authority: `platform/docs/DESIGN_SYSTEM.md`

## Purpose
Every UI surface (product, demos, mockups, docs pages) looks and behaves like
one instrument. No per-screen taste decisions.

## Workflow
1. Read `platform/docs/DESIGN_SYSTEM.md` (tokens) + `SCREEN_FLOW.md` (layout
   model) for the surface you're building.
2. Copy the token block from the latest demo (`platform/demos/`) — never
   re-invent hex values; semantic tokens only in feature code.
3. Build with the panel grid (left library · center canvas · right inspector ·
   bottom timeline/KPI) unless the screen is a global page (hub, settings).
4. Data display: tabular-nums, KPI tile spec, CalcDrill for any engineering
   value, machine-state colors ONLY for machine states.
5. Charts: load the `dataviz` skill — series colors come from its validated
   palette, never from state colors.

## Checklist (gate)
- [ ] Only semantic tokens (`--surface`, `--ink-2`…); zero new hex values.
- [ ] tabular-nums on every updating number.
- [ ] State colors used exclusively for machine/system states; icon+label
      accompany any status color.
- [ ] Keyboard: focusable, visible focus ring, hotkey in tooltip/palette row.
- [ ] Contrast AA; hit targets ≥44 px touch / ≥24 px pointer.
- [ ] Motion: 120–180 ms transform/opacity only; nothing loops;
      `prefers-reduced-motion` respected.
- [ ] Dark AND light verified (screenshot both) before shipping.

## Example
`platform/demos/demo-004-experience.html` is the current reference
implementation (tokens, panels, palette, KPI tiles, transport bar).

## Token optimization
Copy the `<style>` token block + component CSS from the newest demo, delete
what the screen doesn't use. Don't re-derive the system.

## Version / future
v1.0 · Future: extract tokens to `packages/ui-tokens` when the React app
lands (AWP-004); light-mode demo parity; icon set build.
