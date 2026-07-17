# Engineering Standards — Draft 1

AWP-002 · applies to all platform code, documents, and simulations.
Rule zero: **SI internally, converted only at the display edge.** No module
ever stores or computes in display units.

## Units

| Quantity | Internal | Display default | Note |
|---|---|---|---|
| Time | second (s) | s / min / h auto | sim timestep Δt = 0.01 s |
| Length | metre (m) | m (mm for product dims) | |
| Speed | m/s | m/s (belts), m/min optional | |
| Mass | kilogram (kg) | kg / g auto | |
| Temperature | °C | °C | deliberate SI exception — industry convention; kelvin adds no accuracy here |
| Product rate | items/s | pieces per minute (ppm) | ppm is display-only |
| Angle | radian | degree | |
| Energy (future) | joule | kWh | |

Every value crossing a module boundary carries its unit via `@dtp/calc`'s
`CalcValue { value, unit, formula?, inputs? }` — raw naked numbers are allowed
only inside a single function.

## Coordinate System

Right-handed, **Y up** (Three.js convention): X → right, Z → toward viewer,
floor is the **XZ plane**. Machine pose = `{ x, z, rotY }`. Product flow along a
machine's local +X. Origin: south-west corner of the factory floor. All in
metres.

## Time

- Simulated time starts at t = 0 s per run; wall-clock mapping is display-only.
- Fixed timestep 0.01 s; discrete events may fall between ticks and are
  processed in timestamp order at the next tick boundary.
- Determinism: same project + same seed ⇒ identical results. Any code breaking
  this is a defect.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Machine instance | TYPE code + 2-digit index | `TO-01`, `FW-02`, `CP-01` |
| Machine definition id | kebab-case | `tunnel-oven` |
| TS types/classes | PascalCase | `MachineDefinition` |
| variables/functions | camelCase | `beltSpeed` |
| files/folders | kebab-case | `flow-wrapper.ts` |
| packages | `@dtp/<name>` | `@dtp/engine` |
| docs | SCREAMING or numbered | `STANDARDS.md`, `EDR-001` |

Machine type codes (v1): IN infeed/depositor · CV conveyor · TO tunnel oven ·
CS cooling spiral · FW flow wrapper · CW checkweigher · MD metal detector ·
CP case packer · PL palletizer · BF buffer.

## Machine States

Exactly seven; every machine is in exactly one at any instant:

| State | Meaning | OEE bucket |
|---|---|---|
| `OFF` | not scheduled to run | excluded (not planned time) |
| `IDLE` | planned, awaiting start | Availability loss |
| `SETUP` | changeover/warm-up | Availability loss |
| `RUNNING` | producing | value time |
| `STARVED` | ready, no input available | Performance loss |
| `BLOCKED` | ready, downstream full | Performance loss |
| `DOWN` | fault/breakdown | Availability loss |

Starved/blocked are classified as *performance* losses because their root cause
is line design, not the machine — this attribution is a deliberate, documented
choice and will become configurable when a customer's OEE convention differs.

## OEE Definitions

Per machine and per line, computed from recorded time-in-state — never
hand-assembled in the UI:

```
plannedTime   = total − OFF
runTime       = plannedTime − DOWN − SETUP − IDLE
Availability  = runTime / plannedTime
Performance   = (idealCycleTime × totalCount) / runTime      (capped at 1.0 with a flag)
Quality       = goodCount / totalCount
OEE           = Availability × Performance × Quality
```

`idealCycleTime` comes from the machine definition at its configured speed —
transparent and shown in the calculations panel. Line OEE is reported at the
line's constraint (bottleneck) machine, plus per-machine breakdown.

## Product Units

Discrete products in `piece`; bulk (dough, liquid) in `kg` or `L` at flow-level.
Containment ratios are integers (1 cookie/pack, 24 packs/case) and belong to the
machine's parameters, not hard-coded.
