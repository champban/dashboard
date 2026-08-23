# L0b Production Readiness

Status: **READ-ONLY BASELINE VERIFIED / PRODUCTION APPLY NOT AUTHORIZED**

Decision date: `2026-08-23` (`Asia/Bangkok`)

This packet stages the next roadmap gate after Packet A. It does not authorize a
database write, migration apply, planner-data read/copy, import, source enablement,
deployment, provider/Auth/secret change, cleanup, merge, or L1.

## Exact source boundary

- Repository: `champban/dashboard`
- Current base: `main@eeac0ba1c542a17e3d9570f34dba936a20416c6e`
- Current base tree: `fc2db3abf19a23307d70bca0723c121b62c923bc`
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

## Read-only Production baseline

Verified through the authenticated Supabase connector on `2026-08-23`:

- Project `Dashboard` (`qjaywadzvwvcspdsjxth`) is `ACTIVE_HEALTHY` on
  PostgreSQL `17.6.1.147`.
- The applied ledger ends at
  `20260822162710_line_acl_default_privilege_hardening`.
- L0b tables present: `0/9`.
- L0b RPC names present: `0/6`.
- No SQL DDL/DML, import, provider write, secret read, or planner-content query
  was performed to establish this baseline.

Browser + Google Drive remain authoritative. Packet A is catalog-verified with
functional smoke explicitly Owner-waived / not executed. That residual must be
reopened before any L0b action that also changes LINE/Auth/ACL behavior; the
L0b schema-only apply below does not do so.

## Targeted pre-Production 6D decision

**Decision: CONDITIONAL PASS — EXACT L0b SCHEMA-ONLY APPLY REMAINS BLOCKED ON
QUALIFYING BACKUP CUSTODY AND SEPARATE EXACT-OPERATION OWNER APPROVAL.**

No unresolved Critical or High source finding blocks preparation of the exact
schema-only operation. This decision does not authorize it.

| Dimension | Decision | Evidence / remaining condition |
|---|---|---|
| 1. Identity and access | CONDITIONAL PASS | PostgreSQL 17 CI #145 reapplied the frozen migration and passed the owner-composite FK, RLS, policy, RPC, direct-write denial, cross-owner denial, sequence and function-security lifecycle. Production still has `0/9` L0b tables and `0/6` RPCs, so exact post-apply catalog verification remains mandatory. |
| 2. Secrets and data | PASS FOR SCHEMA ONLY | The migration contains schema/security construction, not planner-data import. Secret scan passed. The read-only preflight used aggregate counts only and read no planner content. Backup custody and any later owner-data projection are separate gates. |
| 3. Input and content safety | PASS AT SOURCE | Shared JS/SQL vectors, exact-byte chunks, canonical identities, duplicate quarantine, lease/generation fencing, incomplete-stream rejection, tombstones, owner-orphan checks and client/server reconciliation passed CI #145. L0b remains a partial projection and cannot be a source-of-truth cutover. |
| 4. Browser and network controls | PASS / NO CHANGE | Both Full/Mobile controls and handlers remain fail-closed behind `enabled=false`. A schema-only apply changes no browser, Drive, LINE, Netlify, Auth, secret, CSP, redirect or provider configuration. |
| 5. Supply chain and deployment | CONDITIONAL PASS | Current `main`, migration blob `59aad11b...`, SHA-256 `75d07941...`, one-commit docs tree, and CI #145 are frozen. Only targeted `apply_migration` may be considered; `db push`, source enablement, deploy and unrelated `aicc_*` changes are stop conditions. Recheck exact source immediately before apply. |
| 6. Operations and recovery | BLOCKED BEFORE APPLY | Post-Packet-A B-1/B-2 mechanics and isolated reconciliation passed, but refreshed artifact `9479566992` Owner custody is not confirmed. Confirm custody before expiry or run a new separately approved B-1/B-2. Post-apply ledger/catalog/RLS/ACL/count/canary checks and a separately approved manual-import gate remain mandatory. |

Current security-advisor state is unchanged: intentional default-deny
`mtp_line_events` no-policy INFO plus the pre-existing leaked-password-protection
WARN. The Auth warning remains outside this schema-only scope and must be revisited
before an Auth configuration change. Current performance INFO items concern
pre-existing LINE/unrelated `aicc_*` objects; they do not authorize modification
of those objects in L0b.

## Mandatory staged gates

