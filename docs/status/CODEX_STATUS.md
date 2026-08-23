# CODEX STATUS — L0b Schema-Only Closure

STATUS: PRODUCTION SCHEMA/CATALOG VERIFIED / DOCS-ONLY CLOSURE IN PROGRESS

PROGRESS: L0b Gates 0-3 complete; schema active with zero rows; importer and
manual import remain disabled; docs-only closure branch prepared

AGENT: Codex / ChatGPT

TASK / LANE: L0b schema-only Production evidence closure

CLASSIFICATION: `SEQUENTIAL_ONLY`

ACTIVE WRITER: Codex only

BRANCH: `docs/l0b-schema-closure`

BASE SHA: `1ece60919d0a4ecdeafcfa4c05b509fc9543492a`

## Verified baseline

- `main@1ece60919d0a4ecdeafcfa4c05b509fc9543492a`, tree
  `e3ab91ca505aee4a0dbcbdff5c5e42e0465ffd1a`.
- Packet A provider migration
  `20260822162710_line_acl_default_privilege_hardening` is applied and
  catalog-verified; functional smoke is Owner-waived / not executed.
- Refreshed B-2 Draft PR #83 remote head
  `48aaa7968ab76946095207d919a1db29cc3c7f05`, tree
  `c573d02e52aae7613724b874bd3dd7e7ba6736bf`; verify/source-safety/restore
  runs passed, output artifacts zero, Production unchanged.
- Supabase `Dashboard` (`qjaywadzvwvcspdsjxth`) is `ACTIVE_HEALTHY` on
  PostgreSQL `17.6.1.147`.
- Owner confirmed custody of refreshed encrypted backup artifact `9479566992`.
- Exact migration blob `59aad11b7b0d3761bc62d7673c7102f164e25f8a`,
  SHA-256 `75d0794155cfcc4a3575868f92a16a5d670f6660787c30611e3955a98fe04e8c`,
  was applied once through targeted `apply_migration`; provider version is
  `20260823055451_l0b_data_foundation`.
- Production L0b table/RPC counts are `9/9` and `6/6`; RLS/policy/ACL/function-
  security/trigger/index/orphan/canary verification passed; all nine tables are
  empty and both import controls remain disabled.
- Six expected advisor WARNs cover the intended authenticated `SECURITY DEFINER`
  RPCs; exact ACLs, `auth.uid()` binding, empty `search_path`, RLS, and fencing
  remain verified.
- Browser + Google Drive remain authoritative.

## Current docs-only scope

- Record the completed L0b schema-only operation and exact aggregate evidence in
  durable context, security, KPI, and readiness records.
- Run diff, Markdown/reference, secret, tests, build/package, and unchanged-
  migration verification.
- Open one Draft docs-only PR; do not merge it without exact approval.

## Hard stops

- No further Supabase or migration-history write.
- No generic `supabase db push`.
- No planner-data read/copy, import/backfill, shadow/dual write, or L1.
- No Supabase/Netlify/LINE/Drive/secret/Auth/Environment change.
- No deployment, merge, cleanup, deletion, dependency change, or unrelated
  refactor.
- Do not alter either reviewed migration file or B-2 workflow/source packet.

## Next exact gates

1. Verify and open this docs-only Draft PR from exact `main`.
2. Wait for exact-head source CI; do not merge without exact approval.
3. Separately design, review, and approve manual-control enablement and first Owner-
   initiated import; keep browser + Drive authoritative.

OWNER ACTION: none until exact-head Draft-PR CI passes. The next decision is the
exact docs-only merge; manual enablement/import remains a later separate gate.
