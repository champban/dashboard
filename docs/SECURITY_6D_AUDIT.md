# Security 6D Audit — L0a/L0b Closure and L1A Source Candidate

Pre-deploy audit: `2026-08-17` (`Asia/Bangkok`)

Post-deploy targeted closure: `2026-08-19` (`Asia/Bangkok`)

Packet A backup/restore update: `2026-08-22` (`Asia/Bangkok`)

Packet A targeted pre-Production decision: `2026-08-22` (`Asia/Bangkok`)

Packet A Production ACL closure: `2026-08-22` (`Asia/Bangkok`)

L0b schema-only Production closure: `2026-08-23` (`Asia/Bangkok`)

L0b Gate 4 targeted source decision: `2026-08-23T14:00:10+07:00`
(`Asia/Bangkok`)

L0b Gate 4 publication closure: `2026-08-23T19:29:26+07:00`
(`Asia/Bangkok`)

L0b M6b first-import acceptance: `2026-08-23T21:29:13+07:00`
(`Asia/Bangkok`)

L1A source activation: `2026-08-24T10:50:50+07:00` (`Asia/Bangkok`)

Repository: `champban/dashboard`

## L1A direct Todo targeted source decision

**Decision: SOURCE CANDIDATE IN VERIFICATION — NO PRODUCTION APPLY, CLIENT
ACTIVATION, MERGE, OR PUBLICATION IS INCLUDED.**

The candidate starts from exact
`main@a5a2a31f3c0ffe195ff56108c6cdf1b68f66b307`, tree
`cf11ca8344b2787a92d0e43e19bc9f67ddc5cdf9`. Its SQL is a non-migration
contract under `supabase/contracts/`; CI applies it only after the exact L0b
migration in a disposable PostgreSQL 17 service.

| Dimension | Source decision | Evidence / residual gate |
|---|---|---|
| 1. Identity and access | CONDITIONAL PASS | Owner is derived only from `auth.uid()`; new tables use RLS; authenticated tables remain SELECT-only; mutation is through three allowlisted wrappers and private empty-`search_path` cores. Exact PostgreSQL catalog/negative tests must pass at the final head. |
| 2. Secrets and data | CONDITIONAL PASS | No secret, owner content, raw LINE identifier/message/reference, binary, import, or Production connection is used. LINE references store SHA-256 digests of random opaque tokens only. Secret scan remains required. |
| 3. Validation and integrity | CONDITIONAL PASS | Payload keys/types are allowlisted; progress/length/origin constraints, owner-composite FKs, dependency-cycle rejection, stable window UUID, expected-version conflicts, and tombstone deletes are covered in source tests. Full planner parity remains L1B. |
| 4. Availability and concurrency | CONDITIONAL PASS | Owner-scoped idempotency receipts make identical retries single-write; conflicting key reuse and stale versions fail closed. Offline queue/realtime behavior and load evidence remain L1B gates. |
| 5. Supply chain and delivery | CONDITIONAL PASS | No dependency or runtime bundle change. Existing npm/build/secret gates plus a new PostgreSQL 17 job protect exact source. Final exact HEAD/base/diff/CI and independent review are still required. |
| 6. Operations and recovery | CONDITIONAL PASS | Source rollback is branch close/revert with no Production effect. Promotion requires qualified backup/restore, read-only preflight and exact migration hash/project/rollback approval; generic `db push` is prohibited. |

