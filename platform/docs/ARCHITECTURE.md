# Engineering Digital Twin Platform — System Architecture

AWP-002 · Version 1.0 · Status: DRAFT (pending founder approval)

> Temporary home: this `platform/` folder lives in the `dashboard` repo until the
> dedicated private platform repository is approved. Migration = move the folder.

## A. Overall System Architecture

The platform is a **hexagonal (ports & adapters) architecture**: a pure,
dependency-free engineering core in the center, with every environment-specific
concern (rendering, storage, input, cloud, AI) pushed to the edges as a
replaceable adapter. This is the single property that lets one codebase support
browser, desktop, mobile, offline, cloud, and AI **without redesign** — new
targets add adapters, they never touch the core.

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATION SHELL                        │
│         (React UI · panels · routing · PWA · offline)           │
│                                                                 │
│  ┌───────────┐ ┌───────────┐ ┌────────────┐ ┌───────────────┐   │
│  │ 2D Layout │ │  3D View  │ │ Dashboard  │ │ Properties /  │   │
│  │  Editor   │ │ (Three.js)│ │ (OEE/KPI)  │ │ Transparent   │   │
│  │ (Canvas)  │ │  adapter  │ │            │ │ Calculations  │   │
│  └─────┬─────┘ └─────┬─────┘ └─────┬──────┘ └──────┬────────┘   │
│        └─────────────┴──── read-only ──────────────┘            │
│                    SimulationSnapshot                           │
├──────────────────────── Worker boundary ────────────────────────┤
│                     SIMULATION CORE (pure TS)                   │
│   @dtp/engine   deterministic kernel · clock · events · stats   │
│   @dtp/machines archetype library · data-defined machines       │
│   @dtp/calc     transparent calculation framework               │
│   @dtp/project  project model · versioned schema · migration    │
├─────────────────────────────────────────────────────────────────┤
│                      ADAPTERS (replaceable)                     │
│   Storage: LocalFile (v1) │ Cloud sync (v2) │                   │
│   AI copilot hook (v2)    │ Hardware/OPC-UA twin link (future)  │
└─────────────────────────────────────────────────────────────────┘
```

Rules that make it work:

1. The core has **zero dependencies** on DOM, React, Three.js, or storage. It
   compiles and runs in Node, a Worker, or (later) a server unchanged.
2. The UI never reads engine internals. It receives immutable
   `SimulationSnapshot` messages and sends `SimCommand` messages
   (start/pause/setParam/…). This message protocol *is* the API — the future
   cloud runner and AI copilot speak the same protocol.
3. Rendering is a consumer, never a participant: 2D editor and 3D view draw the
   same snapshot; deleting both would not affect a simulation result.

## B. Module Architecture

| Module | Responsibility | Depends on |
|---|---|---|
| `@dtp/engine` | Deterministic simulation kernel: clock, scheduler, machine state machines, product movement, recorder | nothing |
| `@dtp/machines` | Machine archetypes + the data-defined machine library (oven, wrapper, …) | engine, calc |
| `@dtp/calc` | Transparent calculations: units, conversions, `CalcValue` (value + unit + formula + inputs) | nothing |
| `@dtp/project` | Project file model, zod schema, versioning/migration, (de)serialization | calc |
| `apps/simulator` | React shell, panels, worker host, rendering adapters, PWA | all above |
| `docs/` | Standards, EDRs, status — the knowledge base | — |

Dependency direction is strictly downward; `@dtp/calc` and `@dtp/engine` are the
long-lived IP and must never import from higher layers.

## C. Simulation Engine Architecture (internal flow)

Deterministic **hybrid discrete-event / fixed-timestep** kernel:

- Fixed timestep `Δt = 10 ms` of simulated time; wall-clock decoupled
  (sim speed ×1/×4/×32/max).
- Discrete events (cycle complete, breakdown, setup done) scheduled on an event
  queue keyed by sim time; continuous behavior (belt transport) integrated per
  tick.
- All randomness (failure times, quality rejects) from one **seeded PRNG** —
  identical seed + project ⇒ identical results, bit for bit. This is what makes
  simulations testable, comparable, and trustworthy.

Per-tick pipeline:

```
commands in (UI/AI/cloud)
  → apply commands
  → fire due discrete events
  → update transports (move products, resolve accumulation/blocking)
  → step machine state machines (IDLE/RUNNING/STARVED/BLOCKED/DOWN/SETUP)
  → recorder: time-in-state, counters, event log
  → (at snapshot rate, e.g. 30 Hz) emit SimulationSnapshot
