# Packet A Production Readiness

Status: **SOURCE MERGED / PROVIDER GATE A CLOSED / PRODUCTION APPLY NOT
AUTHORIZED**

Decision date: `2026-08-21` (`Asia/Bangkok`)

This packet records the remaining controls for the LINE ACL/default-privilege
hardening migration. It does not authorize a database write, migration-history
change, import, deployment, provider change, cleanup, or L1.

## Exact source

- Repository: `champban/dashboard`
- Current source merge: `main@9a5a95f5c9065214c0418def80a3086fdf79d323`
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

## Risk that remains open

`RISK-L0A-ACL-1` remains open in Production only for:

1. broad `postgres` defaults for future tables, sequences, and functions; and
2. broad existing grants on the exact `mtp_line_*` tables/functions.

The Dashboard setting for automatic exposure affects future defaults and does
not repair existing object grants. Packet A is still required. The risk closes
only after the exact ACL migration is separately approved, applied, catalog-
verified, and functionally smoke-tested.

Read-only Production evidence on `2026-08-21` confirmed:

- applied migrations stop at L0a
  `20260818154406_line_webhook_event_reliability`;
- none of the nine L0b tables exists;
- Packet A is not applied;
- broad `postgres` defaults and existing `mtp_line_*` grants remain; and
- temporary Supabase support access remains outside this procedure.

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

All boxes are required; none is satisfied by this document alone.

- [x] PR #77 source merged from exact reviewed head; CI #127 passed.
- [x] Provider Gate A closed as an accepted provider-managed residual.
- [ ] Fresh logical backup of roles, schema, and data created.
- [ ] Backup decrypted/integrity-checked and restore-tested in isolation.
- [ ] Owner confirms recoverable backup custody; no secret is posted to chat.
- [ ] Read-only preflight re-verifies current `main`, migration SHA-256,
      Production migration list, required LINE objects/functions, row-count
      baselines, L0b table count `0`, and unrelated `aicc_*` ACL fingerprint.
- [ ] Targeted pre-Production 6D decision records no unresolved Critical/High
      blocker and links this exact source/apply procedure.
- [ ] Owner separately approves the exact targeted migration operation.

No further full Claude review is required while the reviewed SQL and permission
contract remain unchanged. Request a targeted re-review only if schema,
migration bytes, RLS, grants, identity, secrets, apply semantics, or release SHA
changes.

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
7. Run bounded owner smoke: authenticated snapshot/save path, LINE `menu`, and
   Edit -> Cancel. Verify no unexpected ledger/mutation change.
8. Update `PROJECT_CONTEXT.md`, `docs/SECURITY_6D_AUDIT.md`, and this packet with
   the applied version, aggregate evidence, decision, and rollback status.

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