No Critical/High issue is presently known in the bounded source design. This is
not a final merge or Production decision: any change to exact HEAD/base/diff,
SQL, ACL/RLS, tests, workflow, provider baseline, or review status invalidates
the applicable evidence. Browser + Google Drive remain authoritative.

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
FUNCTIONAL SMOKE OWNER-WAIVED / NOT EXECUTED. L0b SCHEMA-ONLY APPLY AND CATALOG
GATES ARE COMPLETE; GATE 4 MANUAL CONTROLS ARE PUBLISHED; M6b FIRST MANUAL
IMPORT AND BOUNDED AGGREGATE ACCEPTANCE PASSED. PROVIDER GATE A IS CLOSED AS AN
ACCEPTED PROVIDER-MANAGED RESIDUAL.**

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
At that time no L0b tables/RPCs existed, so the exposed control could not import
and no data change was observed. Packet A makes both client controls fail closed
and adds an ACL-only migration plus PostgreSQL 17 tests. PR #77 merged exact reviewed head
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
| 1. Identity and access | Reviewed L0b owner model remains unchanged; Packet A revoked public-schema `postgres` table/sequence/API-role defaults, globally revoked its built-in future-function `PUBLIC EXECUTE`, and reconstructed exact browser/service `mtp_line_*` ACLs without changing RLS policies. Provider Gate A is closed as an accepted provider-managed residual | Packet A catalog gate and L0b first-import acceptance closed; repeat import/L1 remain gated |
| 2. Secrets and data | ACL-only migration has no data DML; synthetic row invariance test; no secret/provider change. M6b evidence is aggregate-only | Secret scan, exact-head diff and bounded post-import evidence passed |
| 3. Input and content safety | L0b reviewed validation/reconciliation is unchanged | Existing L0b regression gate and first-import hash/count reconciliation passed |
| 4. Browser and network controls | Packet A first made the Full/Mobile controls default-off; the separately approved Gate 4 publication later set the reviewed bridge to `enabled=true`. Existing signed-in render checks and fail-closed handlers remain; Drive/LINE paths are unchanged | Exact-head/post-merge generated-artifact parity and browser regression passed; exactly one later approved Full import succeeded |
| 5. Supply chain and deployment | No dependency/lockfile change; exact Packet A source merged in PR #77 after CI #127 and the frozen migration was applied through targeted `apply_migration` | Packet A closed; never use generic `supabase db push` for L0b |
| 6. Operations and recovery | ACL migration is transactional/repeatable and forward-fix oriented with no cleanup/rollback DDL. Gate 4 published the manual controls; the later approved first import passed bounded acceptance with no retry. Original and refreshed encrypted backup/isolated restore reconciliation passed | Repeat import, recovery, cleanup and L1 remain separately controlled |

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
  produced artifact `9479566992`; Owner confirmed custody of the downloaded
  refreshed artifact before its expiry `2026-08-23T17:33:07Z` and before the
  exact L0b schema-only apply.
- Refreshed B-2 Draft PR #83 exact remote head
  `48aaa7968ab76946095207d919a1db29cc3c7f05`, tree
  `c573d02e52aae7613724b874bd3dd7e7ba6736bf`, passed verify run
  `32616039132`, source-safety run `32616039104`, and the separately approved
  isolated restore run `32618003121` (jobs `97141728425` / `97141748031`).
  Exact Packet A ACL/default/catalog reconciliation and cleanup passed; output
  artifacts were zero and Production remained unchanged.
- PR #83 remains Draft/unmerged. Its label and exact Environment rule remain
  present but authorize no new event or run without a separate exact-head gate.

The original evidence closed the pre-Packet-A recovery gate; the refreshed
evidence validated recoverability and Packet A ACL reconciliation for the
separately approved L0b schema-only gate. Neither authorizes data import,
deployment, cleanup, or L1.

Open risks:

- `RISK-L0A-ACL-1`: **closed** after exact apply/catalog verification. The
  remaining `PACKET-A-R1` assurance residual is the Owner-waived functional
  smoke; provider-owned `supabase_admin` defaults remain an accepted residual.
- `RISK-L0B-UI-1`: PR #76 source was automatically published by the current
  GitHub Pages coupling. Impact is limited to a visible, failing import control;
  no L0b backend/data existed. Packet A prevents recurrence by default-off UI
  gating. The later Gate 4 source merge/publication was separately approved and
  completed; the separately approved first owner-data projection/import later
  passed bounded aggregate acceptance with no retry.
- Legacy subtask `Date.now()` collisions remain whole-batch identity quarantine
  under D-1 A1. A subtask UUID migration is a later L1 prerequisite, not L0b.
- Event windows are positional values and have no stable identity across reorder.
- L0b is a partial projection and is not the planner source of truth.

Packet A's completed procedure is in `docs/PACKET_A_PRODUCTION_READINESS.md`.
The L0b schema closure and remaining manual-import gates are in
`docs/L0B_PRODUCTION_READINESS.md`. Generic `supabase db push` remains blocked;
future L0b data movement requires its own exact approval.