```

The recorder is the analytics source of truth: OEE, throughput, bottleneck
detection, and the timeline all derive from recorded state — dashboards never
compute engineering numbers themselves.

Scalability rule (the 10× answer): products are simulated **item-level** up to a
configurable entity budget; beyond it, sections of the line switch to
**flow-level** (rate-based) simulation with identical aggregate math. Item and
flow sections coexist on one line.

## D. Machine Object Standard

Every machine is data, not code. Three layers:

```ts
// 1. DEFINITION — static, lives in the library, versioned
MachineDefinition {
  id: "tunnel-oven";            // kebab-case, unique
  version: "1.0.0";
  archetype: "processor";       // source | transport | processor | buffer | splitter | combiner | sink
  ports: { in: 1, out: 1 };
  parameters: ParameterSpec[];  // { key, label, unit, min, max, default, step }
  derived: FormulaSpec[];       // transparent calcs, e.g. bakingTime = length / speed
  behavior: BehaviorConfig;     // archetype-specific (cycleTime | capacity | …)
  footprint: { length, width }; // m, for layout & 3D placeholder
}

// 2. INSTANCE — lives in the project file
MachineInstance {
  instanceId: "TO-01";          // TYPE-NN per naming standard
  definitionId: "tunnel-oven";
  definitionVersion: "1.0.0";
  pose: { x, z, rotY };         // m, m, rad — floor plane
  parameterValues: Record<key, number>;
}

// 3. RUNTIME STATE — lives only inside the engine, never persisted
MachineRuntime {
  state: MachineState;          // see standards
  timers, counters, buffers, currentItems
}
```

Adding a new machine to the platform = writing one `MachineDefinition` (JSON/TS
object) + choosing an archetype. New *domains* (pharma, beverage) are new
definition sets — zero engine changes. Archetype behaviors are the only coded
parts and there are seven of them, ever, until proven insufficient.

## E. Product Object Standard

```ts
ProductType {
  id: "cookie";
  name; unit: "piece" | "kg" | "L";
  dims: { length, width, height };   // m
  mass: number;                      // kg
  attributes: AttributeSpec[];       // e.g. temperature °C, moisture %
}

ProductItem {                        // runtime, engine-only
  uid: number;                       // deterministic sequence
  typeId: "cookie";
  location: { kind: "machine" | "link", id, offset }  // offset in m along element
  attrs: Record<string, number>;     // evolve through process (oven raises temp)
  contents?: ProductItem[];          // containment tree
}
```

Transformation is **containment**: flow wrapper consumes 1 cookie → emits 1
`wrapped-pack{contents:[cookie]}`; case packer consumes 24 packs → 1 case; the
palletizer stacks cases. Genealogy is free — any pallet can be traced to its
cookies. At flow-level simulation, `ProductItem` collapses to counts per type;
the containment ratios still drive the math.

## F. Data Flow

```
USER (edit layout, set parameters, press Run)
  │  SimCommand messages
  ▼
SIMULATION  (@dtp/engine in Web Worker — deterministic, pure)
  │  SimulationSnapshot (immutable, ~30 Hz)   +   RecorderReport (on demand)
  ▼
VISUALIZATION  (2D editor & 3D view render the same snapshot)
  ▼
DASHBOARD  (OEE / throughput / bottleneck / timeline — from RecorderReport only)
  ▼
STORAGE  (@dtp/project serializes layout + parameters + seed → versioned JSON)
  │        v1: local file (download / File System Access API, offline-safe)
  └──────▶ v2: cloud sync adapter — same file format, different transport
```

One-way data flow; the only writes back into the engine are explicit
`SimCommand`s. A saved project + seed reproduces any reported result exactly.

## G. Project Folder Proposal (platform repo — PROPOSAL ONLY, not created)

```
engineering-digital-twin/
├── package.json                  # npm workspaces monorepo
├── packages/
│   ├── engine/       src/ test/  # @dtp/engine  — kernel (zero deps)
│   ├── machines/     src/ test/  # @dtp/machines — archetypes + library
│   ├── calc/         src/ test/  # @dtp/calc   — units + transparent calcs
│   └── project/      src/ test/  # @dtp/project — schema + persistence
├── apps/
│   └── simulator/                # React + Vite app (worker host, panels, PWA)
├── docs/
│   ├── ARCHITECTURE.md  STANDARDS.md  TDR.md
│   ├── edr/                      # engineering decision records
│   └── awp/                      # work packages, as received
├── demos/                        # numbered founder demos (demo-001, …)
├── PROJECT_STATUS.md             # single source of truth
└── .claude/skills/               # company capabilities (reusable AI skills)
```
