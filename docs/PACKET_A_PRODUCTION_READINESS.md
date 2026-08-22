# Packet A Production Readiness

Status: **PRODUCTION ACL APPLY CATALOG-VERIFIED / FUNCTIONAL SMOKE
OWNER-WAIVED**

Decision date: `2026-08-22` (`Asia/Bangkok`)

This packet records the completed exact LINE ACL/default-privilege hardening
apply and its verification. It does not authorize any further database write,
rerun, import, deployment, provider change, cleanup, or L1.

## Exact source

- Repository: `champban/dashboard`
- Production apply base: `main@a061319cc6762fe58243f1e10a40e0737489aa2e`,
  tree `d18a9f466f1ee62021a9d41541cfd0fcbe14b73e`
  (documentation-only PR #81 preflight/6D closure)
- Last source-changing Packet A merge:
  `main@9a5a95f5c9065214c0418def80a3086fdf79d323`
- PR #77 reviewed/Owner-approved source head:
  `a9c99719e0e6abdf2a5f1fbedd282328f812577b`
- Exact reviewed tree: `6479a43d73b04351f842e985a538afada694ce5e`
- Exact-head CI: run #127, four of four jobs passed
- Migration source:
  `supabase/migrations/20260820083714_line_acl_default_privilege_hardening.sql`
- Migration blob: `3a6e760e183889b72c13df48bd72b10a9655c69f`
- Migration SHA-256:
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`

Changing the migration bytes, schema/RLS/permission contract, or release source
invalidates this evidence and requires targeted review. Documentation-only
clarification does not reopen the completed L0b reviews.

## Provider Gate A decision

**CLOSED — ACCEPTED PROVIDER-MANAGED RESIDUAL.**

Supabase's current official documentation says the `supabase_admin` default ACL
entries are part of its standard permission model, do not bypass RLS by
themselves, and are created by an internal role that cannot authenticate through
the Data API. Their presence in `pg_default_acl` is therefore expected provider
state and is not, by itself, a Production blocker. Customer-side automation must
not attempt to alter the provider-owned role.

Evidence:

- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase PR #47952: clarify supabase_admin default privileges](https://github.com/supabase/supabase/pull/47952)
- [Supabase changelog: tables not exposed automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [PostgreSQL 17: ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
- [PostgreSQL 17: Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

This is not a claim of zero risk in every channel. `service_role` remains
privileged, functions require explicit `EXECUTE` control, and whole-table
operations such as `TRUNCATE` are not governed by RLS.

## Risk disposition

`RISK-L0A-ACL-1` is **CLOSED WITH AN OWNER-ACCEPTED FUNCTIONAL-ASSURANCE
RESIDUAL**. The exact ACL migration was applied and catalog-verified. Broad
`postgres` defaults and existing `mtp_line_*` grants were removed and rebuilt
to the reviewed least-privilege contract.

The Owner explicitly waived the three bounded functional smoke checks on
`2026-08-22`. They were **NOT EXECUTED** and must not be represented as PASS.
The residual is reduced assurance that the browser snapshot/save and LINE
`menu` / Edit -> Cancel paths still behave after the privilege reduction. Any
permission symptom or future LINE/Auth/ACL change reopens this smoke gate.

Read-only Production evidence on `2026-08-21` confirmed:

- applied migrations stop at L0a
  `20260818154406_line_webhook_event_reliability`;
- none of the nine L0b tables exists;
- Packet A is not applied;
- broad `postgres` defaults and existing `mtp_line_*` grants remain; and
- temporary Supabase support access remains outside this procedure.

## Backup and isolated restore evidence

- B-1 backup: run `32149051510`, attempt 2, job `96681690187` — `SUCCESS`.
- Artifact: ID `9452687931`, name
  `dashboard-supabase-backup-20260821T153930Z`, 30,451 bytes, ZIP SHA-256
  `8e4ab3857f546e027df7b5ee7867e27070798fac3f77a292bbc8c92bef9812d8`.
- Encrypted archive SHA-256:
  `1f74262d1b341ed919b0a8f8fe29ffb852946cd5d6ab1700f13e97ede97c91e4`.
- Backup source: `ops/l0a-one-time-production-backup@bb11eae5632cc615dff3029b87e6413caad3a279`.
- Owner confirmed custody of a downloaded recoverable copy without disclosing
  the passphrase. GitHub artifact expiry is `2026-08-22T15:40:38Z`; after
  expiry, any new restore requires a separately approved B-1 run.
- B-2 source: Draft PR #79 exact head
  `796b42a41b5e33f96f2ecc0752baf691c645d35c`, tree
  `d79ffb9b1eb3d5c6ed9380058aaedac1d9266b9f`.
- B-2 result: run `32577304437`, source-safety job `97041400164`, isolated
  restore job `97041418226` — all `SUCCESS`. The final log recorded
  `Packet A Backup Gate B-2 isolated restore: PASS` at
  `2026-08-22T14:01:43.5534694Z`.
- The disposable target used the pinned PostgreSQL 17 image, network mode
  `none`, no published port, a reviewed Storage 61-62 compatibility bridge,
  atomic roles/schema/data restore, and exact reconciliation. It uploaded no
  output artifact and never connected to Production.
- The approval label was removed. PR #79 remains Draft and must not be merged.
  Its restrictive Environment rule `refs/pull/79/merge` remains outside this
  documentation-only closure and requires separate cleanup approval.

B-2 proves logical recoverability of this backup. It does not prove Packet A
hardened ACLs because the backup predates Packet A, and it does not claim exact
migration-history identity because B-1 did not dump that ledger separately.

## Critical apply-path rule

**Do not run `supabase db push` for Packet A.**

Repository order contains the still-unapplied earlier migration
`20260820032749_l0b_data_foundation.sql`. A normal push can apply L0b together
with Packet A and would violate the separate L0b approval boundary.

The only candidate execution path for a later approval is a targeted Supabase
`apply_migration` operation that receives the exact SQL bytes and migration name
`line_acl_default_privilege_hardening`. It must apply only that supplied query
and return a migration record. Capture the provider-assigned migration version
and map it to the repository filename in `PROJECT_CONTEXT.md` immediately after
verification.

If the targeted operation is unavailable, its behavior has changed, the file
hash differs, or it would include another migration, stop. Do not fall back to
`db push`, bulk grants, manual migration-history edits, or copied SQL without a
new Owner decision.

## Gates before any Production apply

All boxes are required. Only evidence-backed completed gates are marked.

- [x] PR #77 source merged from exact reviewed head; CI #127 passed.
- [x] Provider Gate A closed as an accepted provider-managed residual.
- [x] Fresh logical backup of roles, schema, and data created — B-1 run
      `32149051510`, attempt 2.
- [x] Backup decrypted/integrity-checked and restore-tested in isolation — B-2
      run `32577304437`.
- [x] Owner confirms recoverable backup custody; no secret was posted to chat.
- [x] Read-only preflight re-verifies current `main`, migration SHA-256,
      Production migration list, required LINE objects/functions, row-count
      baselines, L0b table count `0`, and unrelated `aicc_*` ACL fingerprint.
- [x] Targeted pre-Production 6D decision records no unresolved Critical/High
      blocker to the exact ACL-only remediation and links this source/apply
      procedure.
- [x] Owner approved the exact targeted operation; Supabase recorded
      `20260822162710_line_acl_default_privilege_hardening`.

No further full Claude review is required while the reviewed SQL and permission
contract remain unchanged. Request a targeted re-review only if schema,
migration bytes, RLS, grants, identity, secrets, apply semantics, or release SHA
changes.

## Read-only preflight and targeted 6D evidence

The Owner authorized read-only Production inspection and then separately
authorized this targeted 6D review/documentation. Neither authorization included
a migration apply.

Read-only evidence on `2026-08-22` (`Asia/Bangkok`) was stable across repeated
catalog reads:

- GitHub base `main@bc42edf5ecac980462d4e9def4cdd2d9078299dc`, tree
  `17f0b4940b3f04c7f0daea0865645d0fe395488a`; the migration remained blob
  `3a6e760e183889b72c13df48bd72b10a9655c69f` and SHA-256
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`.
- Production project `qjaywadzvwvcspdsjxth` was `ACTIVE_HEALTHY` on
  PostgreSQL 17.6. Applied migrations stopped at
  `20260818154406_line_webhook_event_reliability`; Packet A and L0b were not
  applied.
- All five required `mtp_line_*` tables existed with RLS enabled, all four
  required RPC signatures existed, and the ten-policy fingerprint was stable at
  `2596ad76480f6484ae9ea0523eb4d674`.
- Stable row counts were accounts `1`, events `5`, link codes `1`,
  mutations `17`, and snapshots `1`. The pre-apply LINE ACL fingerprint was
  `8e36fd84519a1aed7efb8ab52b03d14b` over 138 catalog parts.
- All nine L0b tables were absent. The unrelated `aicc_*` ACL/catalog/policy/
  function canary was stable across two reads at
  `1a120bb49bdf81711391bc8a45abbd88` over 409 parts. No earlier digest
  had been stored, so this two-read-stable value is the authoritative pre-apply
  canary for later comparison.
- Exact reviewed Packet A source head
  `a9c99719e0e6abdf2a5f1fbedd282328f812577b` retained successful verify run
  `32352059807` (#127). Repository tests/build/release checks and secret scans
  previously passed; the later `main` changes were documentation-only.
- Supabase security advisors reported one informational expected
  `mtp_line_events` RLS-without-policy finding and one pre-existing warning
  that leaked-password protection is disabled. The former is intentional
  default-deny client state; the latter is an Auth hardening follow-up outside
  this ACL-only migration.

**Targeted 6D decision: CONDITIONAL PASS FOR THE EXACT ACL-ONLY APPLY GATE.**
There is no unresolved Critical/High blocker to applying the exact reviewed
remediation through targeted `apply_migration`. `RISK-L0A-ACL-1` remains open
until that apply and the required post-apply checks succeed. The Auth warning is
a non-blocking follow-up owned by P'Boy, due `2026-09-22` or before any Auth
configuration change, whichever comes first.

This decision does not approve the targeted operation itself. Generic
`supabase db push`, L0b, data movement, deployment, provider/environment
changes, cleanup, and L1 remain prohibited. Stop if `main`, migration bytes,
project identity, backup custody, targeted-operation semantics, or any baseline
fingerprint/count differs.

## Production apply and catalog verification

The Owner approved only the exact targeted operation after the final lock
recheck. Supabase applied migration
`20260822162710_line_acl_default_privilege_hardening` on
`2026-08-22` (`Asia/Bangkok`) from the exact migration bytes above.

Post-apply evidence:

- migration ledger gained exactly one record; L0b and no other migration were
  applied;
- `postgres` future defaults now contain only owner privileges for public
  tables, sequences, and functions, including a global function default with no
  `PUBLIC EXECUTE`;
- `anon` has no target table or RPC access;
- `authenticated` has only the reviewed SELECT/INSERT/UPDATE table contract,
  with `mtp_line_mutations` UPDATE limited to `applied_at`, `error_code`,
  `status`, and `updated_at`;
- `service_role` has only the reviewed table contract and executes the four
  target RPCs; client roles execute none;
- all five target tables remained owned by `postgres`, RLS-enabled, with ten
  policies unchanged;
- row counts remained accounts/events/link-codes/mutations/snapshots =
  `1/5/1/17/1`;
- all nine L0b tables remained absent;
- the reproducible `aicc_*` v2 canary remained
  `848e24b1452c3c4e5ff6b7b9ce308044` over 218 parts;
- the post-apply LINE v2 fingerprint was stable across two reads at
  `f939987598538c846c82d85942a37037` over 61 parts; and
- security advisors reported no new finding: the intentional
  `mtp_line_events` no-policy INFO and pre-existing Auth leaked-password WARN
  remained.

The operation used no data DML and required no rollback. The Owner then directed
that the three bounded functional smoke checks be skipped and assumed successful.
For evidence accuracy, this packet records them as **OWNER-WAIVED / NOT
EXECUTED**, never as verified PASS.

## Required post-apply verification

Use catalog/aggregate evidence only; do not expose user content, LINE user IDs,
webhook bodies, tokens, URLs, or secrets.

1. Record the migration version returned by the targeted apply and confirm that
   neither L0b nor another pending migration was recorded/applied.
2. Confirm `postgres` future defaults no longer grant API roles broad table,
   sequence, or function access, including `PUBLIC EXECUTE` on future functions.
3. Confirm the exact `mtp_line_*` table, column, and function ACL matrix matches
   the reviewed migration. In particular, `anon` has no target access and
   `authenticated` has no `TRUNCATE`, `DELETE`, `REFERENCES`, `TRIGGER`, or
   `MAINTAIN` privilege.
4. Confirm RLS remains enabled and policies are unchanged on every target table.
5. Confirm before/after row counts are identical for all five `mtp_line_*`
   tables and the unrelated `aicc_*` ACL fingerprint is unchanged.
6. Confirm the nine L0b tables are still absent and Google Drive/browser planner
   remains authoritative.
7. **OWNER-WAIVED / NOT EXECUTED:** authenticated snapshot/save path, LINE
   `menu`, and Edit -> Cancel. This is an accepted assurance residual, not PASS.
8. Record the applied version, aggregate evidence, waiver decision, and rollback
   status in `PROJECT_CONTEXT.md`, `docs/SECURITY_6D_AUDIT.md`, KPI, and this
   packet through the docs-only closure PR.

## Failure and recovery

The migration is ACL-only, transactional, repeatable, and contains no data DML.
Do not restore the old broad grants as a routine rollback. If verification finds
a missing legitimate permission, keep data untouched and use a separately
approved least-privilege forward fix for the exact object/role. If source hash,
preconditions, backup, targeted apply isolation, or catalog checks fail, stop
before smoke/import and keep L0b disabled.

The current browser/Google Drive and LINE snapshot/mutation paths remain the
recovery path. No L0b import, source-of-truth cutover, queue retirement, provider
change, cleanup, or L1 work is part of Packet A.