## L0b schema-only Production 6D closure

**Decision: CONDITIONAL PASS — EXACT SCHEMA APPLY AND CATALOG VERIFICATION
COMPLETE; MANUAL IMPORT / ACCEPTANCE NOT EXECUTED.**

- Exact apply base was
  `main@1ece60919d0a4ecdeafcfa4c05b509fc9543492a`, tree
  `e3ab91ca505aee4a0dbcbdff5c5e42e0465ffd1a`. Migration blob
  `59aad11b7b0d3761bc62d7673c7102f164e25f8a` and SHA-256
  `75d0794155cfcc4a3575868f92a16a5d670f6660787c30611e3955a98fe04e8c`
  matched the reviewed source.
- Owner confirmed custody of encrypted artifact `9479566992` and approved the
  exact targeted project/base/hash operation. The connector invoked
  `apply_migration` once; ledger version is
  `20260823055451_l0b_data_foundation`.
- Post-apply verification passed tables/owner/RLS/policies `9/9`, RPCs `6/6`,
  triggers `5/5`, indexes `8/8`, unvalidated constraints `0`, owner-orphans `0`,
  table/function ACL differences `0`, `PUBLIC` RPC grants `0`, and sequence
  API-role grants `0`. All nine L0b tables contain zero rows.
- The frozen LINE and unrelated `aicc_*` aggregate catalog/ACL/policy/function/
  row-count canaries were unchanged. No planner content was read; no import,
  backfill, deployment, provider/Auth/secret change, cleanup, or L1 occurred.
- Six post-apply
  `authenticated_security_definer_function_executable` WARNs map exactly to the
  six reviewed authenticated importer RPCs. This is an accepted schema-gate
  residual because exact execution ACLs, `auth.uid()` binding, empty
  `search_path`, RLS, and fencing all passed. Any drift reopens the gate. The
  pre-existing leaked-password-protection WARN and default-deny LINE INFO remain
  outside this schema-only closure.
- At this schema-only closure point both Full/Mobile importers remained
  disabled. The later separately reviewed Gate 4 publication is recorded below;
  browser + Google Drive still remain authoritative and first import/acceptance
  still require a new exact approval.

## L0b Gate 4 targeted source closure

**Decision: CONDITIONAL PASS — EXACT SOURCE HEAD IS READY FOR A SEPARATE
MERGE/PUBLICATION DECISION; IMPORT AND OWNER-DATA PROJECTION REMAIN BLOCKED.**

Scope is limited to Draft PR #86 source head
`db3c8cded9359b402eb6316bb4c21067db8195d4`, tree
`9cb2bad40bd18f249aa2ad25903c2c50e351dd56`, based directly on
`main@167b84cfdfeedd19c0396b2f520e9806244eec3b`, tree
`f53963dc82e088c0805cc8da94653352695c7865`. The one source commit changes
only `l0b-import.js` and `build/l0b-import.test.mjs`: it deliberately changes
`UI_ENABLED` from `false` to `true` and updates the matching regression
assertions. Migration, RPC, RLS, ACL, Auth, CSP, dependency, Drive, LINE and
provider configuration source is unchanged.

