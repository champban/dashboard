---
name: sim-kernel-standard
description: Company standard for building deterministic, rendering-independent simulation kernels. Load before designing or reviewing any simulation engine, discrete-event model, digital twin core, or when adding machine archetypes / simulation behaviors to @dtp/engine.
---

# Simulation Kernel Standard

Company Capability CC-001 · Version 1.0 (AWP-003) · Proven by `@dtp/engine` v0.1

## Purpose

Every simulation engine this company builds follows one standard, so kernels
are testable, reproducible, reusable across domains, and protected from the
industry's #1 failure mode: simulation logic entangled with rendering.

## The five laws

1. **Pure core.** The kernel imports nothing from DOM/React/Three/storage.
   It must run identically in Node, a Worker, and a server.
2. **Deterministic.** Fixed timestep; ALL randomness from one seeded PRNG
   (mulberry32 + exponential draws). Same config + seed ⇒ bit-identical
   output. `Math.random`, `Date.now`, wall-clock: forbidden inside the core.
3. **Physical honesty.** No hidden infinite buffers. A machine whose
   discharge is blocked stops (finished work holds its slot). Backpressure
   propagates: blocked → upstream fills → source blocks.
4. **Recorder is the only analyst.** Time-in-state, counts, and events are
   accumulated by a Recorder; OEE/throughput/bottleneck are computed there
   and nowhere else. UIs display, never calculate.
5. **Snapshot boundary.** Consumers get immutable JSON-able snapshots and
   send explicit commands. This message protocol is the platform API (UI
   today; AI copilot and cloud runner tomorrow).

## Workflow

1. Define the line/config schema first (machines upstream→downstream).
2. Implement behaviors as archetypes (source/transport/processor/buffer/
   splitter/merger/sink) — real machines are DATA, never new classes.
3. Tick order: downstream first, so freed space propagates within one tick.
4. Write hand-calculation tests BEFORE trusting any output (see checklist).
5. Host in a Worker; UI binds only to snapshots/reports.

## Checklist (gate before merging kernel changes)

- [ ] Determinism test: two runs same seed ⇒ identical fingerprint (JSON of snapshot+report); different seed ⇒ different; reset ⇒ reproduces.
- [ ] ≥1 hand-calculated physics test (e.g. transit time = length/speed ±1 tick).
- [ ] ≥1 throughput/bottleneck test with the constraint computed by hand.
- [ ] Conservation test: goodCount at machine == arrivals at sink (no items invented/lost).
- [ ] Performance budget test with logged ×-real-time factor (v0.1 baseline: 60 machines, 1 h sim ≈ 9 s ⇒ ~400×).
- [ ] `tsc --noEmit` clean, zero core imports from UI packages.

## Example

`platform/packages/engine/` + `platform/packages/engine/test/` is the
reference implementation; `demos/demo-002-src/worker.ts` is the reference
Worker host (~35 lines — hosting must stay that thin).

## Token optimization

Don't re-derive this standard in-session: load this skill, copy the test
patterns from `packages/engine/test/`, and only think about the NEW behavior.
When extending archetypes, read `archetypes.ts` alone — engine.ts/recorder.ts
rarely need changes.

## Future improvements

- Event-queue scheduling for sparse/rare events (current: countdown timers).
- Flow-level (rate-based) sections behind the entity budget (EDR-005).
- Setup/changeover state modeling; shift calendars (OFF state).
- Golden-run regression fixtures (stored fingerprints per seed).
