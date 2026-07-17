---
name: transparent-calc
description: Company standard for transparent engineering calculations — every derived value carries its formula, unit, and inputs. Load when writing any engineering computation (OEE, capacity, rates, physics), any properties/dashboard panel, or reviewing code that returns engineering numbers.
---

# Transparent Engineering Calculation

Company Capability CC-002 · Version 1.0 (AWP-003) · Proven by `@dtp/calc` + Demo-002

## Purpose

"No hidden assumptions" is the product differentiator: engineers must be able
to audit every number the platform shows. Auditability is structural — a
derived value that cannot show its work does not cross a module boundary.

## The rule

Any derived engineering value returned by a module is a `CalcValue`:

```ts
{ value: 0.816, unit: 'ratio',
  formula: 'OEE = A × P × Q',
  inputs: { A: {value:.913, unit:'ratio'}, ... } }
```

- `formula` is human-readable and names the same terms as `inputs`.
- Units come from the shared `Unit` type; SI internally, `toSI`/`fromSI`
  only at the display edge (STANDARDS.md §Units).
- Naked numbers are legal only inside a single function body.
- UIs render CalcValues (value + expandable formula); they NEVER compute
  engineering results themselves — computation lives with the Recorder/core.

## Workflow

1. Write the formula on paper with units first; hand-compute one example.
2. Implement returning `calc(value, unit, formula, inputs)`.
3. Add a test asserting the hand-computed example AND that `formula`/`inputs`
   are present (see `oee.test.ts` — "every OEE component is a transparent
   CalcValue").
4. Surface it: properties panel / dashboard shows `formula = value`
   (Demo-002's "Transparent calculations" box is the reference rendering).

## Checklist

- [ ] Value has correct SI unit; display conversion only at the edge.
- [ ] Formula string names every input; inputs carry their own units.
- [ ] Hand-calculated test case in the suite.
- [ ] Deliberate conventions documented next to the formula (e.g. "starved/
      blocked count against Performance, not Availability").
- [ ] Rendered somewhere the engineer can see it — a formula nobody can
      display is a hidden assumption with extra steps.

## Example

`@dtp/calc` (`packages/calc/src/index.ts`) + `Recorder.report()` OEE
construction (`packages/engine/src/recorder.ts`) + the live formula panel in
`demos/demo-002-src/main.ts` (`renderReport`).

## Token optimization

The pattern is three calls: `calc()`, a test, a `<div>` that prints
`cv.formula = cv.value`. Copy from the references above instead of designing
each time.

## Future improvements

- Dimension-checked units (compile-time m/s × s = m).
- CalcValue dependency graph → clickable "explain this number" drill-down.
- Auto-generated calculation reports (PDF/HTML) from the CalcValue tree.
