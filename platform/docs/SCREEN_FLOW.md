# SCREEN_FLOW.md

AWP-G0 Part 5 (+6, 8, 9, 10, 11) · v1.0

## Navigation model

One **workspace** with three modes (lenses, Law 8) + global overlays. No
deep page hierarchies — an engineer is always ≤ 1 action from the canvas.

```
Splash (≤1 s, only while loading)
  └─ Project Hub ──open──▶ WORKSPACE ◀── modes: Design · Simulate · Analyze
                              │  overlays (float over any mode):
                              │   ⌘K Command Palette · Library · Properties
                              │   Timeline (global, bottom) · AI rail (v2)
                              └─ global screens: Reports · Marketplace ·
                                 Learning Center · Settings · License · Org · Support
```

## Screen inventory

| Screen | Purpose | Primary KPI of the screen | Main actions | Expected time |
|---|---|---|---|---|
| Splash | load + brand beat | time-to-interactive < 2 s | none | < 2 s, never marketing |
| Project Hub | resume work fast | time-to-open-project | open recent (Enter), new from template, import | < 10 s |
| Dashboard (org, v2) | portfolio health across projects/plants | OEE by line | drill into project | 1–2 min glance |
| Machine Library (panel) | find & place machines | search-to-drag time | search, drag, favorite, "get more →" (marketplace teaser) | < 5 s per machine |
| Canvas — Design | build layout & topology | validation flags = 0 | place, connect, arrange, multi-select, snap | main work surface |
| Property Panel | configure with transparency | — | edit params (SI), see derived formulas live, reset to default | continuous companion |
| Canvas — Simulate | watch the line behave | states + queues visible | transport controls, hover-inspect, follow-item | main work surface |
| Analytics / Mission Control | why is the line performing this way | OEE (A×P×Q) + bottleneck | drill into any number, compare runs, bookmark events | 2–10 min sessions |
| Reports | produce evidence | report generated | generate, edit summary, export, share replay link | < 2 min |
| Marketplace | extend with content | installs | browse, install (data-only), publish (certified) | occasional |
| Learning Center | grow skill in-product | lesson completion → activation | lessons in practice mode, challenges, certification path | opt-in sessions |
| Settings | control data/updates/appearance | — | sync toggle, channel, theme, telemetry opt-in | rare, < 1 min |
| License | procurement clarity | license valid | view signed doc, borrow seat, offline activation | rare |
| Organization | admin (v2) | seats in use | members, roles, workspaces | admin only |
| Support | unstick fast | time-to-answer | search KB (= playbooks), report bug (auto-attaches version+seed), request feature | rare |

## Part 6 — UI layout system

- **Panel grid:** left = Library · center = Canvas · right = Inspector
  (Properties / calc drill / AI rail) · bottom = Timeline + KPI strip.
  All panels: collapsible, resizable, **dockable** to any edge; double-press
  `Tab` = zen mode (canvas only).
- **Floating windows:** any panel tears off (multi-monitor: calc tree on
  monitor 2, mission control on the wall TV). Browser-native via
  `window.open` — no framework exotica.
- **Workspace save:** named layouts per mode, stored in the project +
  user profile ("commissioning layout", "review layout").
- **Responsive tiers:** Ultra-wide → canvas + 2 inspectors + mission-control
  strip · Desktop → full grid · Laptop → panels overlay canvas ·
  Tablet → touch targets ≥ 44 px, panels as sheets, full editing ·
  Mobile → **view/simulate/inspect only** (per founder-pending decision):
  watch a line, read KPIs, share links; no layout editing.

## Part 8 — Command system

- **No ribbon.** (Deliberate anti-Autodesk decision: ribbons optimize
  discovery of 900 commands; we keep the command *surface* small and give
  discovery to the palette.) A minimal toolbar carries only: run controls,
  mode switch, share, and the palette button.
- **⌘K / Ctrl-K Command Palette** is the spine (Linear/VS Code): every
  action is a registered command (id, title, hotkey, context) — the SAME
  registry the toolbar, context menus, hotkeys, touch long-press, future
  voice, and future AI dispatch through. One intent bus, six input skins.
- **Context menus:** right-click a machine = its verbs (configure, duplicate,
  disable, drill into stats). Right-click a number = explain / copy / watch.
- **Hotkeys:** single-key mode switches (D/S/A), Space = run/pause,
  [ ] = speed ladder, F = fit view, ⌘Z undo-everything. Palette rows always
  show the hotkey (teaching, Law 4).
- **Touch:** drag = place/pan, pinch = zoom, long-press = context menu,
  two-finger tap = undo. **Gesture minimalism** — no proprietary gestures to
  memorize.
- **Voice/AI ready:** both are palette clients; nothing new to design later.

## Part 9 — Simulation experience

- **Transport bar:** ⏮ reset · ⏸/▶ · step (one tick | one machine cycle) ·
  speed ladder `0.1× · 0.25× · 1× · 4× · 16× · 64× · 256× · MAX`
  (MAX = headless sprint to end/time-target, then render — the 408×
  kernel makes "simulate a shift in seconds" a headline feature).
- **Timeline:** scrubber with event markers (DOWN=red, REJECT=amber,
  bookmarks=blue); click = jump (replay from seed to that time — cheap
  because deterministic); drag = scrub.
- **Bookmarks:** engineer marks moments ("jam starts here"); bookmarks
  export into reports.
- **Recording = seed + command log.** Replay is *re-simulation*, not video —
  bit-exact (EDR-004), tiny to store, and shareable as a link.
- **Slow motion** (0.1×/0.25×) exists for watching transfer behavior —
  motion is evidence at this speed, decoration above it (Law: motion carries
  meaning).

## Part 10 — Transparent engineering (the drill-down pattern)

Every engineering value, everywhere, supports the same right-click/click
drill: **value → formula → inputs tree (each input clickable, recursively) →
assumptions (stated conventions, e.g. starved→Performance) → units (SI +
display) → history (sparkline over the run) → sensitivity** (v2: one-at-a-time
tornado from experiment sweeps). One component (`<CalcDrill>`), used by
property panel, mission control, reports, and the future AI rail. This
component IS the brand promise rendered in pixels.

## Part 11 — Mission Control (Analyze mode)

Control-room discipline, not dashboard decoration:

- **Top strip — health:** OEE gauge decomposed A×P×Q (each a CalcDrill) ·
  production count vs plan · throughput ppm · waste.
- **Center — the line itself:** live schematic, machines in state colors,
  queue bars, the bottleneck named with a plain-language narrative:
  *"FW-01 limits the line: upstream blocked 34 % of runtime."*
- **Right — event & alarm feed:** severity-ranked (critical/warning/info),
  deduplicated (no SCADA alarm floods), acknowledgeable, each event links to
  its timeline moment.
- **Bottom — trends:** OEE / throughput / queue sparklines over the run;
  machine health table (state %, MTBF observed vs configured); energy panel
  reserved (v2 data model).
- **Wall mode:** one keystroke strips chrome for the factory TV — glanceable
  at 5 m (operator/manager personas served without training).
