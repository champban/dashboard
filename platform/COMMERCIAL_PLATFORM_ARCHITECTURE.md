# COMMERCIAL_PLATFORM_ARCHITECTURE.md

ABP-001 · v1.0 · Status: DESIGN (implementation deliberately deferred; the
point is that the engineering core NEVER needs restructuring for any of this)

**The one structural rule:** everything commercial is an *adapter plane*
around the engineering core (EDR-001 hexagon). Licensing, identity, payment,
sync, marketplace — all of them consume the same two seams that already
exist: the **capability registry** (EDR-006) and the **snapshot/command
protocol**. If a commercial feature ever requires touching `@dtp/engine`,
the design is wrong.

```
┌────────────────────────── COMMERCIAL PLANE (adapters, v2+) ─────────────┐
│  Identity · License Service · Payment (MoR) · Sync · Marketplace · AI   │
│        issues / verifies signed capability documents (licenses)         │
└───────────────▲──────────────────────────────▲──────────────────────────┘
                │ feature registry (EDR-006)   │ snapshot/command protocol
┌───────────────┴──────────────────────────────┴──────────────────────────┐
│                    PRODUCT (PWA)  —  works fully offline                 │
│                    ENGINEERING CORE — never changes                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## PART A — Global Business Model

**Model:** product-led growth (PLG). The free product is the marketing; the
funnel is: free user → shares a project link → colleague becomes free user →
team hits Free limits → self-serve Professional → org needs SSO/collab →
Enterprise. Sales staff appear *late* (Enterprise only), keeping cost/customer
near zero (Part J).

**Revenue streams, in activation order:**

| # | Stream | Activates | Notes |
|---|---|---|---|
| 1 | Professional subscriptions (self-serve) | v2 | core engine of revenue |
| 2 | Enterprise licenses (SSO, floating, support) | v2+ | higher touch, higher ACV |
| 3 | Marketplace rev-share (30 %) | v3 | machine libraries, industry packs, templates |
| 4 | Training & certification | v3 | playbooks → courses → certified-engineer program |
| 5 | OEM licensing / white label | v3+ | machine builders embed the simulator with their catalog |
| 6 | Premium AI services (metered) | v3+ | copilot, auto-optimization — priced above AI cost |
| 7 | Consulting | bootstrap only | founder-led early; deliberately NOT a scale business |

**Target markets:** as COMMERCIAL.md (beachhead: food/bakery packaging lines;
expansion by industry pack, not by rewrite).

**Partner strategy:** three partner types, one asset each — **OEMs** author
certified machine libraries (their sales tool, our content); **system
integrators** deliver projects on our platform (their margin, our seats);
**universities** get Education free (our future users and certification
audience).

**Training / Certification business:** knowledge assets (playbooks) are the
seed content. Learning path: Simulation Basics → Line Design → OEE Analysis →
Certified Platform Engineer (paid exam, renewable). Certification also gates
marketplace *publisher* status — quality control and revenue in one mechanism.

**White label:** an OEM edition = branding config + a curated library + an OEM
license document. Architecturally it is a *theme + registry preset*, nothing
more — that is what makes it sellable at high margin.

---

## PART B — License Platform

**Core decision (EDR-007): a license is a signed, offline-verifiable
capability document.** Ed25519-signed JSON stating who, what edition, which
feature flags, seats, validity, grace. The client verifies the signature with
an embedded public key — **no phone-home required**, which makes offline and
air-gapped factories first-class citizens, not exceptions.

```json
{ "licenseId": "L-2027-000123", "type": "subscription",
  "edition": "professional", "features": ["experiments", "export.report"],
  "org": "O-...", "seats": 5, "validFrom": "...", "validUntil": "...",
  "graceDays": 14, "binding": { "mode": "user" }, "sig": "ed25519:..." }
