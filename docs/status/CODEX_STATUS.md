# CODEX STATUS — Gate Hardening Packet A

STATUS: LOCAL VERIFIED / SOURCE-ONLY / NOT MERGED / NOT APPLIED / NOT DEPLOYED

PROGRESS: local verification complete; Draft PR and PostgreSQL 17 CI pending

AGENT: Codex / ChatGPT

TASK / LANE: L0b UI fail-closed gate + `RISK-L0A-ACL-1` source remediation

CLASSIFICATION: `SEQUENTIAL_ONLY`

ACTIVE WRITER: Codex only

BRANCH: `feature/l0b-gate-hardening`

BASE SHA: `67fe86cac29b3facecd08290a3000ba23bc8a684`

M0: `2026-08-20T15:37:14+07:00` (`Asia/Bangkok`)

## Authorized scope

- Hide/disable the L0b Full/Mobile import controls until backend activation.
- Add one unapplied ACL migration for `postgres` defaults and exact existing
  `mtp_line_*` grants; do not alter existing `aicc_*` objects.
- Add PostgreSQL 17 ACL/RLS/default/repeatability/no-data-change tests.
- Correct PR #76 merge/publication documentation drift.
- Run local gates, open one Draft PR, and request one targeted critical review.

## Hard stops

- No merge, GitHub Pages publication, deployment, or Production migration apply.
- No L0b import/backfill/data copy, shadow/dual write, or L1 work.
- No Supabase/Netlify/LINE/Drive/secret/environment setting change.
- No `supabase_admin` provider-default change without separate Owner approval.
- No retention, destructive cleanup, backup/branch/environment/secret deletion,
  dependency change, or unrelated refactor.

## Current source artifacts

- `l0b-import.js`, `src/App.jsx`, `mobile/index.html` — fail-closed UI gate.
- `supabase/migrations/20260820083714_line_acl_default_privilege_hardening.sql`
  — unapplied ACL-only source artifact.
- `supabase/tests/line_acl_hardening.test.sql` and runner — PostgreSQL 17 gate.
- `.github/workflows/verify.yml` — dedicated ACL/default-privilege CI job.

## Remaining gates

1. Local build/tests/secret scan and generated-artifact parity.
2. Draft PR exact-head CI, including PostgreSQL 17.
3. One Claude targeted critical review only.
4. Stop for separate Owner merge decision; merge does not authorize deploy/apply.

OWNER ACTION: none until exact-head CI and targeted review complete.
