# CODEX STATUS — L1A Direct Supabase Todo Source Contract

STATUS: SOURCE IMPLEMENTED / LOCAL VERIFICATION IN PROGRESS / NOT PRODUCTION

PROGRESS: L1A source contract, tests, CI gate and documentation prepared; exact-
head PostgreSQL 17 CI and targeted source closure remain

AGENT: Codex / ChatGPT

TASK / LANE: L1A source-only schema/API/security contract

CLASSIFICATION: `SEQUENTIAL_ONLY`

ACTIVE WRITER: Codex only

BRANCH: `feature/l1a-direct-supabase-todo`

BASE SHA: `a5a2a31f3c0ffe195ff56108c6cdf1b68f66b307`

BASE TREE: `cf11ca8344b2787a92d0e43e19bc9f67ddc5cdf9`

M0: `2026-08-24T10:50:50+07:00` (`Asia/Bangkok`)

## Baseline and authority

- L0b M6b first import and bounded aggregate acceptance are closed at the base.
- Browser + Google Drive remain authoritative.
- The L1A SQL file is a non-migration source contract and runs only against a
  disposable PostgreSQL 17 database.
- No second import, Production migration, direct Todo write, client activation,
  Storage/Auth/secret/provider change, Drive demotion or cutover has occurred.

## Current source scope

- Add operational task/event fields and direct/import lineage constraints.
- Add stable event-window UUID, dependency graph, opaque external-reference
  digest, and private idempotency receipt contracts.
- Add owner-bound, versioned, idempotent task create/update/tombstone RPCs.
- Prove ACL/RLS, cross-owner denial, validation, conflict, retry, tombstone,
  dependency-cycle and stable-identity behavior in PostgreSQL 17 CI.
- Run full npm/build/package/secret/diff gates and prepare exact-head 6D evidence.
- Browser + Google Drive remain authoritative.

## Hard stops

- No Supabase or migration-history write.
- No generic `supabase db push`.
- No planner-data read/copy, repeat import/backfill, direct Todo mutation,
  shadow/dual write, client activation, or source-of-truth cutover.
- No Supabase/Netlify/LINE/Drive/secret/Auth/Environment change.
- No Production apply, deployment, merge/publication, cleanup, deletion,
  dependency change, or unrelated refactor.
- Do not place the source contract in `supabase/migrations/` or invent a
  migration filename without the pinned CLI and an exact promotion gate.

## Next exact gates

1. Complete local static/npm/build/secret/diff verification.
2. Open a source PR and require exact-head PostgreSQL 17 plus repository CI.
3. Freeze exact HEAD/base/diff and complete targeted 6D/independent review.
4. Obtain a new exact approval before merge/publication.
5. Treat migration promotion, backup/preflight/apply, client activation,
   reconciliation and cutover as later separately approved gates.

OWNER ACTION: none until exact-head source evidence is ready. The next decision
will identify exact PR HEAD/base/diff/CI/review status; it will not include a
Production migration or cutover.
