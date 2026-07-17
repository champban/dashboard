# CUSTOMER_VALIDATION_SYSTEM.md

AWP-004 · v1.0 · Owner: Founder (Claude drafts, customers decide).
Purpose: replace our biggest risk — zero real users — with a repeatable
validation machine. Personas: see PRODUCT_EXPERIENCE_SYSTEM.md Part 2
(13 personas; validation targets the two v1 primaries below).

## Validation targets & their pains (hypotheses to TEST, not truths)

| Persona | Pain hypothesis | Kill criterion (what disproves it) |
|---|---|---|
| Packaging engineer (SME food) | line decisions made in Excel/gut; can't justify capex; can't install software | 5 interviews where they're satisfied with current tools |
| Consultant / integrator | can't run studies on client sites; incumbents too costly per engagement | consultants unwilling to pay ≥ $50/mo after trial |

## ROI model (the sales math — every number checkable by the customer)

```
Line value/year  = throughput (ppm) × 60 × hours/yr × margin per piece
1 OEE point      ≈ line value × 1 %
Example: 40 ppm × 60 × 6000 h × $0.02 ≈ $2.9 M/yr → 1 OEE pt ≈ $29 k/yr
Tool cost        ≈ $1 k/yr/seat  →  payback = days, not quarters
```
The Demo/AWP-004 loop *demonstrates* the model live: advisor measured
+3.4 ppm from one parameter — the report prints the evidence.

## Interview script (30 min, problem-first — never demo first)

1. "Walk me through the last time you changed something on a line. How did
   you decide?" (listen for: Excel, vendor claims, gut)
2. "What did that decision cost / risk?" (quantify)
3. "What tools did you try? Why did they not stick?" (installs? price? trust?)
4. "If you could prove a change before making it, what would that be worth?"
5. ONLY THEN: 10-min product session — the 30-minute loop compressed;
   watch silently, note every hesitation (those are the UX bugs).
6. Close: "Would you use this next week on a real line? What's missing?"
   — the only answer that counts is a concrete line and a date.

## Beta program (design)

- **Gate:** 10 external users complete the 30-min loop on THEIR line data.
- Cohort 1 (weeks 1–4): 5 friendly engineers + 3 consultants + 2 students;
  weekly 20-min calls; every session recorded as a journey funnel
  (launch → first insight → own line → report → share).
- Exit criteria to public beta: activation ≥ 40 %, loop-completion ≥ 60 %,
  ≥ 3 users return unprompted in week 2.

## Early-adopter program

First 25 real-line users get: lifetime Professional discount (50 %),
named credit in the machine-library marketplace, direct founder channel.
In exchange: 1 case study + reference data (the missing validation asset —
real machine rates to test the kernel against).

## Success metrics (tracked in PROJECT_STATUS from beta start)

| Metric | Target |
|---|---|
| Activation (first insight ≤ 30 min) | ≥ 40 % |
| Loop completion (report exported) | ≥ 60 % of activated |
| Week-2 unprompted return | ≥ 30 % |
| "Would you pay?" at $50–100/seat/mo | ≥ 5 yes with a name and a line |
| Reference datasets collected | ≥ 3 real lines |