### Gate 0 — source and scope lock

- [x] L0b source is merged and remains disabled in Full and Mobile.
- [x] Migration blob and SHA-256 are frozen above.
- [x] Current Production project, PostgreSQL major version, ledger tail, and
      L0b absence are verified read-only.
- [ ] Recheck `main`, migration blob/hash, Production identity, ledger tail,
      L0b absence, Packet A ACL fingerprint, aggregate LINE counts, and the
      unrelated `aicc_*` canary immediately before any apply.
- [x] Record the targeted pre-Production 6D decision above for this exact L0b
      schema operation. Another full historical source review is unnecessary
      unless a critical source/security contract changes.

### Gate 1 — fresh recoverable backup

- [x] Post-Packet-A backup/restore mechanics passed using refreshed B-1/B-2:
      backup run `32587955307`; Draft PR #83 exact head
      `48aaa7968ab76946095207d919a1db29cc3c7f05`; isolated restore run
      `32618003121` passed with zero output artifacts and no Production write.
- [ ] Owner custody of the refreshed encrypted artifact is not confirmed. Its
      GitHub expiry is `2026-08-23T17:33:07Z`. If custody is not confirmed before
      expiry, a new B-1 plus exact pinned isolated B-2 is required; no artifact
      substitution is allowed.
- [ ] Freeze the chosen backup run/job/artifact name, size, expiry, ZIP digest,
      encrypted-archive digest, source head, CLI, and PostgreSQL image in the
      exact-operation approval request.

### Gate 2 — schema-only Production apply

- [ ] Obtain separate Owner approval naming the exact project, current `main`,
      migration blob/SHA-256, provider migration name, and backup evidence.
- [ ] Use only a targeted `apply_migration` call with the exact frozen SQL bytes.
      Never use `supabase db push`; repository order and unrelated provider
      history make a bulk push unsafe.
- [ ] Stop on any baseline drift, unexpected pending migration, project mismatch,
      source/hash mismatch, provider/tool behavior change, broad grant, data DML,
      or unrelated `aicc_*` impact.
- [ ] Record the single provider-assigned version returned by the operation.

### Gate 3 — schema/catalog verification

- [ ] Confirm exactly nine L0b tables and six reviewed authenticated RPCs exist.
- [ ] Confirm all nine tables are owned by `postgres`, have RLS enabled, and have
      exactly the reviewed owner-scoped SELECT policies.
- [ ] Confirm client roles have no direct writes; staging is not client-readable;
      sequence/function/table/column privileges match the frozen migration.
- [ ] Run aggregate-only owner-orphan, FK, function-security, policy, ACL,
      default-privilege, ledger, Packet A, and unrelated `aicc_*` canaries.
- [ ] Confirm no planner rows were imported and Full/Mobile importer controls
      remain disabled. A schema-only apply is not an import or M6 acceptance.

### Gate 4 — manual import enablement and acceptance

- [ ] Create a separate source PR that deliberately enables only the reviewed
      manual controls in both Full and Mobile. Keep Drive-save, Auto-sync, LINE,
      and mutation paths isolated from the importer.
- [ ] Run full build, package, secret, browser, PostgreSQL 17, and negative-gate
      verification at exact head; obtain separate merge/deploy approval.
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

- [ ] Record migration version, exact source, backup custody, aggregate catalog,
      RLS/ACL, import reconciliation, rollback status, residuals, and Owner
      acceptance in context/security/KPI documentation.
- [ ] Keep browser + Google Drive authoritative. L0b remains a partial projection
      and does not authorize direct Supabase Todo mutation or L1 cutover.

## Rollback and stop conditions

The migration is additive. Before any import, the safe rollback is to keep both
client controls disabled and leave the unused schema in place while a separately
approved least-privilege forward fix is prepared. Do not drop tables, rewrite
migration history, restore Production, or delete evidence as an automatic
response.

After an import, no automatic destructive rollback is allowed. Preserve Drive as
the source of truth, stop further imports, retain batch evidence, and require a
separate reviewed recovery plan.

## L1 boundary

L1 remains unstarted. Before any source-of-truth cutover, the schema must add and
reconcile every operational field the planner requires, including at minimum
progress, assignee, project, recurrence, and dependencies; an opaque LINE
reference must be designed; and Drive demotion to backup/export/archive must have
its own design, migration, rollout, and Owner approval.
