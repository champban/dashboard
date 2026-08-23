# L0b Production Readiness

Status: **SCHEMA-ONLY PRODUCTION APPLY AND CATALOG VERIFICATION COMPLETE /
GATE 4 MANUAL-CONTROL PUBLICATION COMPLETE / FIRST MANUAL IMPORT NOT EXECUTED**

Decision date: `2026-08-23` (`Asia/Bangkok`)

This packet records the exact, separately approved L0b schema-only Production
apply after Packet A and the separately approved Gate 4 merge/publication. It
does not authorize planner-data read/copy, first import, provider/Auth/secret
change, cleanup, source-of-truth cutover, or L1. Browser + Google Drive remain
authoritative.

## Exact source boundary

- Repository: `champban/dashboard`
- Apply base: `main@1ece60919d0a4ecdeafcfa4c05b509fc9543492a`
- Apply base tree: `e3ab91ca505aee4a0dbcbdff5c5e42e0465ffd1a`
- Source merge: PR #76, reviewed head
  `e3a52c5306e44856970eeb811dc52ecc9b8c3527`, merged as
  `67fe86cac29b3facecd08290a3000ba23bc8a684`
- Migration:
  `supabase/migrations/20260820032749_l0b_data_foundation.sql`
- Git blob: `59aad11b7b0d3761bc62d7673c7102f164e25f8a`
- SHA-256:
  `75d0794155cfcc4a3575868f92a16a5d670f6660787c30611e3955a98fe04e8c`
- Existing exact-head source gate: CI #125 passed after Review #2 remediation;
  `.github/workflows/verify.yml` continues to execute the PostgreSQL 17 L0b gate.

Any migration-byte, schema, RLS, grant, identity, reconciliation, or apply-path
change invalidates this packet and requires targeted review.

## Production apply and verified catalog

Verified through the authenticated Supabase connector on `2026-08-23`:

- Project `Dashboard` (`qjaywadzvwvcspdsjxth`) is `ACTIVE_HEALTHY` on
  PostgreSQL `17.6.1.147`.
- The targeted `apply_migration` call ran exactly once with the frozen SQL and
  provider name `l0b_data_foundation`; the ledger gained exactly
  `20260823055451_l0b_data_foundation` after Packet A and no other record.
- L0b tables are present `9/9`, all owned by `postgres`, RLS-enabled `9/9`,
  with the reviewed owner-scoped policies `9/9`.
- Reviewed RPCs are present `6/6`; all six are `SECURITY DEFINER`, have empty
  `search_path`, enforce `auth.uid()`, and retain the frozen execution ACL.
- Reviewed triggers are present `5/5`, indexes `8/8`, unvalidated constraints
  `0`, owner-orphans `0`, table ACL differences `0`, function ACL differences
  `0`, `PUBLIC` RPC grants `0`, and sequence API-role grants `0`.
- All nine L0b tables contain zero rows. PR #86 later published the reviewed
  Full/Mobile signed-in manual controls (`UI_ENABLED=true`), but no planner
  content was read or imported and no automatic path invokes the importer.
- Frozen LINE canaries were unchanged before/after: tables `5` / RLS `5`,
  columns `38`, policies `10`, functions `4`, row counts `1/5/1/17/1`; digests
  `f1f54e4e92976f3d85b5ff55a1e6a0f9`,
  `8e4d072be05561a0219e0396a499f3f3`,
  `f685bebd0fcf22aaf44fe393667332d5`,
  `33c58ddc665061cf148f0d6950d06a34`,
  `f54e3eb431efd8ff53788ce7ae1f4dc3`, and
  `25411b034072cdd80b4cc7d01f45f3fd`.
- Frozen unrelated `aicc_*` canaries were unchanged before/after: tables `9`,
  columns `123`, policies `14`, functions `6`; table/column ACL parts
  `245/1932`; digests `39bbc1d3d8258c7ec018213ca2033417`,
  `98db2e47331b7d4a41ea7e0f900daf56`,
  `248d185aad49c8f30929c4ec3641b7fc`,
  `19bcdce3bd0a284891794324a1aa3626`,
  `e8f6356df5249e58136b40e992c37484`, and
  `7048104ce2bb0c894f2b86300cdd2bc5`.

Packet A remains catalog-verified with
functional smoke explicitly Owner-waived / not executed. That residual must be
reopened before any future action that changes LINE/Auth/ACL behavior. The L0b
schema-only apply did not do so.

## Targeted pre-Production 6D decision

**Decision: CONDITIONAL PASS — EXACT L0b SCHEMA-ONLY APPLY AND CATALOG GATES
COMPLETE; MANUAL IMPORT AND ACCEPTANCE REMAIN SEPARATELY BLOCKED.**

