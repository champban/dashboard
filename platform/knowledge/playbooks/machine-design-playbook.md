# Machine Design Playbook

Knowledge Asset KA-002 · v1.0 (AWP-003) · How to add machines and domains
without touching engine code.

## Decision tree — do you even need new code?

1. **Is it one of the seven archetypes** (source / transport / processor /
   buffer / splitter / merger / sink) with different parameters?
   → It's a `MachineConfig`. Write data, done. *(A tunnel oven is a
   processor with capacity 12 and cycleTime 12 s; a case packer is a
   processor with batchSize 24; a checkweigher is a processor with
   rejectRate and cycleTime ≈ 0.)*
2. **Is it a composition?** (e.g. a spiral cooler = transport with long
   length; a two-lane wrapper = splitter + 2 processors + merger)
   → Compose configs. Still no code.
3. **Genuinely new physics?** (e.g. robotic pick with kinematics, batching
   by weight not count) → Propose a new archetype via EDR first. New
   archetypes need: behavior spec, state mapping to the 7 standard states,
   hand-calculable acceptance test, and founder-visible justification —
   the archetype count is meant to stay small.

## Parameter design rules

- SI units only (STANDARDS.md); name per convention (`cycleTime`, not `ct`).
- Every parameter needs: physical meaning, sensible default, plausible range.
- Derived values (capacity, transit time) are CalcValues with formulas —
  never pre-computed into parameters.
- Failure behavior: `mtbf`/`mttr` (exponential); quality: `rejectRate`.
  Omit = perfect machine. Perfection must be a visible choice, not a silent
  default of missing data.

## Naming & identity

- Instance ids: TYPE-NN (`TO-01`, `FW-02`) — type codes in STANDARDS.md.
- Definition ids: kebab-case (`tunnel-oven`).
- One machine = one clear physical scope: if you can't say what state RUNNING
  means physically, the machine is two machines.

## Validation gate for every new machine/domain set

- [ ] Hand-calculated throughput test at nominal parameters.
- [ ] Behaves physically when blocked (stops; no infinite internal buffer).
- [ ] Behaves physically when starved (STARVED state, zero output).
- [ ] Conservation: items in = items out + rejects + WIP.
- [ ] Reviewed against 2 other domains: would this definition make sense for
      pharma/beverage with different words? If not, it's over-fitted.

## Domain entry recipe (the platform's business model in one list)

New industry = new definition set: (1) list the 8–15 machines that matter,
(2) map each to archetype + parameters with a domain expert, (3) write the
validation tests from real machine datasheets, (4) ship as a library file.
Engine changes required: zero.
