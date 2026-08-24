# L1B Consolidated Owner Decision Packet

Status: **PREPARED — NO PRODUCTION AUTHORITY IMPLIED**

Date: `2026-08-24` (`Asia/Bangkok`)

Purpose: consolidate foreseeable L1B promotion decisions so normal engineering,
test, CI, documentation and evidence work can proceed with minimal Owner
interruptions. This packet does not itself grant any authorization.

The durable readiness gates are in `docs/L1B_PRODUCTION_READINESS.md`.

## Existing decisions already in force

| Decision ID | Requirement | Selected option | Approval boundary | Roadmap item | Branch / PR | Conditions | Status |
|---|---|---|---|---|---|---|---|
| D-L1B-001 | Take over L1B readiness | Codex/ChatGPT primary takeover | Verify actual repo state; do not trust local handover blindly | Readiness takeover | `docs/l1b-promotion-readiness` | Stop on material drift | APPROVED |
| D-L1B-002 | Current delivery scope | Prepare readiness packet, commits/pushes, Draft PR, CI/review remediation | No merge, migration, import, Storage creation, Production mutation, client activation, Auth/secrets/providers, Drive demotion, cleanup or L1C | Readiness packet | current branch | Scope/risk unchanged | APPROVED |
| D-L1B-003 | Execution model | Autonomous continuous execution after scope lock | Normal milestones are informational; stop only for a true requirement blocker, external blocker or unauthorized Critical Gate | Whole approved readiness scope | current branch | Existing approval boundaries remain controlling | APPROVED |
| D-L1B-004 | Owner interaction model | Consolidated questions and conditional approvals | Ask broadly before foreseeable gates; do not re-ask normal technical decisions | Whole roadmap | all later L1B lanes | New evidence may invalidate only the affected authorization | APPROVED |
| D-L1B-005 | Current authority source | Browser + Google Drive remain authoritative | No direct Supabase authority or Drive demotion before separate L1C decision | L1B/L1C boundary | `main` + readiness docs | No later gate silently changes authority | EXISTING PROJECT DECISION |

## Consolidated foreseeable decisions

### Q-L1B-001 — Conditional merge/publication of the readiness-docs PR

**DECISION REQUIRED:**
Whether the Owner wants to pre-authorize merge of the current readiness-docs PR
when its final exact head is proven docs-only and all stated conditions pass.

**RECOMMENDATION:**
Conditionally approve the readiness-docs merge only when:

- base remains the intended current `main` lineage;
- final PR diff contains only L1B readiness/status/decision documentation;
- no runtime, SQL contract, migration, workflow, dependency or generated app
  artifact changes are present;
- exact-head GitHub `verify` passes all applicable jobs;
- changed-file review finds Critical/High/Medium = `0` for the docs-only scope;
- `NO-GO FOR APPLY` and all Production stop boundaries remain explicit;
- merge does not alter application bytes even though GitHub Pages may run after
  a `main` merge.

**WHY:**
This removes a predictable approval stop for a documentation-only closure while
keeping an exact condition set around the automatic GitHub Pages publication.

**IMPACT:**

- Approve conditionally: one fewer Owner interaction; no user-visible runtime
  change when the docs-only condition is satisfied.
- Require exact later approval: strongest SHA-specific control but creates an
  extra interaction for a no-runtime-change merge.

**DEFAULT:**
Conditionally approve the docs-only merge under the conditions above.

**APPROVAL BOUNDARY:**
Permits only squash/merge (or repository-standard merge) of the exact qualifying
readiness-docs PR into `main` and the automatic GitHub Pages run caused by that
merge. Does not permit any Production database/provider/Storage action, import,
client activation, Auth/secret/permission change, cleanup or L1C cutover.

---

### Q-L1B-002 — Fresh post-import B-1/B-2 recovery evidence

**DECISION REQUIRED:**
Whether to conditionally authorize preparation and one evidence-producing run of
a fresh post-import encrypted B-1 backup plus one B-2 isolated restore.

**RECOMMENDATION:**
Approve conditionally, using new temporary ops branches/PRs derived from the
previous reviewed backup/restore patterns, with exact-head source-safety checks
before execution.

B-1 conditions:

- Production project is exactly `qjaywadzvwvcspdsjxth`;
- existing protected secrets are used without exposing or changing their values;
- backup is logical read-only access to Production roles/schema/data;
- plaintext remains ephemeral on the GitHub-hosted runner;
- only an encrypted archive plus non-sensitive digest manifest is uploaded;
- artifact retention remains short and exact run/artifact metadata is recorded;
- any GitHub Environment branch/ref rule change is limited to the exact temporary
  B-1 ref and is removed after the completed attempt when separately authorized;
- no database/schema/Auth/RLS/provider data mutation occurs.

B-2 conditions:

- uses exactly the qualifying fresh B-1 artifact, with no substitution;
- disposable PostgreSQL target only, network-isolated from Production;
- no published database port;
- no Production connection or write;
- no plaintext/output artifact;
- exact reconciliation and cleanup pass;
- at most one run unless a failed attempt has evidence-confirmed root cause and
  the corrected source is separately requalified.

**WHY:**
Historical backup `9479566992` and its restore proof predate the accepted first
L0b import and are expired, so they cannot prove recovery of the current state.

**IMPACT:**

- Approve conditionally: enables recovery evidence to be completed without a
  separate milestone approval for normal source/CI work and the single bounded
  evidence runs.
- Defer: Production apply remains blocked and delivery waits for a later Owner
  session before backup/restore evidence can start.

**DEFAULT:**
Conditionally approve one fresh B-1 and one exact B-2 attempt after exact-head
source-safety gates pass.

**APPROVAL BOUNDARY:**
Permits temporary workflow/source branches, Draft PRs, CI, one qualifying B-1
Production logical-read backup run, and one isolated B-2 restore run. Does not
permit Production SQL/DDL/DML, migration apply, Storage creation, Auth/RLS/secret
value changes, import, client activation, Drive demotion, cleanup/deletion of
resources, or L1C cutover. Any required Environment permission/rule mutation
must stay exactly scoped to the temporary run and must not widen general access.

---

### Q-L1B-003 — Read-only Production preflight and provider-artifact preparation

**DECISION REQUIRED:**
Whether to conditionally authorize the non-mutating work required to freeze the
future exact Production operation.

**RECOMMENDATION:**
Approve:

1. bounded read-only Supabase Production catalog/ledger/aggregate/security-advisor
   inspection with no raw planner content;
2. generation of source-controlled Production migration artifacts from the
   already reviewed L1A and L1B contracts in a suitable non-Production or
   generation-only environment;
3. generation/freeze of the private `mtp-private` Storage operation/policy
   artifact;
4. disposable PostgreSQL/Storage-compatible success and failure-injection tests;
5. exact hashes, rollback/forward-fix notes, targeted 6D review, independent
   review and PR/CI remediation.

Use **two ordered database migration units** — L1A then L1B — plus a separate
Storage resource/policy operation. Keep the client disabled throughout. Do not
claim cross-provider atomicity; prove each intermediate state is safe and
fail-closed.

**WHY:**
Separate DB units preserve the reviewed L1A→L1B contract lineage and make
catalog verification/forward-fix boundaries explicit. Storage is a different
provider resource surface and cannot safely be described as one atomic database
transaction. Since the browser path remains disabled, a schema-only intermediate
state is inert and recoverable.

**IMPACT:**

- Recommended ordered units: more explicit verification points, easier rollback/
  forward-fix reasoning, slightly more release steps.
- One combined DB migration: fewer steps but weakens phase traceability and makes
  a partial contract defect harder to isolate.
- Attempted DB+Storage "atomic" gate: misleading assurance because provider
  resource creation is not the same transaction boundary as PostgreSQL DDL.

**DEFAULT:**
Two targeted DB migration units (L1A → verify → L1B → verify), then separate
private Storage create/policy → verify, with client still disabled.

**APPROVAL BOUNDARY:**
Permits read-only Production evidence, source/artifact generation, local or
throwaway tests, commits/pushes/Draft PRs, CI/security/review remediation and
exact apply-package preparation. Does **not** permit executing the generated
migration/Storage operations on Production, changing Auth/secrets/providers,
reading raw planner content, importing/reconciling owner data or activating the
client.

---

### Q-L1B-004 — Promotion-artifact PR merge before Production apply

**DECISION REQUIRED:**
Whether the eventual source-controlled migration/Storage artifact PR may be
conditionally merged to `main` before the Production apply.

**RECOMMENDATION:**
Do **not** pre-authorize this merge yet. Prepare the PR, exact-head CI, hashes,
6D and independent review first, then include its merge decision in the same
final Critical-Gate session as the exact Production apply.