No unresolved Critical or High finding blocked the exact schema-only operation.
The Owner confirmed custody of the qualifying encrypted backup and separately
approved the exact project/base/hash operation before the targeted apply.

| Dimension | Decision | Evidence / remaining condition |
|---|---|---|
| 1. Identity and access | PASS FOR SCHEMA ONLY | PostgreSQL 17 CI #145 and post-apply Production catalog verification passed owner-composite FK, RLS, policy, RPC, direct-write, cross-owner, sequence and function-security controls. Six expected advisor WARNs for authenticated execution of the reviewed `SECURITY DEFINER` importer RPCs remain documented below. |
| 2. Secrets and data | PASS FOR SCHEMA ONLY | The migration contains schema/security construction, not planner-data import. Secret scan passed; the verification used aggregate counts only and read no planner content. Owner confirmed encrypted-backup custody. Any later owner-data projection is a separate gate. |
| 3. Input and content safety | PASS AT SOURCE | Shared JS/SQL vectors, exact-byte chunks, canonical identities, duplicate quarantine, lease/generation fencing, incomplete-stream rejection, tombstones, owner-orphan checks and client/server reconciliation passed CI #145. L0b remains a partial projection and cannot be a source-of-truth cutover. |
| 4. Browser and network controls | PASS / NO CHANGE | Both Full/Mobile controls and handlers remain fail-closed behind `enabled=false`. A schema-only apply changes no browser, Drive, LINE, Netlify, Auth, secret, CSP, redirect or provider configuration. |
| 5. Supply chain and deployment | PASS FOR SCHEMA ONLY | Exact `main`, migration blob `59aad11b...`, SHA-256 `75d07941...`, and immutable SQL were rechecked. The targeted connector operation ran once; no `db push`, source enablement, deploy, or unrelated source change occurred. |
| 6. Operations and recovery | PASS FOR SCHEMA ONLY | Refreshed B-1 artifact `9479566992` custody was Owner-confirmed and B-2 run `32618003121` passed before apply. Post-apply ledger/catalog/RLS/ACL/count/canary checks passed. The separately approved manual-import gate remains closed. |

Post-apply security advisors retain the intentional default-deny
`mtp_line_events` no-policy INFO and the pre-existing leaked-password-protection
WARN. They also report six
`authenticated_security_definer_function_executable` WARNs, one for each
reviewed importer RPC. Those six are expected for this contract: authenticated
execution is deliberate, while the RPCs are hardened by exact ACLs,
`auth.uid()` owner binding, empty `search_path`, RLS, lease/generation fencing,
and no direct table writes. They are accepted schema-gate residuals, not an
apply failure; any ACL/auth/search-path drift reopens the gate. The Auth warning
remains outside this scope and must be revisited before an Auth configuration
change.

## Mandatory staged gates

### Gate 0 — source and scope lock

- [x] L0b source is merged and remains disabled in Full and Mobile.
- [x] Migration blob and SHA-256 are frozen above.
- [x] Pre-apply Production project, PostgreSQL major version, ledger tail, and
      L0b absence were verified read-only.
- [x] Rechecked exact `main`, migration blob/hash, Production identity, ledger
      tail, L0b absence, Packet A ACL fingerprint, aggregate LINE counts, and
      the unrelated `aicc_*` canary immediately before apply.
- [x] Record the targeted pre-Production 6D decision above for this exact L0b
      schema operation. Another full historical source review is unnecessary
      unless a critical source/security contract changes.

### Gate 1 — fresh recoverable backup

- [x] Post-Packet-A backup/restore mechanics passed using refreshed B-1/B-2:
      backup run `32587955307`; Draft PR #83 exact head
      `48aaa7968ab76946095207d919a1db29cc3c7f05`; isolated restore run
      `32618003121` passed with zero output artifacts and no Production write.
- [x] Owner confirmed custody of refreshed encrypted artifact `9479566992`
      before its GitHub expiry `2026-08-23T17:33:07Z`; no artifact substitution
      was used.
- [x] Frozen backup contract: run `32587955307`, job `97067096268`, artifact
      `dashboard-supabase-backup-20260822T173203Z`, size `30428`, ZIP SHA-256
      `d771caa09a77e3b5e6f558dcdda155410c21ebadc786ec6434b1336791ce4d8d`,
      encrypted SHA-256
      `b7f651d32b7ac31225839484736e0c8d926e65523120bcc94924c5520a166807`,
      source head `bb11eae5632cc615dff3029b87e6413caad3a279`, Supabase CLI
      `2.111.0`.
