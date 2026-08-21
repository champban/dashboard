# CODEX STATUS — Provider Gate A / Packet A Readiness

STATUS: SOURCE-DOCUMENTATION VERIFIED / NOT MERGED / NO PRODUCTION CHANGE

PROGRESS: Provider Gate A decision and Production readiness packet complete;
source PR/merge and every Production gate remain separate

AGENT: Codex / ChatGPT

TASK / LANE: Provider Gate A closure + Packet A Production readiness

CLASSIFICATION: `SEQUENTIAL_ONLY`

ACTIVE WRITER: Codex only

BRANCH: `docs/provider-gate-a-closure`

BASE SHA: `9a5a95f5c9065214c0418def80a3086fdf79d323`

## Verified baseline

- PR #77 merged exact reviewed source head
  `a9c99719e0e6abdf2a5f1fbedd282328f812577b`, tree
  `6479a43d73b04351f842e985a538afada694ce5e`.
- Exact-head CI #127 passed all four jobs.
- Packet A migration is merged source but unapplied.
- Production migrations stop at L0a
  `20260818154406_line_webhook_event_reliability`; L0b table count is zero.
- Provider Gate A is closed as an accepted provider-managed residual based on
  current official Supabase documentation.
- `RISK-L0A-ACL-1` remains open only for broad `postgres` defaults and existing
  `mtp_line_*` grants until Packet A apply and verification.

## Authorized scope

- Record the Provider Gate A decision in durable source documentation.
- Add one Packet A Production readiness procedure.
- Correct stale PR #77/CI/provider-gate status in existing docs.
- Run documentation, diff, secret, and unchanged-runtime/SQL verification.
- Open one source-documentation PR.

## Hard stops

- No migration apply or migration-history mutation.
- No generic `supabase db push`; it can also apply pending L0b.
- No import/backfill/data copy, shadow/dual write, or L1.
- No Supabase/Netlify/LINE/Drive/secret/environment change.
- No deployment, cleanup, deletion, dependency change, or unrelated refactor.
- Do not alter the exact reviewed Packet A migration bytes without targeted
  review.

## Current source artifacts

- `supabase/migrations/20260820083714_line_acl_default_privilege_hardening.sql`
  — exact reviewed, unapplied migration; SHA-256
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`.
- `docs/PACKET_A_PRODUCTION_READINESS.md` — controlling preflight/apply/verify
  gates; source documentation only.

## Remaining Production gates

1. Merge this documentation only after its source PR is verified and approved.
2. Create and restore-test a fresh recoverable Supabase backup.
3. Re-run the read-only catalog/source preflight.
4. Record a targeted pre-Production 6D decision.
5. Obtain separate Owner approval for the exact targeted `apply_migration`
   operation.
6. Apply only Packet A and complete aggregate catalog/RLS/data-invariance plus
   bounded functional verification.

OWNER ACTION: none during source-documentation preparation. Migration and
Production approval will be requested separately, one decision at a time.
