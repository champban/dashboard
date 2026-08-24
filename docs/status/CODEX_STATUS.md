# CODEX STATUS — L1A Direct Supabase Todo Source Contract

STATUS: SOURCE MERGED AND PUBLISHED / CI VERIFIED / NOT PRODUCTION

PROGRESS: L1A source contract, targeted 6D, merge, post-merge CI and GitHub Pages
publication complete; migration promotion and client activation remain blocked

AGENT: Codex / ChatGPT

TASK / LANE: L1A source-only schema/API/security contract

CLASSIFICATION: `SEQUENTIAL_ONLY`

ACTIVE WRITER: Codex only

BRANCH: `main`

SOURCE PR HEAD: `b0b7c5b1748b19649d8b46cb114f9ba6519e62e6`

MERGE SHA: `2ec6e3d1576b18643514fa980da22cb41bb2e893`

MERGE TREE: `868e944d49880ae92c09838395c339b52fdef380`

M0: `2026-08-24T10:50:50+07:00` (`Asia/Bangkok`)

## Baseline and authority

- L0b M6b first import and bounded aggregate acceptance are closed at the base.
- Browser + Google Drive remain authoritative.
- The L1A SQL file is a non-migration source contract and runs only against a
  disposable PostgreSQL 17 database.
- PR #89 exact-head and post-merge `verify` runs passed `5/5`; Pages
  build/deploy/report passed and the live artifact is byte-identical.
- No second import, Production migration, direct Todo write, client activation,
  Storage/Auth/secret/provider change, Drive demotion or cutover has occurred.

## Completed source scope

- Added operational task/event fields and direct/import lineage constraints.
- Added stable event-window UUID, dependency graph, opaque external-reference
  digest, and private idempotency receipt contracts.
- Added owner-bound, versioned, idempotent task create/update/tombstone RPCs.
- Proved ACL/RLS, cross-owner denial, validation, conflict, retry, tombstone,
  dependency-cycle and stable-identity behavior in PostgreSQL 17 CI.
- Full npm/build/package/secret/diff gates and exact-head targeted 6D passed.
- Browser + Google Drive remain authoritative.

## Hard stops

- No Supabase or migration-history write.
- No generic `supabase db push`.
- No planner-data read/copy, repeat import/backfill, direct Todo mutation,
  shadow/dual write, client activation, or source-of-truth cutover.
- No Supabase/Netlify/LINE/Drive/secret/Auth/Environment change.
- No Production apply, client activation, cleanup, deletion, dependency change,
  or unrelated refactor.
- Do not place the source contract in `supabase/migrations/` or invent a
  migration filename without the pinned CLI and an exact promotion gate.

## Next exact gates

1. Freeze the L1B full-planner parity design/API/data/storage boundary.
2. Before migration promotion, obtain independent source review and qualify a
   current recoverable backup plus isolated restore proof.
3. Run read-only Production preflight and create the migration only with the
   pinned Supabase CLI in a suitable environment.
4. Require an exact migration-byte/hash/project/rollback approval before apply.
5. Treat apply, client activation, reconciliation and authority cutover as
   later separately approved gates.

OWNER ACTION: none for the completed source merge/publication. The next source
lane is L1B design/parity; Production migration, import/reconciliation and
cutover remain separately gated.