- [x] Freeze the chosen backup run/job/artifact name, size, expiry, ZIP digest,
      encrypted-archive digest, source head, CLI, and PostgreSQL image in the
      exact-operation approval request.

### Gate 2 — schema-only Production apply

- [x] Obtain separate Owner approval naming the exact project, current `main`,
      migration blob/SHA-256, provider migration name, and backup evidence.
- [x] Use only a targeted `apply_migration` call with the exact frozen SQL bytes.
      Never use `supabase db push`; repository order and unrelated provider
      history make a bulk push unsafe.
- [x] No baseline drift, unexpected pending migration, project mismatch,
      source/hash mismatch, provider/tool behavior change, broad grant, data DML,
      or unrelated `aicc_*` impact was found.
- [x] Record provider version `20260823055451_l0b_data_foundation`.

### Gate 3 — schema/catalog verification

- [x] Confirm exactly nine L0b tables and six reviewed authenticated RPCs exist.
- [x] Confirm all nine tables are owned by `postgres`, have RLS enabled, and have
      exactly the reviewed owner-scoped SELECT policies.
- [x] Confirm client roles have no direct writes; staging is not client-readable;
      sequence/function/table/column privileges match the frozen migration.
- [x] Run aggregate-only owner-orphan, FK, function-security, policy, ACL,
      default-privilege, ledger, Packet A, and unrelated `aicc_*` canaries.
- [x] Confirm no planner rows were imported and Full/Mobile importer controls
      remain disabled. A schema-only apply is not an import or M6 acceptance.

### Gate 4 — manual import enablement and acceptance

- [x] Create a separate source PR that deliberately enables only the reviewed
      manual controls in both Full and Mobile. PR #86 runtime source commit
      `db3c8cded9359b402eb6316bb4c21067db8195d4`, tree
      `9cb2bad40bd18f249aa2ad25903c2c50e351dd56`, changes only
      `l0b-import.js` and `build/l0b-import.test.mjs`. Drive-save, Auto-sync,
      LINE and mutation paths remain isolated from the importer.
- [x] Run full build, package, secret, browser, PostgreSQL 17, and negative-gate
      verification at exact source head. GitHub Actions `verify` #150, run
      `32623877211`, passed all four jobs. Targeted 6D found no new
      Critical/High issue and returned `CONDITIONAL PASS` for a separate
      merge/publication decision.
- [x] Obtain and execute the separate exact-head merge/publication approval.
      PR #86 exact head `4830b6cf82aa1ff65306b775e2382d84e96af21e`,
      tree `34f3859b997a530d80c4387bca0212388b731dc7`, merged into exact base
      `main@167b84cfdfeedd19c0396b2f520e9806244eec3b` as
      `main@8fc88a8a94017eadb58b98adecbb87e22d65496c` with the same tree.
      Exact-head CI #151, post-merge CI #152 and Pages deployment #117 passed.
- [ ] Obtain a separate exact approval before reading/projecting owner planner
      data or starting the first authenticated import.
- [ ] Owner initiates the import from the signed-in planner. Verify only bounded
      aggregate evidence: batch terminal state, declared/received chunks,
      reject counts/classes, active/tombstone counts, and equal client/server
      reconciliation hashes. Do not expose raw planner content in logs/chat.
- [ ] On partial/reject/mismatch, keep browser + Drive authoritative, do not
      retry automatically, do not enable shadow/dual write, and correct the
      authoritative planner only through a separately reviewed Owner action.

### Gate 5 — L0b closure

- [x] Record the schema-only migration version, exact source, backup custody,
      aggregate catalog, RLS/ACL, zero-row state, Gate 4 publication, rollback
      status, and residuals in context/security/KPI documentation. Import
      reconciliation and Owner acceptance remain pending Gate 4.
- [x] Keep browser + Google Drive authoritative. L0b remains a partial projection
      and does not authorize direct Supabase Todo mutation or L1 cutover.

## Rollback and stop conditions

The migration is additive. Before any import, the safe rollback is to revert the
manual-control publication and leave the unused schema in place while a
separately approved least-privilege forward fix is prepared. Do not drop tables,
rewrite migration history, restore Production, or delete evidence as an
automatic response.

After an import, no automatic destructive rollback is allowed. Preserve Drive as
the source of truth, stop further imports, retain batch evidence, and require a
separate reviewed recovery plan.

## L1 boundary

L1 remains unstarted. Before any source-of-truth cutover, the schema must add and
reconcile every operational field the planner requires, including at minimum
progress, assignee, project, recurrence, and dependencies; an opaque LINE
reference must be designed; and Drive demotion to backup/export/archive must have
its own design, migration, rollout, and Owner approval.
