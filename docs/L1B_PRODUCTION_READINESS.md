# L1B Production Readiness

Status: **NO-GO FOR APPLY — READINESS PACKET ONLY**

Decision baseline: `2026-08-24` (`Asia/Bangkok`)

This packet stages the evidence and gates required to promote the already merged,
disabled L1A/L1B source contracts toward Production. It does **not** authorize or
perform a migration, Storage bucket/policy creation, planner import, Production
mutation, client activation, Auth/secret/provider change, Drive demotion,
reconciliation, cleanup, or L1C authority cutover.

Browser + Google Drive remain authoritative until a separately approved and
Production-verified L1C cutover.

## Exact source boundary

- Repository: `champban/dashboard`
- Readiness base: `main@33ff8f508d3ba81a1427ee9649c395533a884614`
- Readiness base tree: `c42e8e465bc8c57cb813e0eea2c89dea25fb315b`
- L1B source PR #91 exact head:
  `287d493211abd21f2dc4d5887d83b27f2d4ee0e4`
- L1B source tree: `e2d21724980bc3985e5a41a42d35ffa1263f3f96`
- L1B source merge: `main@b807d67aef520959383fe80ff0c6dbc0a7b94e0d`
- L1B publication-closure merge:
  `main@33ff8f508d3ba81a1427ee9649c395533a884614`
- PR #91 exact-head verify run `32709008940`: **PASS, 6/6 jobs**.
- Post-merge verify run `32729590661`: **PASS, 6/6 jobs**.
- GitHub Pages run `32729589662`: **PASS** for the disabled source publication.
- PR #92 closure verify run `32741260917`: **PASS, 6/6 jobs**; the independent
  release-gate review for that bounded disabled-source closure returned PASS.

The source contracts remain deliberately outside `supabase/migrations/`:

- `supabase/contracts/l1a_direct_todo.sql`
- `supabase/contracts/l1b_planner_parity.sql`
- `supabase/contracts/l1b_private_storage.sql`

Production already contains the L0b provider ledger record
`20260823055451_l0b_data_foundation`. L1A/L1B have not been applied as Production
migrations, and the `mtp-private` Storage bucket has not been created by this
readiness work. The published browser bridge remains disabled (`enabled=false`,
mode `off`).

This remote packet was rematerialized from durable repository state during an
explicit takeover. It does not claim byte identity with any inaccessible
local-only handover commit. GitHub branch/commit evidence created by this packet
is the durable source of truth for the current readiness lane.

Any change to the L1A/L1B SQL, Storage contract, RLS/ACL, client enablement,
dependencies, workflow, Production baseline, or provider semantics invalidates
the affected evidence and requires a targeted refresh before apply.

## Why historical B-1/B-2 evidence does not qualify

The previous refreshed recovery evidence predates the accepted first L0b manual
import:

- refreshed B-1 artifact `9479566992` was created on `2026-08-22` and expired on
  `2026-08-23T17:33:07Z`;
- refreshed B-2 isolated restore run `32618003121` passed for that artifact;
- the first accepted owner import ran later, on `2026-08-23T21:29:12+07:00` to
  `21:29:13+07:00`, and created the accepted L0b aggregate state.

Therefore PR #79 / PR #83 recovery evidence is historical only for this L1B
promotion. It must not be reused as a current post-import recovery gate and those
Draft PRs must not be merged as part of L1B readiness.

A qualifying L1B recovery gate requires a **fresh post-import** encrypted backup
and an isolated restore of that exact backup.

## Mandatory promotion gates

All unchecked gates below remain blocking. A completed source-publication gate
is not permission to skip a Production gate.

### Gate 0 — source and scope lock

- [x] L1A/L1B source contracts are merged and published disabled.
- [x] Current readiness base is frozen above.
- [x] Browser + Drive authority remains unchanged.
- [x] No L1A/L1B contract has been placed in `supabase/migrations/` by this
      packet.
- [ ] Immediately before any later provider-artifact generation or apply,
      reverify current `main`, source blobs/hashes, workflow, client mode and
      provider baseline. Stop on drift.

### Gate 1 — fresh post-import B-1 backup

- [ ] Create a new encrypted logical backup **after** the accepted first import
      and close to the intended L1 apply window.
- [ ] Capture exact run/job/artifact name, size, expiry, ZIP SHA-256, encrypted
      archive SHA-256, backup source SHA, CLI/tool versions and PostgreSQL image.
- [ ] Confirm owner custody of a recoverable encrypted copy without exposing the
      passphrase or other secret in GitHub/chat.
- [ ] Do not substitute an older or expired artifact.

### Gate 2 — exact B-2 isolated restore

- [ ] Restore the exact Gate-1 artifact in an isolated disposable environment
      with no Production connection and no published database port.
- [ ] Prove decryption/integrity, roles/schema/data restore, catalog/RLS/policy/
      ACL/function/index/owner-orphan reconciliation, and preservation of the
      accepted L0b aggregate state.
- [ ] Produce no plaintext/output artifact containing planner data.
- [ ] Record the exact source head/run/jobs and cleanup result. A failed attempt
      must fail closed and requires root-cause evidence before another attempt.

### Gate 3 — read-only Production preflight

- [ ] Reverify Supabase project `qjaywadzvwvcspdsjxth`, project health,
      PostgreSQL version and migration ledger tail.
- [ ] Verify the current L0b tables/RLS/policies/RPCs/ACLs and accepted aggregate
      counts using bounded evidence only; do not read raw planner content.
- [ ] Verify L1A/L1B Production objects are absent unless a separately recorded
      prior gate says otherwise.
- [ ] Verify `mtp-private` is absent before its explicit Storage gate.
- [ ] Freeze relevant LINE and unrelated `aicc_*` aggregate/catalog canaries and
      review current security-advisor findings.