| Dimension | Decision | Exact-head evidence / remaining condition |
|---|---|---|
| 1. Identity and access | PASS FOR SOURCE | The button remains an explicit signed-in browser action. `importNow` requires the existing authenticated Supabase client; the six reviewed RPCs continue to bind every operation to `auth.uid()`, use empty `search_path`, owner predicates, RLS and generation/lease fencing. PostgreSQL 17 cross-owner/direct-write/function-security gates passed. |
| 2. Secrets and data | PASS FOR SOURCE | The two-file diff contains no credential or planner content; repository secret scan passed. This source PR performed no Supabase write or planner-data read. A later click would project owner data and therefore remains behind a separate exact approval. |
| 3. Input and content safety | PASS | Projection allowlists, binary exclusion, canonical identity, exact-byte chunking, bounded JSON/chunk limits, duplicate quarantine, rejection and reconciliation logic are unchanged. Focused and full regression tests passed. |
| 4. Browser and network controls | CONDITIONAL PASS | Full and Mobile retain exactly one manual control, their `enabled===true` render checks and fail-closed handlers. Static tests confirm no timer, Auto-sync, Drive or LINE path invokes `importNow`. No CSP, origin, redirect or network allowlist change exists. Publication remains a separate decision because this repository's `main` is coupled to GitHub Pages. |
| 5. Supply chain and deployment | CONDITIONAL PASS | No package/lockfile/workflow change. Exact-head GitHub Actions `verify` #150, run `32623877211`, completed successfully on all four jobs, including pinned `npm ci`, build/harness/audit/package, full regression, secret scan, generated-artifact parity, PostgreSQL 17 L0b/ACL and L0a SQL gates. PR #86 remains Draft and `main` remains unchanged. |
| 6. Operations and recovery | CONDITIONAL PASS | Production project `qjaywadzvwvcspdsjxth` remains `ACTIVE_HEALTHY`; migration tail is `20260823055451_l0b_data_foundation`; all nine L0b tables remain RLS-enabled with zero rows. Before any import, rollback is to leave `main` on the current disabled source or revert the future merge; the additive empty schema may remain. No automatic retry, shadow/dual write, destructive rollback or L1 action is allowed. |

