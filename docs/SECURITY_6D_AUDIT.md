# Security 6D Audit — L0a Closure and L0b Source Gate

Pre-deploy audit: `2026-08-17` (`Asia/Bangkok`)

Post-deploy targeted closure: `2026-08-19` (`Asia/Bangkok`)

Packet A backup/restore update: `2026-08-22` (`Asia/Bangkok`)

Packet A targeted pre-Production decision: `2026-08-22` (`Asia/Bangkok`)

Packet A Production ACL closure: `2026-08-22` (`Asia/Bangkok`)

Repository: `champban/dashboard`

Production scope:

- Final reviewed implementation head `73ad8b6a9815411364afeae34d9ce52418bd6967`
- Source merge `3cafa19aa56f89c8d640acc717726d0043b3bd2c` (PR #70)
- Applied migration `20260818154406_line_webhook_event_reliability`
- Active `line-todo-webhook` v22, `verify_jwt=false`
- Bundle SHA-256 `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`
- Netlify proxy-only gateway unchanged
- Owner-confirmed LINE webhook and redelivery enabled
- Controlled live LINE smoke and Production ledger verification

## L0b source merge and Packet A addendum

**Decision: PR #76 AND PACKET A SOURCE MERGES COMPLETE; PACKET A BACKUP,
ISOLATED RESTORE, TARGETED PRODUCTION APPLY, AND CATALOG GATES COMPLETE;
FUNCTIONAL SMOKE OWNER-WAIVED / NOT EXECUTED. L0b DATABASE ACTIVATION IS NOT
APPROVED. PROVIDER GATE A IS CLOSED AS AN ACCEPTED PROVIDER-MANAGED RESIDUAL.**

Review #1 is closed with Owner-approved D-1 `A + A1`. Owner approved the exact
PR #76 source head `e3a52c5306e44856970eeb811dc52ecc9b8c3527`; it merged as
`67fe86cac29b3facecd08290a3000ba23bc8a684` after exact-head CI #125 passed. No
Supabase migration, planner data copy, backfill/import, provider change, or L1
cutover followed.

Final Review #2 returned `REQUIRED CHANGES` at `749af1b4a2deeb7853b4a8aa564503e3b9fd5539`.
The five findings were remediated at source/test commit
`14d67b2d2cea69bb16cf78e1d4d54732ca5d93c0` without applying the migration:
broad Supabase default privileges are now simulated in PostgreSQL 17 CI; table
privilege assertions cover `REFERENCES`, `TRIGGER`, and `MAINTAIN`; rollback,
fencing, heartbeat, stream-incomplete, and reject-classification paths are
exercised; and the only migration edits are the two approved NULL-safe staging
predicates. CI #124 and exact-head CI #125 passed. The Owner's exact-head source
merge approval closed that source gate; it did not authorize database activation.

Read-only verification after merge found that the existing GitHub Pages path
published `l0b-import.js` to the live planner without a separate manual deploy.
No L0b tables/RPCs exist, so the exposed control cannot import and no data change
was observed. Packet A makes both client controls fail closed and adds an
ACL-only migration plus PostgreSQL 17 tests. PR #77 merged exact reviewed head
`a9c99719e0e6abdf2a5f1fbedd282328f812577b`, tree
`6479a43d73b04351f842e985a538afada694ce5e`, as
`main@9a5a95f5c9065214c0418def80a3086fdf79d323`. Exact-head CI #127 passed all
four jobs. The exact ACL migration was later applied once and catalog-verified
as provider version `20260822162710`; the closure is recorded below.

Provider Gate A closed on `2026-08-21`. Supabase's current official API-security
documentation and merged PR #47952 state that `supabase_admin` default ACLs are
intentional provider-managed state, do not bypass RLS by themselves, and the
internal role cannot authenticate through the Data API. The catalog entries are
therefore accepted rather than altered from customer context. This does not
remove the need for explicit grants, RLS, function-execution controls, or Packet
A hardening of `postgres` defaults and existing objects.

| Dimension | Current source control | Remaining gate |
|---|---|---|
| 1. Identity and access | Reviewed L0b owner model remains unchanged; Packet A revoked public-schema `postgres` table/sequence/API-role defaults, globally revoked its built-in future-function `PUBLIC EXECUTE`, and reconstructed exact browser/service `mtp_line_*` ACLs without changing RLS policies. Provider Gate A is closed as an accepted provider-managed residual | Packet A catalog gate closed; L0b has a separate preflight/apply/import gate |
| 2. Secrets and data | ACL-only migration has no data DML; synthetic row invariance test; no secret/provider change | Secret scan and exact-head diff |
| 3. Input and content safety | L0b reviewed validation/reconciliation is unchanged | Existing L0b regression gate stays green |
| 4. Browser and network controls | Full/Mobile controls require `enabled===true`; bridge defaults false; handlers also reject disabled calls; Drive/LINE paths unchanged | Generated artifact parity and browser regression suite |
| 5. Supply chain and deployment | No dependency/lockfile change; exact Packet A source merged in PR #77 after CI #127 and the frozen migration was applied through targeted `apply_migration` | Packet A closed; never use generic `supabase db push` for L0b |
| 6. Operations and recovery | ACL migration is transactional/repeatable and forward-fix oriented; no cleanup/rollback DDL; importer stays disabled. Original and refreshed encrypted backup/isolated restore reconciliation passed | Refreshed artifact custody remains unconfirmed; any future schema gate requires qualifying backup evidence |

### Packet A Backup Gate B-1/B-2 evidence

- B-1 run `32149051510`, attempt 2, job `96681690187` created the exact pinned
  encrypted backup; artifact/ZIP/archive metadata and SHA-256 values are recorded
  in `docs/PACKET_A_PRODUCTION_READINESS.md`. Owner confirmed downloaded backup
  custody without exposing the passphrase.
- B-2 Draft PR #79 exact head
  `796b42a41b5e33f96f2ecc0752baf691c645d35c`, tree
  `d79ffb9b1eb3d5c6ed9380058aaedac1d9266b9f`, passed source-safety and isolated
  restore in run `32577304437`, jobs `97041400164` and `97041418226`.
- The disposable PostgreSQL 17 target had network mode `none` and no published
  port. The reviewed Storage 61-62 compatibility bridge ran before decryption;
  atomic restore and exact table/RPC/RLS/policy/index/owner-orphan/count
  reconciliation passed. No output artifact or Production connection was used.
- Post-run read-only Production table counts matched the pre-run snapshot. The
  approval label was removed and PR #79 remains Draft/unmerged.
- After Packet A apply, refreshed B-1 run `32587955307`, job `97067096268`,
  produced artifact `9479566992`; Owner custody of that refreshed artifact is
  not confirmed and its expiry is `2026-08-23T17:33:07Z`.
- Refreshed B-2 Draft PR #83 exact remote head
  `48aaa7968ab76946095207d919a1db29cc3c7f05`, tree
  `c573d02e52aae7613724b874bd3dd7e7ba6736bf`, passed verify run
  `32616039132`, source-safety run `32616039104`, and the separately approved
  isolated restore run `32618003121` (jobs `97141728425` / `97141748031`).
  Exact Packet A ACL/default/catalog reconciliation and cleanup passed; output
  artifacts were zero and Production remained unchanged.
- PR #83 remains Draft/unmerged. Its label and exact Environment rule remain
  present but authorize no new event or run without a separate exact-head gate.

The original evidence closed the pre-apply recovery gate; the refreshed evidence
validates recoverability and Packet A ACL reconciliation after apply. Neither
authorizes L0b activation, deployment, cleanup, or L1.

Open risks:

- `RISK-L0A-ACL-1`: **closed** after exact apply/catalog verification. The
  remaining `PACKET-A-R1` assurance residual is the Owner-waived functional
  smoke; provider-owned `supabase_admin` defaults remain an accepted residual.
- `RISK-L0B-UI-1`: PR #76 source was automatically published by the current
  GitHub Pages coupling. Impact is limited to a visible, failing import control;
  no L0b backend/data existed. Packet A prevents recurrence by default-off UI
  gating; future source merge and publication remain separate approvals.
- Legacy subtask `Date.now()` collisions remain whole-batch identity quarantine
  under D-1 A1. A subtask UUID migration is a later L1 prerequisite, not L0b.
- Event windows are positional values and have no stable identity across reorder.
- L0b is a partial projection and is not the planner source of truth.

Packet A's completed procedure is in `docs/PACKET_A_PRODUCTION_READINESS.md`.
The next database procedure is `docs/L0B_PRODUCTION_READINESS.md`. Generic
`supabase db push` remains blocked; L0b requires a targeted operation and its
own exact approval.

## Packet A targeted pre-Production 6D decision

**Decision: CONDITIONAL PASS — EXACT ACL-ONLY APPLY GATE.**

Scope is frozen to `champban/dashboard` base
`main@bc42edf5ecac980462d4e9def4cdd2d9078299dc`, tree
`17f0b4940b3f04c7f0daea0865645d0fe395488a`, Supabase Production project
`qjaywadzvwvcspdsjxth`, and migration
`supabase/migrations/20260820083714_line_acl_default_privilege_hardening.sql`
(blob `3a6e760e183889b72c13df48bd72b10a9655c69f`, SHA-256
`554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`).
No browser, Netlify, Edge Function, secret, provider setting, or dependency
change is in scope.

| Dimension | Decision | Evidence and residual |
|---|---|---|
| 1. Identity and access | CONDITIONAL PASS | The reviewed migration reduces `postgres` defaults and reconstructs exact browser/service-role table, column and RPC grants while leaving ten RLS policies unchanged. Preflight confirmed all five target tables have RLS, the four exact RPCs exist, `anon` executes none, `authenticated` executes none, and `service_role` executes all four. Existing broad grants are the risk being remediated, not a reason to substitute a broader operation. |
| 2. Secrets and data | PASS | ACL-only, transactional SQL contains no data DML and no secret. Stable target counts were `1/5/1/17/1`; backup B-1 and isolated restore B-2 passed, and Owner retains a downloaded encrypted copy. No customer content or identifier was inspected or recorded. |
| 3. Input and content safety | PASS / NO CHANGE | No browser input, imported JSON, HTML, URL, attachment, webhook, or runtime path changes. Existing generated-artifact, regression, PostgreSQL and release verification at exact reviewed source run #127 remained the applicable source evidence. |
| 4. Browser and network controls | PASS / NO CHANGE | No CSP, header, CORS, OAuth redirect, gateway, Netlify or Edge Function change. Browser/Drive remains authoritative and the L0b controls remain fail-closed. |
| 5. Supply chain and deployment | CONDITIONAL PASS | Migration bytes and Git blob are frozen; exact reviewed source run `32352059807` (#127) passed. Only targeted Supabase `apply_migration` may be considered later; generic `supabase db push` is blocked because it could also apply L0b. Current `main` changes after the source review were documentation-only. |
| 6. Operations and recovery | CONDITIONAL PASS | B-1 backup custody and B-2 isolated restore/reconciliation passed. Post-apply checks freeze row counts, policy/ACL fingerprints, L0b absence and the unrelated `aicc_*` canary; unexpected permission loss uses a separately approved least-privilege forward fix. GitHub artifact expiry does not replace the Owner-held copy and any new restore run requires a new B-1 approval. |

### Read-only Production baseline

- Applied migration ledger stopped at
  `20260818154406_line_webhook_event_reliability`; Packet A and L0b were
  absent.
- Five LINE tables had RLS enabled; total policies `10`; policy fingerprint
  `2596ad76480f6484ae9ea0523eb4d674`.
- Pre-apply LINE ACL fingerprint
  `8e36fd84519a1aed7efb8ab52b03d14b` over 138 parts.
- Stable row counts: accounts `1`, events `5`, link codes `1`, mutations
  `17`, snapshots `1`.
- L0b tables present: `0/9`.
- Unrelated `aicc_*` canary
  `1a120bb49bdf81711391bc8a45abbd88` over 409 parts, identical on two
  reads. No older digest existed in project documentation, so this verified
  value is the pre-apply baseline for later equality checking.

### Findings and stop conditions

- No Critical or High blocker remains for the exact targeted remediation.
  `RISK-L0A-ACL-1` remains open in Production until apply and post-apply
  catalog/functional verification complete.
- Supabase advisor `rls_enabled_no_policy` on `mtp_line_events` is
  informational and intentional: client roles have no table/RPC access and the
  service-role contract is explicit.
- Supabase advisor `auth_leaked_password_protection` is a pre-existing Auth
  warning, outside this ACL-only change. Track as a Medium follow-up owned by
  P'Boy, due `2026-09-22` or before any Auth configuration change. It does not
  authorize an Auth/provider setting change here.
- Stop before apply if the source SHA/tree/hash, project, migration ledger,
  object signatures, counts, fingerprints, backup custody, or targeted
  operation semantics differ. Do not fall back to `db push`, manual ledger
  edits, broad grants, L0b, deployment or data movement.

This was the pre-apply decision. The later exact apply and its closure decision
are recorded below.

## Packet A Production ACL closure

**Decision: CONDITIONAL PASS — CATALOG VERIFICATION PASS; FUNCTIONAL SMOKE
OWNER-WAIVED / NOT EXECUTED.**

Supabase recorded
`20260822162710_line_acl_default_privilege_hardening` from exact apply base
`main@a061319cc6762fe58243f1e10a40e0737489aa2e`, tree
`d18a9f466f1ee62021a9d41541cfd0fcbe14b73e`, and migration SHA-256
`554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`.

| Dimension | Closure | Evidence / residual |
|---|---|---|
| 1. Identity and access | PASS | Exact target/default ACL matrix matched the reviewed migration; client RPC execution stayed denied; service-role RPC execution stayed present; RLS and ten policies were unchanged. |
| 2. Secrets and data | PASS | ACL-only transaction used no data DML. Exact counts stayed `1/5/1/17/1`; no secret or customer content was read or recorded. |
| 3. Input and content safety | NO CHANGE | No runtime, input, HTML, URL, attachment or import code changed. |
| 4. Browser and network controls | CONDITIONAL PASS | No browser/network/provider configuration changed. Functional browser/LINE smoke was Owner-waived and not executed. |
| 5. Supply chain and deployment | PASS | Exact frozen migration bytes were used through targeted `apply_migration`; ledger gained one provider version only; `db push` and L0b remained blocked. |
| 6. Operations and recovery | CONDITIONAL PASS | B-1 custody and B-2 isolated restore passed; catalog/count/canary verification passed and no rollback was required. Functional smoke assurance was explicitly waived. |

### Post-apply evidence

- Applied version:
  `20260822162710_line_acl_default_privilege_hardening`.
- Future defaults retained only `postgres` owner privileges; global future
  function `PUBLIC EXECUTE` was removed.
- `anon` had no target access. `authenticated` and `service_role` matched
  the exact reviewed table/column/RPC matrix.
- Five target tables remained RLS-enabled with policy distribution
  `1/0/4/2/3`; total `10`.
- Counts remained accounts/events/link-codes/mutations/snapshots =
  `1/5/1/17/1`.
- L0b remained `0/9`.
- Unrelated `aicc_*` v2 canary remained
  `848e24b1452c3c4e5ff6b7b9ce308044` / 218 parts.
- Post-apply LINE v2 fingerprint was stable twice at
  `f939987598538c846c82d85942a37037` / 61 parts.
- Advisors added no finding. The intentional LINE-events INFO and pre-existing
  Auth WARN remain as previously classified.

### Owner waiver and residual

The Owner directed that authenticated snapshot/save, LINE `menu`, and Edit ->
Cancel be skipped and assumed successful. The audit does not convert an
unexecuted check into evidence: all three are recorded as **NOT EXECUTED**.

Residual `PACKET-A-R1`: a legitimate application permission regression could
remain undetected until normal use. Severity: Low-to-Medium given the exact ACL
simulation, catalog matrix, unchanged rows/policies and passing source CI.
Owner: P'Boy. Status: accepted. Reopen immediately on any LINE/snapshot/save
permission symptom or before the next Auth/ACL/LINE change.

`RISK-L0A-ACL-1` is closed for the broad-grant/default-privilege defect. This
closure does not authorize L0b, data movement, deployment, provider/Auth
changes, cleanup, PR #79/#83 merge, or L1.

## L0a Decision

**CONDITIONAL PASS — PRODUCTION VERIFIED**

No unresolved Critical or High finding remains in the L0a scope. The conditional
status records accepted operational residuals rather than a deployment blocker:
Personal-PC-only backup, no scheduled retention cleanup, no exact-once external
LINE reply guarantee, and three pre-existing development dependency advisories.
No provider secret, Netlify, Rich Menu, or Todo source-of-truth change occurred.

## Six-dimension decision table

| Dimension | Result | Production evidence / control | Residual |
|---|---|---|---|
| 1. Identity and access | PASS | Production migration verified RLS on `mtp_line_events`; `anon`/`authenticated` cannot access the table or execute ledger RPCs; `service_role` has required access only; authenticated mutation updates are column-limited and owner RLS remains active. | None blocking. |
| 2. Secrets and data | PASS WITH LOW RESIDUAL | No raw body, LINE user ID, reply token, planner content or secret is persisted/logged; only stable event identity, owner UUID, bounded error code and timestamps are stored. Secret scans passed. | Fallback digest remains pseudonymous and service-role-only. |
| 3. Input and content safety | PASS | Raw-body HMAC at both hops, 1 MiB limits, bounded IDs/error codes, per-event isolation, exact ISO-week boundary tests, strict postback parsing and no AI/free-form SQL. Public invalid-signature tests returned 401. | None blocking. |
| 4. Browser and network controls | PASS WITH ACCEPTED RESIDUAL | Netlify stayed proxy-only with 8-second timeout; 30-second lease and redelivery were tested; Owner verified provider redelivery enabled; live valid POSTs returned 200. | External LINE replies are not mathematically exact-once; a consumed reply token cannot be replayed after a rare reply/finalization crash window. |
| 5. Supply chain and deployment | CONDITIONAL PASS | Final exact-head review passed; CI #104/#116, build, tests, secret scan, generated-artifact parity and real PostgreSQL gate passed; exact five-file package and bundle were recorded. No dependency/lockfile change. | Pre-existing `1 moderate` and `2 high` development advisories are accepted by Owner as a bounded follow-up through `2026-09-17`; no `npm audit fix --force`. |
| 6. Operations and recovery | CONDITIONAL PASS | Encrypted backup integrity passed; v21 rollback source/hash retained; migration/RLS verified; v22 ACTIVE; live smoke produced 5 processed, 0 failed/processing, max attempt 1, and no mutation change. | Backup has one Owner-approved copy on Personal PC; retention RPC is not scheduled. |

## L0a findings and closures

### L0A-01 — irreversible link claim ordering

**Status: CLOSED IN PRODUCTION**

`mtp_claim_line_link` consumes a one-time code. The runtime now sends the linked
reply before attaching `owner_id` to the event ledger. A behavioral test proves a
synthetic ledger-owner failure occurs only after linked messages were delivered.
The code remains hashed, single-use and ten-minute limited.

Residual: if reply delivery itself fails after the claim, the code remains
consumed. Recovery is generating a new link code; making codes reusable would
violate the established security invariant.

### L0A-02 — authenticated idempotency-key squatting

**Status: CLOSED IN PRODUCTION**

Authenticated clients can no longer update every mutation column. Real SQL/RLS
tests prove the allowed four queue-completion fields work while
`source_event_id`, `operation`, `owner_id` and `expires_at` are denied.

### L0A-03 — real SQL and concurrency evidence

**Status: CLOSED IN PRODUCTION**

Real PostgreSQL lifecycle/RLS/concurrency testing passed before deployment,
including `claimed -> busy -> claimed_stale -> claimed_retry ->
duplicate_processed`, old-attempt rejection, terminal-only cleanup and genuine
two-session `claimed=1, busy=1` behavior.

Production migration `20260818154406_line_webhook_event_reliability` then passed
catalog verification: required columns/indexes/constraints exist, RLS is enabled,
client roles are denied, service-role RPC access is present, mutation column
privileges are restricted, and the 17 pre-existing mutation rows were unchanged.

### L0A-04 — retry and reply guarantee

**Status: CLOSED FOR L0a / RESIDUAL ACCEPTED**

Persistent deduplication, per-event retry state and mutation-draft idempotency
are Production verified. Owner confirmed LINE webhook redelivery enabled, and the
8-second gateway timeout/30-second lease behavior passed isolated testing.

The system truthfully does not claim exact-once external replies. If LINE accepts
a reply and final ledger completion then fails, state can be repaired but a
consumed reply token generally cannot reproduce the original user-visible reply.
A durable outbound outbox/worker would be required for a stronger guarantee and
is outside L0a.

### L0A-05 — current 6D scope

**Status: POST-DEPLOY TARGETED AUDIT COMPLETE**

This report now covers implementation review, the exact Production migration,
v22 deployment, public endpoint checks, controlled live smoke, ledger/mutation
verification, backup and rollback readiness. Historical audits remain available
for their original scopes but are not used as substitute evidence for L0a.

### L0A-06 / L0A-07 — ISO-week correctness and prevention commentary

**Status: CLOSED IN PRODUCTION**

Tests now assert exact cross-year boundaries and Monday/Sunday weekdays. The
explanatory test comments removed by the first implementation were restored. The
Flex footer comment now accurately records that a schema rejection becomes
`line_reply_failed -> failed -> HTTP 503`, rather than being silently swallowed.

### L0A-08 — mutation decision testability

**Status: CLOSED IN PRODUCTION**

Mutation repository wiring and decision semantics were extracted from
`index.ts` into dependency-free `event-processing.js`. Behavioral tests cover
retried confirm, conflicting cancel, expired draft and missing draft.

## Verification evidence

- Final Claude read-only review: `PASS` at `73ad8b6a9815411364afeae34d9ce52418bd6967`.
- GitHub Actions #104: exact-head standard verification plus real PostgreSQL
  SQL/RLS/concurrency — PASS.
- Evidence PR #71: signed duplicate replay and timeout/lease tests — PASS.
- Evidence PR #72: encrypted logical backup creation/decryption/hash verification
  — PASS; Owner accepted Personal-PC-only storage risk.
- Production migration `20260818154406_line_webhook_event_reliability`:
  structure, RLS, grants, RPCs and unchanged mutation count — PASS.
- Edge Function v22 ACTIVE, `verify_jwt=false`, bundle
  `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`.
- Evidence PR #74 / CI #116: direct and Netlify invalid-signature/public endpoint
  checks — PASS.
- Owner live smoke: `menu`, Edit -> Cancel, `search week 49 2026` — PASS.
- Post-smoke data: 5 processed; 0 failed; 0 processing; max attempt 1; mutation
  rows 17; no non-null `source_event_id`; no rollback required.

## Production gates completed

1. Final independent exact-head review — PASS.
2. PR #69 closed unmerged; PR #70 merged reviewed source — PASS.
3. Encrypted logical backup and integrity verification — PASS with accepted
   single-copy risk.
4. Exact additive migration applied and Production schema/RLS checked — PASS.
5. LINE webhook and redelivery Owner-verified enabled — PASS.
6. Signed duplicate replay through exact gateway logic — PASS in isolation.
7. Netlify 8-second timeout / 30-second lease test — PASS.
8. v21 rollback source/version/hash recorded — PASS.
9. Exact five-file source package deployed as v22 — PASS.
10. Invalid signature, menu, Cancel and ISO-week live smoke — PASS.
11. Post-deploy targeted 6D decision — this `CONDITIONAL PASS` closure.

## Rollback and backup

- Runtime rollback: redeploy captured `line-todo-webhook` v21 and verify invalid
  signature rejection plus one controlled `menu` reply.
- The additive ledger migration remains compatible with v21 and is not removed
  during runtime rollback without separate destructive-change approval.
- Encrypted backup `20260818T145008Z` passed integrity verification. Owner accepts
  one Personal-PC copy; passphrase remains separate.
- L0a did not rewrite Todo/planner content; Production mutation rows remained 17.
- No retention cleanup or restore drill is authorized by this closure.

## Accepted risks register

| ID | Risk | Severity | Owner | Revisit trigger | Status |
|---|---|---:|---|---|---|
| L0A-R1 | Redelivery disabled would lose failed/busy events without an internal worker | High if configuration regresses | Owner / release manager | Any LINE provider configuration change | CLOSED FOR RELEASE — enabled verified; configuration must remain enabled |
| L0A-R2 | Reply accepted but final ledger update fails; retry cannot rely on consumed reply token | Medium | Backend owner | Multi-user rollout or outbound-worker design | Accepted, documented residual |
| L0A-R3 | Deterministic fallback digest may be guessable for low-entropy events if ledger access expands | Low | Backend/security owner | Access beyond service role | Accepted with service-role-only control |
| L0A-R4 | Gateway timeout can leave an event busy until the 30-second lease expires | Medium | Backend/operations owner | Forwarder timeout or LINE retry behavior changes | CLOSED FOR RELEASE — isolated 8s/30s test passed; live max runtime below 8s |
| L0A-R5 | Pre-existing dev dependency advisories: 1 moderate, 2 high | Medium | `champban` | `2026-09-17` or dependency/runtime reachability change | Explicitly accepted for this release; no package/lockfile change; separate remediation required |
| L0A-R6 | Retention RPC exists but no schedule is approved | Low | Operations owner | Before ledger volume/retention threshold is reached | Deferred; cleanup remains outside request path |
| L0A-R7 | Only one encrypted backup copy exists on Personal PC | Medium | P'Boy | Before future destructive migration or device-risk change | Explicitly accepted for additive L0a only |

## Historical audit index

The previous `2026-07-30` audit covered Rich Menu assets, health monitoring,
Search-button activation and the earlier read-only LINE integration. Its final
Decision was PASS for that historical scope and included accepted residual
`LINE-5` for credential-health monitoring. It explicitly did **not** cover this
runtime/migration change.

Authoritative historical evidence remains available through Git history at:

- base commit `576513707f4567e6707e956e3e3b5ada75d42897`;
- `AUDIT-6D-SECURITY-REPORT.md`;
- `docs/PROJECT_PERFORMANCE_KPI.md`;
- prior workflow and release records referenced by `PROJECT_CONTEXT.md`.