- [ ] Stop on unexpected migration, object, count, ownership, ACL/RLS, provider
      or advisor drift that materially changes the risk boundary.

### Gate 4 — provider-compatible migration and Storage artifacts

- [ ] In a suitable environment, use the pinned/approved Supabase CLI and
      provider semantics to materialize the exact Production promotion artifact
      set for **L1A then L1B** from the reviewed source contracts.
- [ ] Materialize the private Storage bucket/policy operation as a separately
      identifiable exact artifact or exact provider operation; do not silently
      treat source-only test SQL as an applied Production migration.
- [ ] Freeze artifact filenames/provider names, Git blobs, SHA-256 values,
      operation order, target project and rollback/forward-fix semantics.
- [ ] Independently compare generated artifacts with the reviewed source
      contracts so no provider/CLI transformation widens permissions or scope.
- [ ] **Never use generic `supabase db push` as a fallback.** The operation must
      be targeted and exact; stop if the approved tooling cannot guarantee that
      boundary.

### Gate 5 — atomicity and failure-safety proof

- [ ] On a disposable Production-compatible target starting from the current
      L0b shape, execute the exact intended promotion mechanism and prove the
      success state matches the frozen L1A/L1B/Storage contracts.
- [ ] Inject a controlled failure during the intended schema apply path and
      prove the transactional unit leaves the pre-L1 catalog/data unchanged.
- [ ] If schema migration and Storage resource creation cannot be one atomic
      provider transaction, **do not claim cross-provider atomicity**. Split them
      into explicit ordered gates and prove every intermediate state is safe,
      fail-closed and recoverable before the next gate.
- [ ] Prove rerun/idempotency or explicit fail-closed behavior for each operation
      that may be retried.
- [ ] Freeze rollback/forward-fix instructions. The fresh B-1/B-2 evidence is the
      recovery anchor; no destructive Production rollback is authorized by this
      packet.

### Gate 6 — exact-head CI, security and independent review

- [ ] Run normal PR `verify` at the exact promotion-artifact head and require all
      applicable jobs to pass, including PostgreSQL 17 L1A/L1B security gates,
      full regression/build/package/parity and secret scan.
- [ ] Run targeted Web App Security 6D review against the **exact generated
      migration/Storage bytes and intended apply procedure**.
- [ ] Obtain independent review of identity/RLS/ACL, Storage owner paths,
      idempotency/conflict semantics, backup/restore and failure-safety proof.
- [ ] Resolve all Critical/High findings; any Medium finding that changes the
      approved readiness disposition must be resolved or explicitly dispositioned
      before an apply approval is prepared.

### Gate 7 — exact Owner apply approval

Only after Gates 1-6 pass, prepare one exact approval request naming:

- repository, branch, exact HEAD, exact base and changed files;
- target Supabase project;
- exact migration/provider artifact names and SHA-256 values;
- exact Storage bucket/policy artifact or provider-operation hashes;
- fresh B-1/B-2 run/artifact evidence and custody;
- read-only preflight fingerprints/counts;
- atomicity/failure-safety evidence;
- exact apply order/mechanism;
- rollback/forward-fix and stop conditions;
- exact-head CI/security/review result.

Until that specific approval is received, status remains **NO-GO FOR APPLY**.

### Gate 8 — Production schema/Storage apply and catalog verification

**BLOCKED — CRITICAL GATE / SEPARATE OWNER APPROVAL REQUIRED.**

A future approval for Gate 8 does not automatically authorize client activation,
reconciliation, cleanup or L1C.

### Gate 9 — verify existing disabled client

- [ ] After schema/Storage catalog verification, verify the already-published L1B
      browser artifact still matches the reviewed disabled client bytes and still
      reports `enabled=false`, mode `off`.
- [ ] Verify no automatic enqueue/send path is active and no Supabase authority
      or write path is enabled.
- [ ] Do **not** republish unchanged client bytes merely because schema/Storage
      was applied. If client bytes must change, treat that as a separate release
      gate with its own exact-head verification/publication boundary.

### Gate 10 — activation, reconciliation and observation

- [ ] Obtain separate activation approval.
- [ ] Reconcile the full owner dataset using bounded evidence and preserve Drive
      authority on any mismatch.
- [ ] Observe conflict/offline/attachment durability behavior before considering
      authority change.

### Gate 11 — L1C authority cutover

**BLOCKED — SEPARATE PRODUCT/PRODUCTION DECISION.**

Only after Production verification and the L1C decision may Drive be demoted to
export/backup/archive. No cleanup is implied by cutover.

## Stop conditions

Stop before any provider/Production mutation if any of these occurs:

- current base/source bytes or branch purpose drifts materially;
- fresh post-import backup is missing, expired, unrecoverable or custody is not
  confirmed;
- isolated restore does not prove the exact backup;
- Production preflight differs from the approved baseline;
- migration/Storage artifacts are not generated and frozen through the approved
  provider/tool path;
- intended atomicity/failure-safety is unproven or overstated;
- exact-head CI/security/independent review is not green;
- a new Critical/High risk is unresolved;
- target project, artifact hash, operation ordering or rollback semantics differ;
- the exact Owner approval for the Critical Gate is absent.

No fallback to bulk migration, copied SQL, manual migration-history edits,
broader grants, automatic import, shadow/dual write, or destructive cleanup is
allowed.

## Current decision

**NO-GO FOR APPLY.**

The source/publication work is complete, but fresh post-import B-1/B-2 recovery,
read-only Production preflight, provider-compatible migration/Storage artifacts,
atomicity/failure-safety proof, exact-head CI/security review and an exact Owner
apply approval are still required.
