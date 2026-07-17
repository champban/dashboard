# DESIGN_SYSTEM.md

AWP-G0 Part 7 · v1.0 · Tokens and rules for every pixel of the platform.
Demos 001–004 are the living reference of this system.

## Typography

- **One family:** `system-ui, -apple-system, "Segoe UI", sans-serif` — native
  rendering speed, zero font loading, engineering neutrality. No display
  faces anywhere.
- Scale (px): 11 caption/labels · 12 dense UI · 13 body · 15 panel titles ·
  17 screen titles · 20–24 KPI values. Line-height 1.5 body, 1.2 numerics.
- **`font-variant-numeric: tabular-nums` wherever data lives** (KPIs, tables,
  timelines, property values) — jitter-free updating numbers.
- Weight: 400 body, 600 emphasis/labels, 700 KPI values. Never lighter than 400.

## Spacing & grid

- **4 px base unit**; component spacing in 4/8/12/16/24/32.
- Panel paddings 12–16 px; section gaps 24 px; hairline dividers.
- Canvas is infinite; UI panels snap to an 8 px layout grid.
- Border radius: 6 px controls · 8–10 px cards · 12 px surfaces. Never pills
  except status chips.

## Color system

Dark-first (control-room heritage); light mode is a first-class sibling, not
an afterthought. Semantic tokens only — no raw hex in feature code.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--page` | `#0d0d0d` | `#f9f9f7` | app background |
| `--surface` | `#1a1a19` | `#fcfcfb` | panels, cards |
| `--panel` | `#211f1e` | `#f0efec` | inputs, nested |
| `--ink` | `#ffffff` | `#0b0b0b` | primary text |
| `--ink-2` | `#c3c2b7` | `#52514e` | secondary |
| `--muted` | `#898781` | `#898781` | labels, axes |
| `--border` | `rgba(255,255,255,.10)` | `rgba(11,11,11,.10)` | hairlines |
| `--accent` | `#3987e5` | `#2a78d6` | actions, selection, focus |

**Machine-state color language (Law 5 — sacred, identical everywhere):**

| State | Color (dark/light-safe) | Meaning |
|---|---|---|
| RUNNING | `#199e70` green | producing |
| STARVED | `#898781` gray | waiting for input |
| BLOCKED / SETUP | `#c98500` amber | waiting downstream / changeover |
| DOWN | `#d03b3b` red | fault |
| IDLE / OFF | `#52514e` dim | not engaged |

State colors are **reserved**: never used decoratively, never for charts.
Chart series use the validated categorical palette (dataviz standard,
CVD-checked); status≠series separation is enforced.

## Iconography

Geometric, 2 px stroke, 16/20 px grid, filled variants only for states.
Machines get schematic glyphs (top-view silhouettes), not illustrations.
Icon + label for anything status-bearing — color never carries meaning alone.

## Accessibility

- WCAG 2.1 AA: text contrast ≥ 4.5:1; UI components ≥ 3:1 against surface.
- Colorblind safety: state palette validated for CVD (green/amber/red pairs
  carry icon + label + position redundancy); charts use the validated
  categorical order.
- Full keyboard operability (Law 4 gives this for free); visible focus ring
  (`--accent`, 2 px).
- `prefers-reduced-motion`: all UI motion off; simulation *product* movement
  remains (it is data, not decoration) with a static-flow fallback toggle.
- Hit targets ≥ 44 px touch, ≥ 24 px pointer.
- Zoom to 200 % without loss; panels reflow, canvas zooms independently.

## Motion principles

1. Motion is information: product flow, state transitions, panel provenance
   (where did this come from). Nothing else moves.
2. UI transitions 120–180 ms, ease-out, transform/opacity only (60 fps rule).
3. Simulation motion is *data playback*, governed by the speed ladder, never
   by aesthetic timing.
4. State changes flash once (200 ms) then hold — attention without nagging.
5. No looping/idle animations anywhere. A control room is calm.

## Component notes (reference implementations in demos)

- **KPI tile:** label 11 px muted · value 20 px bold tabular · delta with
  ▲▼ + color + sign (never color alone). Every KPI value is a `<CalcDrill>`
  trigger.
- **CalcDrill:** the transparency component (SCREEN_FLOW Part 10) — value,
  formula line, expandable input tree, assumptions footnote. Monospace-free;
  formulas set in the same sans with `×`, `÷` real glyphs.
- **Property row:** label · input (SI value) · unit chip · reset-to-default
  affordance · derived rows show live formula underneath.
- **Panels:** title 11 px uppercase tracking `.08em` muted; drag handle;
  collapse chevron; dock zones highlight on drag.
- **Alarm row:** severity icon + label + machine chip + time (tabular) +
  ack; dedupe count badge ("×12") instead of repeated rows.
