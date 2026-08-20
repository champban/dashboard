# CODEX STATUS — L0b Normalized Data Foundation

STATUS: LOCAL VERIFIED / SOURCE-ONLY / NOT APPLIED / NOT DEPLOYED

PROGRESS: source and local verification complete; Draft PR / PostgreSQL 17 CI pending

AGENT: Codex / ChatGPT

TASK / LANE: L0b normalized Supabase data foundation

CLASSIFICATION: `SEQUENTIAL_ONLY`

ACTIVE WRITER: Codex only

BRANCH: `feature/l0b-data-foundation`

BASE SHA: `488d4a75e73566284107cbe81e0362c2fa330f6b`

M0: `2026-08-20T10:27:38+07:00` (`Asia/Bangkok`)

M2/M3: `2026-08-20T11:00:35+07:00` — build/harness/audit/package, full
browser regression chain, shared canonical/exact-byte vectors, secret scan,
static SQL gate, and diff check passed. Local `psql` is unavailable; PostgreSQL
17 migration execution is delegated to the Draft-PR CI service only.

## Authorized scope

- Source-only implementation on one feature branch.
- One Draft PR to `main`.
- Local/build/CI tests and documentation.
- Final Exact-HEAD 6D Review #2 after tests.

## Binding design decisions

- Review #1 is closed; no repeated Claude design review.
- D-1 = `A + A1`: preserve source shape, record shape anomalies, and keep
  identity collisions as whole-batch quarantine with manual planner repair.
- Exactly nine L0b tables and six authenticated import RPCs.
- Google Drive remains authoritative; L0b is a partial normalized projection.
- Manual-only import in Full and Mobile; no automatic/shadow/dual-write path.
- `RISK-L0A-ACL-1` remains open and outside L0b implementation.

## Hard stops

- No Supabase migration apply or provider mutation.
- No backfill, Production data copy, or dual write.
- No merge, deployment, Netlify/LINE/Drive/provider/secret change.
- No L1 direct Todo mutation or source-of-truth cutover.
- No cleanup of backups, branches, environments, secrets, or ledger rows.

## Current source artifacts

- `supabase/migrations/20260820032749_l0b_data_foundation.sql` — unapplied.
- `l0b-import.js` — explicit browser import bridge.
- Full/Mobile one-button manual controls.
- PostgreSQL 17 SQL/RLS lifecycle, static SQL, and browser tests.
- `docs/L0B_DATA_FOUNDATION.md` plus KPI/security/context updates.

## Next gate

Complete local verification, open one Draft PR, wait for CI, then request the
single remaining independent review: Final Exact-HEAD 6D Review #2. Stop before
merge or any provider/Production action.

OWNER ACTION: none while implementation/testing remains inside approved scope.
