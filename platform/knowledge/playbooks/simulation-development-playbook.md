# Simulation Development Playbook

Knowledge Asset KA-001 · v1.0 (AWP-003) · Reusable across all simulation products.

The repeatable procedure for building or extending a simulation. Follow in
order; each step has a "done when".

## 1. Model on paper first
Write the material flow as boxes and arrows with rates: source rate, each
machine's capacity (units/s), transport delays. Compute the theoretical
bottleneck and steady-state throughput by hand.
**Done when:** you can predict the sink count after T seconds before running anything.

## 2. Express the line as data
Write the `LineConfig` (machines upstream→downstream, SI units, seed). No new
code yet — if the line can't be expressed with existing archetypes, STOP and
follow the Machine Design Playbook first.
**Done when:** config validates (engine build throws on unknown outputs/params).

## 3. Predict, run, compare
Run headless (`SimEngine.run(T)`), compare sink counts/throughput to step 1's
hand calculation. Investigate every mismatch — the model is wrong or the hand
calc is; both are findings worth recording.
**Done when:** prediction and simulation agree within startup transient.

## 4. Lock it in as a test
Convert the comparison into a Vitest case with the hand calc in a comment
(pattern: `validation.test.ts`). Add a determinism fingerprint if new
stochastic behavior was introduced.
**Done when:** suite green; hand calc readable in the test.

## 5. Only then, visualize
Bind snapshots to rendering (worker host pattern, Demo-002). Watch for
physical honesty on screen: accumulation where predicted, blocking chains
propagating upstream, no machine holding more than its physical capacity.
**Done when:** what you see matches what step 1 predicted.

## 6. Measure before optimizing
Log the ×-real-time factor (performance test pattern). Optimize only below
budget, and only the measured hot spot.

## Anti-patterns (each cost a real project time)
- Building UI before the math is tested → demo-driven bugs.
- "Temporary" `Math.random()` → irreproducible results, untestable forever.
- Trusting animation as validation — the AWP-003 oven looked fine while
  silently buffering 79 items; the *snapshot numbers* exposed it.
- Tuning parameters until output "looks right" instead of hand-checking.
