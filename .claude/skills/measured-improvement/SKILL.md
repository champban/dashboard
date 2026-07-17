---
name: measured-improvement
description: Company standard for improvement/optimization advisors — never advise from heuristics alone; simulate candidate changes headlessly with the deterministic kernel and report measured deltas. Load when building any recommendation, optimization, what-if, AI-suggestion, or auto-tuning feature.
---

# Measured Improvement (What-If Advisor Pattern)

Company Capability CC-005 · v1.0 (AWP-004) · Reference: simulator app
`apps/simulator/src/worker.ts` (runWhatIf) + `app.tsx` (two-phase suggest).

## Purpose
Advice users can defend: every suggestion ships with a measured delta from
a real simulation run, not an estimate. This is the platform's AI moat —
deterministic kernel + 400× speed makes verification cheaper than guessing.

## The pattern
1. **Baseline first, at horizon.** Run the CURRENT config headlessly for
   the evaluation horizon (e.g. 600 s) with the live parameters and the
   project seed. Use ITS bottleneck/KPIs — never the live early-run state
   (transients lie; we shipped that bug and fixed it same-day).
2. **Generate candidates from the baseline constraint** using parameter
   specs (respect min/max bounds; only actionable engineering changes).
3. **Simulate every candidate** with identical seed + horizon (apples to
   apples: same stochastic history where unaffected).
4. **Report measured deltas** (Δthroughput, ΔOEE, new bottleneck) beside
   the baseline. Include the horizon in the UI copy.
5. **Propose-as-diff** (Constitution AI contract): user applies explicitly;
   apply is undoable; applied suggestions are listed in the report.

## Checklist
- [ ] Baseline simulated at the same horizon/seed as candidates.
- [ ] Candidates bounded by ParamSpec min/max; labels show old → new.
- [ ] Results show measured Δ AND the post-change bottleneck (constraint
      migration is the insight users miss).
- [ ] No suggestion auto-applies; apply is undoable.
- [ ] UI copy says "measured, not guessed" semantics (horizon visible).
- [ ] Runs off the UI thread (worker); busy state while simulating.

## Token optimization
Copy runWhatIf + the two-phase suggest flow; only the candidate-generation
rules change per domain.

## Future
Parameter sweeps (grid over 2 params → heatmap); multi-change optimization
(greedy constraint-chasing until target OEE); confidence via multi-seed
replication for stochastic lines.