No Critical or High finding was introduced by the exact two-file source change.
The [official Supabase 2026 Data API default-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
does not invalidate the reviewed contract: the applied migration already uses
explicit grants and RLS.
The six expected authenticated `SECURITY DEFINER` advisor WARNs, intentional
`mtp_line_events` no-policy INFO, and pre-existing leaked-password-protection
WARN are unchanged.

This decision does not approve merge, GitHub Pages publication, planner-data
read/projection, first import, provider/Auth/secret change, cleanup, deployment
verification, acceptance or L1. Any change to the exact source bytes, importer
contract, migration/RPC/RLS/ACL source, dependency lockfile, workflow, Auth,
network controls or provider baseline invalidates the applicable evidence and
requires targeted re-audit.

## L0b Gate 4 merge/publication closure

**Decision: PASS FOR THE EXACT APPROVED MERGE/PUBLICATION BOUNDARY — FIRST
IMPORT AND OWNER-DATA PROJECTION REMAIN BLOCKED.**

Owner approval was frozen to PR #86 exact head
`4830b6cf82aa1ff65306b775e2382d84e96af21e`, tree
`34f3859b997a530d80c4387bca0212388b731dc7`, and exact base
`main@167b84cfdfeedd19c0396b2f520e9806244eec3b`. GitHub merged that unchanged
tree as `main@8fc88a8a94017eadb58b98adecbb87e22d65496c`; its two parents are the exact
approved base and head. The merge commit signature is valid.

| Dimension | Decision | Post-merge evidence / remaining boundary |
|---|---|---|
| 1. Identity and access | PASS FOR PUBLICATION | No Auth, RPC, RLS, policy or privilege bytes changed after the targeted review. The published controls still require the signed-in browser client and explicit Owner action. |
| 2. Secrets and data | PASS FOR PUBLICATION | Exact-head and post-merge secret scans passed. Publication read no planner content and performed no Supabase write; all nine L0b tables were still empty at this publication-closure checkpoint. |
| 3. Input and content safety | PASS / NO DRIFT | The approved PR-head tree equals the merge tree. Projection allowlists, binary exclusion, chunk bounds, identity, rejection and reconciliation logic are unchanged from the targeted source decision. |
| 4. Browser and network controls | PASS FOR PUBLICATION | `UI_ENABLED=true` exposes only the reviewed manual controls behind existing render/fail-closed checks. Static tests still prove no timer, Auto-sync, Drive or LINE path invokes `importNow`; no CSP/origin/redirect change exists. |
| 5. Supply chain and deployment | PASS | Exact PR-head `verify` #151 (`32624687421`) and post-merge push `verify` #152 (`32639538682`) passed all four jobs. Pages #117 (`32639537950`) completed build, report and deploy for exact merge `8fc88a8a`; artifact `9493226035` digest is `sha256:cdc5c5ba6fd15897240d61a12dd650c188d337938d693eda2e8debdcf5cbee92`. |
| 6. Operations and recovery | PASS FOR PUBLICATION | Read-only Production recheck found project `qjaywadzvwvcspdsjxth` `ACTIVE_HEALTHY`, migration tail `20260823055451_l0b_data_foundation`, RLS `9/9`, and zero rows in all nine L0b tables. Before any import, rollback is a reviewed source revert; no destructive database rollback is allowed. |

This closes only the approved GitHub merge/publication boundary. It does not
authorize planner-data read/projection, first import, bounded reconciliation,
acceptance, provider/Auth/secret change, cleanup, source-of-truth cutover or L1.
Those actions require a separate exact Owner gate.

## L0b M6b first-import acceptance closure

**Decision: PASS FOR THE SEPARATELY APPROVED FIRST MANUAL IMPORT AND BOUNDED
AGGREGATE ACCEPTANCE — REPEAT IMPORT, SOURCE-OF-TRUTH CUTOVER AND L1 REMAIN
BLOCKED.**

The Owner approval was frozen to exact
`main@fe6547513111657b5554c58eb715354f4c408130`, tree
`d936d14b756e39eaa193c2d6948a7ea4fc324ff1`, Production project
`qjaywadzvwvcspdsjxth`, migration tail
`20260823055451_l0b_data_foundation`, and exactly one authenticated manual Full
import with aggregate-only reconciliation, no automatic retry and stop on any
drift. Backup artifact `9479566992` was still unexpired when the import ran.

Batch `07021dad-c25d-40dc-a722-b405c8b2a5c7` started at
`2026-08-23T21:29:12+07:00` and finished `succeeded` at `21:29:13+07:00`.
Declared/received chunks were `4/4`, the one final chunk was sequence `3`,
reject count/classes were `0/{}`, traversal completed, hashes were compared,
stream/client and payload/stored hashes matched, and staging returned to `0`.
Active aggregate counts were tasks `105`, subtasks `17`, events `6`, event
windows `15`, task attachments `0`; tombstoned and anomaly counts were zero.
No planner title, note, description, identifier, attachment content, owner ID,
credential or secret entered evidence or chat.

| Dimension | Decision | Post-import evidence / residual boundary |
|---|---|---|
| 1. Identity and access | PASS | Tables/owner/RLS/policies remained `9/9`; RPCs remained `6/6` `SECURITY DEFINER` with empty `search_path`, authenticated execute `6`, anon/PUBLIC execute `0`; authenticated non-SELECT table grants, staging client grants, sequence API-role grants and owner-orphans were `0`. |
| 2. Secrets and data | PASS FOR APPROVED PROJECTION | One partial normalized projection batch succeeded. Evidence is aggregate-only; excluded fields and binary content were not imported or inspected. Browser + Drive remain authoritative. |
| 3. Input and content safety | PASS | Chunks `4/4`, rejects `0`, traversal complete, both reconciliation hash comparisons true, recorded/actual active and tombstone counts equal, anomalies `0`, and staging `0`. |
| 4. Browser and network controls | PASS FOR ONE MANUAL ACTION | Exactly one Full batch exists; running/failed/partial/expired counts are `0`. No Mobile duplicate, timer, Drive, LINE, auto-sync or retry path ran. |
| 5. Supply chain and deployment | PASS / NO SOURCE DRIFT | `main` remained exact `fe654751`; migration ledger and schema source did not change. No deployment, dependency, Auth, CSP, redirect, provider or secret change occurred. |
| 6. Operations and recovery | PASS FOR M6b | LINE stayed at `5` tables / `5` RLS / `38` columns / `10` policies / `4` functions and row counts `1/5/1/17/1`; unrelated `aicc_*` stayed at `9` relations / `123` columns / `14` policies / `6` functions. No rollback or retry was required. |

The security advisor set remains the documented six intended authenticated
importer WARNs, one default-deny `mtp_line_events` INFO and the pre-existing
leaked-password-protection WARN. No new Critical or High issue appeared. This
closure does not make Supabase the planner source of truth and does not approve
another import, cleanup, direct Todo mutation, Drive demotion or L1.

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