```

| License type | Mechanism |
|---|---|
| Free | implicit — no document needed; registry defaults |
| Trial | time-boxed subscription doc, one per org (server-tracked) |
| Starter / Professional / Enterprise / Education | edition field + feature flags |
| Subscription | short validity + auto-reissued doc on renewal webhook |
| Perpetual | `validUntil: null` + `maxVersion` pin (JetBrains-style fallback: keep forever the last version released during your subscription) |
| Node-locked | `binding: {mode:"device", fingerprint}` — offline activation: device generates a request file, portal returns signed doc (sneakernet-compatible) |
| Floating | seat-lease broker (server): client borrows a lease doc with TTL |
| License borrowing | floating lease with extended TTL (e.g. 30 days) for travel/offline — an explicit, auditable action |
| Grace period | `graceDays` honored client-side after expiry with visible countdown; never a hard cliff mid-work |
| OEM / Internal | edition + redistribution/telemetry terms in doc |

Renewal, revocation: docs are short-lived (30 d) and silently re-fetched when
online; revocation = stop reissuing. Offline customers by definition accepted
longer validity at purchase. No DRM arms race: the license protects honest
customers' procurement needs; the free tier absorbs the rest.

---

## PART C — Feature Gate Engine

Extends EDR-006 from "tier registry" to the full commercial gate. **One
registry, one evaluator, zero hardcoded edition logic anywhere** (enforced in
code review + a lint rule banning `edition ===` outside the registry module).

```ts
interface FeatureSpec {
  id: 'experiments.sweep';        // dot-namespaced feature ID
  minEdition: 'professional';     // free | starter | professional | enterprise
  dependencies?: FeatureId[];     // gates compose; missing dep = disabled
  licenseFlags?: string[];        // fine-grained overrides (OEM deals)
  visibility: 'hidden' | 'teaser' | 'enabled';  // teaser = visible, locked, upsell
  surfaces: { ui: boolean; api: boolean; mobile: boolean; ai: boolean; plugin: boolean };
}
// the ONLY question any code may ask:
can(featureId, ctx: { license, user, device, surface }): Decision
```

- `surfaces` answers Part C's API/Mobile/AI/Plugin access in one field —
  e.g. a plugin can be granted `experiments.sweep` on `plugin` surface only.
- `teaser` visibility is the upsell mechanism: locked features are *seen*,
  with the edition that unlocks them — Figma/Notion practice.
- v1 status: registry exists with every feature `free`+`enabled`; evaluator
  trivial. Cost today ≈ zero; retrofit cost avoided ≈ weeks.

---

## PART D — Identity Platform

Hierarchy: **Organization → Workspace → User (Role) → Device/Activation.**
Projects belong to workspaces; licenses attach to org or user; floating seats
pool at org level.

- Roles v1 design: `owner`, `admin`, `engineer`, `viewer` — permissions are
  *feature registry entries* (`project.edit`, `org.billing`…), so RBAC and
  feature gating are one system, not two.
- **Local-anonymous first:** v1 has no accounts at all — identity is an
  adapter added in v2; project files never embed identity, so nothing
  migrates. Sign-in: email magic link + OAuth (Google/Microsoft); Enterprise:
  SSO/SAML + SCIM provisioning (v3).
- Machine/Device: activation record = device fingerprint + license binding;
  **online activation** (portal issues doc) and **offline activation**
  (request-file / response-file exchange) share one code path — the signed
  document; only transport differs.

---

## PART E — Payment Platform

**Strategy: Merchant of Record (MoR) first.** Paddle or Lemon Squeezy handles
global VAT/GST, tax remittance, invoices, and card+wallet+local payment
methods — this is the only sane option for a small company selling globally
(handling VAT in 40 jurisdictions ourselves would be an unforced error).

- **Stripe** enters later for Enterprise flows the MoR handles poorly
  (custom contracts, multi-year, bank transfer) — behind the same internal
  `PaymentProvider` interface so providers are swappable adapters.
- **Thailand** (home market): MoR covers cards; direct PromptPay/Thai QR via
  Stripe Thailand or Omise when local volume justifies it. Thai
  tax-invoice requirements handled at MoR/accounting level, not in product.
- **Enterprise procurement:** quote → PO → invoice → bank transfer →
  manually issued license doc. Deliberately human in the loop until volume
  demands automation — a signed license document is issuable by a human with
  a CLI, which is exactly why the license design (Part B) matters.
- **Renewal:** provider webhook → license service reissues doc → client picks
  it up silently. Dunning (failed payments) = provider feature, grace period
  = ours (Part B), so a card hiccup never bricks an engineer mid-shift.

---

## PART F — Update Platform

- **PWA delivery:** hash-named immutable assets + service worker; an update
  downloads in background and applies atomically on next launch ("update
  ready" toast, never a mid-session swap). Effectively **delta updates for
  free** — unchanged chunks stay cached.
- **Channels:** `stable` and `beta` (opt-in). Staged rollout by percentage at
  the CDN level.
- **Rollback:** previous bundle kept by the service worker; one-click revert +
  remote kill-switch file consulted at launch (tiny, cached, fails open).
- **Version compatibility — the engineering-grade part:**
  - project files carry `schemaVersion`; zod-validated **migration chain**
    upgrades stepwise (v1→v2→v3…); migrations are pure, tested functions.
  - **The app never silently rewrites a project**: opening a newer file than
    the app understands → clear message, never data loss; upgrading a file →
    explicit save.
  - kernel results are version-stamped: a stored result replays bit-exactly
    on the same kernel version (determinism ⇒ honest cross-version diffs).
- **Offline customers** update when they choose, by loading the new PWA once
  online — or, for air-gapped sites, a downloadable self-contained bundle
  (same artifact, different transport).

---

## PART G — Customer Success

| Element | Design |
|---|---|
| Onboarding | first-run guided build of a real line (the Demo-002 cookie line) — engineer sees a bottleneck found in < 5 min; "aha" = OEE panel with formulas |
| Help center / KB | docs site generated from `platform/docs` + `knowledge/` — playbooks ARE the knowledge base (single-source, no drift) |
| Training | learning paths from playbooks (Part A); free tier gets fundamentals, paid tiers get full path |
| Certification | paid, renewable, gates marketplace publishing |
| Support | Free: community + KB · Pro: email, 2-day SLA · Enterprise: named contact, priority SLA. Support DEFLECTION is architectural: transparent calculations remove the #1 simulation support question ("why is this number what it is?") |
| Feedback / bugs / feature requests | in-app dialog → structured payload (app version, kernel version, anonymized config on consent) → issue tracker; public roadmap voting later |

---

## PART H — Data Ownership

**Principle: the customer's engineering data is the customer's.** This is a
sales weapon against SaaS-only competitors (Onshape objection) — write it
into marketing verbatim.

- **Local-first:** projects are local files, readable JSON, documented
  schema. The product is fully functional with zero cloud.
- **Export = the format itself** (open, versioned); plus report/CSV exports.
  No hostage data, ever.
- **Cloud sync (v2, optional):** end-to-end encrypted blobs; server stores
  ciphertext + metadata only; keys derived org-side. Backup/restore =
  file copy today, versioned snapshots under sync.
- **GDPR:** minimal PII by design (identity plane only), telemetry opt-in and
  anonymous, deletion = delete account row + ciphertext blobs. Data
  residency option (EU region) at Enterprise tier.
- **Enterprise security:** SSO/SCIM, audit log of org events, on-prem/
  air-gapped deployment possible *because* the product is a static bundle +
  signed licenses (no mandatory backend) — most SaaS competitors cannot say
  this sentence.

---

## PART I — Passive Income Strategy

The compounding asset: **machines are data (EDR-002), therefore content
scales without us.**

| Product line | What it is | Who authors |
|---|---|---|
| Machine Library Marketplace | certified `MachineDefinition` sets with real parameters | OEMs (their sales tool), certified engineers |
| Industry Packs | curated library + templates + standards per vertical: **Food · Packaging · Automotive · Pharma · Semiconductor · Warehouse** | us + partners |
| Simulation Templates | complete reference lines ("biscuit line 4000 pph") | community + certified publishers |
| Engineering Calculation Packs | domain CalcValue formula sets (conveyor power, OEE variants, energy) | us + certified publishers |
| Training Marketplace | courses on the learning-path rails | trainers (rev-share) |
| Certification | exam + renewal fees | us |
| Premium AI | copilot/optimization, metered | us (margin over AI cost) |

Mechanics: 70/30 rev-share (Shopify-normal), certification-gated publishing
(quality moat), one-click install (a pack is a data file — the plugin
permission surface from EDR-006 keeps third-party content safe by
construction: content cannot corrupt kernel results because content is data,
not code).

Sequencing honesty: marketplace works only after there are users — build the
*seams* now (definition format is already the marketplace SKU format), the
*store* at v3.

---

## PART J — Owner KPI

| KPI | Definition | Early target |
|---|---|---|
| MRR / ARR | recurring revenue | the north star from v2 |
| Net revenue retention | expansion − churn | > 100 % |
| Free→Pro conversion | activated free users → paid | 2–5 % (PLG normal) |
| CAC | acquisition cost per customer | ≈ 0 self-serve (PLG); sales only Enterprise |
| Activation rate | new user reaches "bottleneck found" moment | > 40 % |
| License growth | active seats, by edition | tracked from v2 |
| Marketplace / training revenue | streams 3–4 | from v3 |
| Support cost / customer / mo | tickets × cost | < $2 |
| Hosting cost / active user / mo | CDN + sync | < $0.50 (static PWA ≈ pennies; sync is blobs) |
| AI cost | metered, paid tiers only | always priced above cost |

**Owner operational cost < $10 / active customer / month — how the
architecture guarantees it:** the product costs ~$0 to serve (static files,
local compute — the customer's own CPU runs the simulations); sync is cheap
blob storage; support is deflected by transparency + KB; payments/tax are
outsourced to the MoR; AI is metered and gated to paid tiers. The dominant
residual cost is support time — which is why every support-deflecting design
choice (CalcValue, playbooks-as-KB, determinism for reproducible bug reports)
is also a business choice.

---

## PART K — Value Ratio (1000×)

**Customer value ≥ $100,000:** a mid-size packaging line produces
$5–50 M/year. One percentage point of OEE on a $10 M line ≈ $100 k/year.
The product's core loop — find the bottleneck, prove the fix before capex —
routinely moves *several* points, and prevents six-figure mistakes in line
design (wrong machine bought = $250 k+). The $100 k claim is per-decision,
not per-lifetime; it is conservative.

**Customer cost ≤ $100/month:** achievable *because of Part J* — near-zero
marginal cost lets us price at 10–50× below incumbents and still hold
software-class margins.

**How the architecture supports 1000×:**
1. **Customer's hardware does the work** (local-first kernel) → our COGS ≈ 0
   → low price without margin damage.
2. **Determinism turns output into evidence** → engineers can defend
   $100 k decisions with a replayable URL → the value side is credible, not
   marketing.
3. **Transparency removes the consultant tax** → incumbents' value is
   gatekept by experts; ours is auditable by the line engineer directly.
4. **Data-defined domains** → each new industry pack multiplies addressable
   value at content cost, not engineering cost.
5. **PLG + MoR + static delivery** → the cost side stays flat as users grow.

---

## PART L — World-Class Commercial Audit

| Company | Best practice to adopt | What to avoid |
|---|---|---|
| Autodesk | vertical industry editions | edition sprawl & license complexity that spawns "Autodesk license consultant" as a job |
| Adobe | seat management UX for orgs | subscription-only backlash → we keep a perpetual-fallback option |
| Microsoft | enterprise procurement fluency (PO/invoice/EA) | — |
| **JetBrains** | **fair subscription with perpetual fallback — ADOPTED in Part B**; honest pricing builds decade-loyalty | — |
| **Shopify** | marketplace economics: partners earn more than the platform → ecosystem gravity | — |
| **Figma** | freemium + share-link growth loop — ADOPTED (seed-pinned run URLs are our version) | post-acquisition pricing distrust |
| Notion | template community as free content engine | — |
| Atlassian | self-serve + published pricing; sales-free until high ACV | support quality erosion at scale |
| Siemens | OEM/partner channel depth; industry credibility | opacity, install burden, price-on-request — our entire wedge |
| Dassault | platform lock-in via data (learn the mechanism) | practicing it against customers — our open format is the counter-position |

**Competitive advantages that fall out of this architecture:** offline-first
licensing (air-gapped factories — nobody in SaaS serves them well), open data
format (procurement's objection killer), auditable engineering math
(regulated industries), COGS ≈ 0 (price disruption without margin suicide).

**Future opportunities:** certified-engineer network as a services
marketplace (Atlassian-partner-like); insurance/audit use of deterministic
replays; OEM co-marketing bundles ("simulate our oven before you buy it").