**WHY:**
Unlike the current readiness-docs PR, a promotion-artifact merge introduces
migration/permission bytes into the production branch. Even if it does not by
itself run SQL, it materially changes the release package and may trigger GitHub
Pages CI/publication. The final artifact hashes are not known yet.

**IMPACT:**

- Defer to final gate (recommended): preserves exact-hash release control and
  still meets the target of only one additional Owner session.
- Pre-authorize now: fewer interactions but weaker evidence-binding because
  exact generated artifacts do not yet exist.

**DEFAULT:**
Reserve this merge for the final exact Critical-Gate session.

**APPROVAL BOUNDARY:**
No merge authority is granted by this recommendation.

---

### Q-L1B-005 — Final Production DB + Storage apply

**DECISION REQUIRED:**
Whether to pre-authorize Production L1A/L1B schema and private Storage creation
before exact generated bytes/hashes and fresh B-1/B-2 evidence exist.

**RECOMMENDATION:**
**Do not pre-authorize now.** Use the single allowed final irreversible Owner
session after all evidence is frozen.

The final packet must name at minimum:

- exact repository/branch/base/HEAD and changed files;
- exact L1A migration blob/SHA-256 and provider operation name;
- exact L1B migration blob/SHA-256 and provider operation name;
- exact Storage bucket/policy artifact hashes and intended provider operation;
- target project `qjaywadzvwvcspdsjxth`;
- fresh B-1/B-2 run/artifact/custody evidence;
- Production preflight fingerprints and bounded aggregates;
- failure-injection/atomicity evidence and safe intermediate-state proof;
- exact-head CI, targeted 6D and independent review results;
- apply order, catalog verification, stop conditions and forward-fix/rollback
  procedure.

**WHY:**
This gate changes Production schema/RLS/permissions and creates a private Storage
resource. Exact artifacts do not yet exist, so an advance approval would be less
precise than the repository's established exact-operation safety model.

**IMPACT:**

- Final exact approval (recommended): one final Owner interaction with complete
  evidence and strong auditability.
- Pre-approval now: faster only nominally, but materially increases risk of
  approving bytes/behavior that have not yet been generated or reviewed.

**DEFAULT:**
One final exact Critical-Gate decision after all prerequisites pass.

**APPROVAL BOUNDARY:**
No Production apply, bucket/policy creation, RLS/permission change or provider
mutation is authorized until that later exact approval.

---

### Q-L1B-006 — Post-apply client activation, reconciliation and L1C

**DECISION REQUIRED:**
Whether these later product/authority transitions should be bundled with the
schema/Storage apply.

**RECOMMENDATION:**
Keep them explicitly separate and **out of the current promotion scope**.

The already published L1 client must remain disabled after schema/Storage apply.
No new client publication is required if its bytes are unchanged; verify that
the live client remains disabled instead. Any later activation must have its own
bounded acceptance/reconciliation evidence. L1C authority cutover remains a
separate product decision after an observation window.

**WHY:**
Schema availability is reversible and inert while the client is off. Activation
changes data flow, conflict handling and user-visible behavior; L1C changes the
source of truth. Combining them removes the safest rollback boundary.

**IMPACT:**

- Separate (recommended): safest recovery, clearer user behavior, stronger
  reconciliation evidence.
- Bundle: fewer operational steps but much higher data-integrity and rollback
  risk.

**DEFAULT:**
Schema/Storage apply → catalog verification → keep client off → later explicit
activation/reconciliation → observation → separate L1C decision.

**APPROVAL BOUNDARY:**
Current and future schema-apply approval must not imply client activation,
owner-data reconciliation, Drive demotion, cleanup or L1C cutover.

## Recommended consolidated response

When the Owner is ready to authorize the next non-Production preparation phase,
the recommended single response is:

`APPROVE ALL RECOMMENDED DEFAULTS AND CONDITIONAL ACTIONS IN Q-L1B-001 THROUGH Q-L1B-003, SUBJECT TO THEIR STATED APPROVAL BOUNDARIES. ACCEPT THE RECOMMENDED DEFERRAL IN Q-L1B-004 AND Q-L1B-005 TO ONE FINAL EXACT CRITICAL-GATE SESSION. ACCEPT Q-L1B-006 AS OUT OF CURRENT PROMOTION SCOPE.`

Until that response is given, only the already-approved readiness/Draft-PR scope
in D-L1B-001 through D-L1B-004 is active.
