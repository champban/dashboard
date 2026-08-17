# CODEX STATUS — L0a LINE Webhook Reliability Remediation

STATUS: READY_FOR_OWNER_GATE / DRAFT / NOT DEPLOYED

PROGRESS: 100% of Owner-approved remediation scope; Production activation 0%

AGENT: Codex / ChatGPT

TASK / LANE: L0a PR #70 remediation after independent Claude review

CLASSIFICATION: SEQUENTIAL_ONLY

BRANCH: `fix/l0a-line-webhook-reliability`

BASE SHA: `576513707f4567e6707e956e3e3b5ada75d42897`

REVIEWED START SHA: `7119be488fc9d054076ede84aa1564051cebec57`

VERIFIED REMEDIATION CODE HEAD: `154c944eab5e28de0e46c8aed268fd024122f510`

VERIFIED DOCUMENTATION HEAD: `a7d3da891c027e7aa5fe3ab99fea5030aa26a7a4`

PULL REQUEST: Draft PR #70 — `L0a: harden LINE webhook redelivery and event idempotency`

SUPERSEDED PR: PR #69 closed unmerged on `2026-08-17`; it must not be used as a deploy source.

PRODUCTION RUNTIME: unchanged — Supabase `line-todo-webhook` v21

## COMPLETED

- Reordered the irreversible link-code path so linked messages are sent before
  event-ledger owner attachment.
- Added a behavioral regression proving a `setOwner` failure cannot prevent the
  correct linked reply from being delivered.
- Restricted authenticated `mtp_line_mutations` updates to `status`,
  `error_code`, `applied_at`, `updated_at`.
- Added real RLS tests proving authenticated owners cannot update
  `source_event_id`, `operation`, `owner_id` or `expires_at`.
- Added repeatable PostgreSQL 16 migration/RLS/lifecycle/cleanup tests.
- Added genuine two-session concurrency verification: exactly one `claimed` and
  one `busy` result for the same event identity.
- Extracted Supabase mutation repository wiring and `resolveMutationDecision`
  from `index.ts` into dependency-free `event-processing.js`.
- Added decision tests for retried confirm, cancel after confirm, expired draft
  and missing draft.
- Reduced processing lease from 120 seconds to 30 seconds and aligned docs with
  Netlify's 8-second upstream timeout.
- Restored sanitized outer exception handling in the Edge Function.
- Made the lease guard NULL-safe.
- Added repair-friendly `IF NOT EXISTS` clauses to additive migration objects.
- Strengthened ISO-week tests with Monday/Sunday assertions and exact week 1 /
  week 53 cross-year boundaries.
- Restored explanatory comments removed from `line-bot.test.mjs`; updated the
  Flex schema incident comment to the current `line_reply_failed -> failed ->
  HTTP 503` behavior.
- Left dependencies, `package-lock.json`, browser source, Netlify forwarder,
  `cancel-flow.js`, provider configuration and Production data unchanged.
- Left the unrelated Thai help wording `เลือกสถานะใหม่` unchanged.
- Updated L0a reliability design and current targeted 6D audit.
- Closed PR #69 as superseded, unmerged, with a warning not to deploy from it.

## CHANGED FILES

- `.github/workflows/verify.yml`
- `build/line-bot.test.mjs`
- `build/line-event-processing.test.mjs`
- `docs/L0A_LINE_WEBHOOK_RELIABILITY.md`
- `docs/SECURITY_6D_AUDIT.md`
- `docs/status/CODEX_STATUS.md`
- `supabase/functions/line-todo-webhook/event-processing.js`
- `supabase/functions/line-todo-webhook/index.ts`
- `supabase/migrations/20260817150000_line_webhook_event_reliability.sql`
- `supabase/tests/line_event_ledger.test.sql`
- `supabase/tests/run_line_event_ledger_tests.sh`

No dependency or lockfile file changed.

## VERIFICATION

### Code + SQL gate

GitHub Actions workflow run: `32043846970` / run #102 at code head
`154c944eab5e28de0e46c8aed268fd024122f510` — PASS.

### Documentation exact-head gate

GitHub Actions workflow run: `32044342990` / run #103 at documentation head
`a7d3da891c027e7aa5fe3ab99fea5030aa26a7a4` — PASS.

### Main `verify` job — PASS

- locked install
- secret scan: no credentials found
- Vite Production build
- harness: `LEN 25129 / NODES 141`
- static audit: `0 blockers`, pre-existing warnings `3`
- package/CSP verification: `6/6`
- full `npm test`
- LINE bot logic: PASS
- Cancel flow: `6/6`
- LINE event processing reliability: PASS
- browser snapshot: PASS
- auth-storage security: PASS
- LINE contract: PASS
- health-check self-test: PASS
- generated-artifact parity: PASS
- ES2019 guard: PASS

### PostgreSQL SQL / RLS / concurrency job — PASS

- PostgreSQL `16.15`
- lifecycle `claimed -> busy -> claimed_stale -> claimed_retry ->
  duplicate_processed`
- stale attempt cannot finalize a newer attempt
- anon/authenticated table and RPC denial
- authenticated allowed-column and denied-column behavior
- terminal-only retention cleanup
- genuine concurrent sessions: `claimed=1, busy=1`

### Supply-chain evidence

`npm ci` still reports pre-existing development advisories:

- 1 moderate
- 2 high

No dependency or lockfile was changed. Targeted 6D audit records temporary
acceptance by `champban` until before Production promotion or `2026-09-17`,
whichever occurs first.

## DATA / SECURITY IMPACT

- Draft migration is additive and unapplied.
- No task/planner row is changed.
- New ledger is designed service-role-only.
- Authenticated mutation updates become narrower, not broader.
- No raw LINE body, reply token, raw LINE user ID, planner content or secret is
  persisted in the ledger or logs.
- A recoverable Supabase backup/export remains mandatory before migration.

## PRODUCTION IMPACT

NONE.

- PR #70 remains Draft.
- No merge.
- No Supabase migration application.
- No Edge Function deployment.
- No Netlify, LINE Console, Rich Menu, secret or environment change.
- Production remains on `line-todo-webhook` v21.

## REMAINING BLOCKERS / RISKS

Before merge or Production approval:

1. Verify LINE Developers Console webhook redelivery is enabled.
2. Replay a signed duplicate event through Netlify -> isolated Supabase.
3. Exercise Netlify 8-second timeout against the 30-second lease.
4. Verify recoverable Supabase backup/export.
5. Record exact v21 rollback source/version.
6. Reconcile any final independent review finding.
7. Obtain separate approvals for merge, migration and deployment.

Residual delivery limitation: the ledger makes database work idempotent but does
not make the external LINE Reply API exact-once. A redelivery cannot rely on the
original consumed reply token.

ACTIVE WRITER: none after this status checkpoint

NEXT OWNER: OWNER

NEXT TASK: Review final Draft PR #70 evidence and decide whether to request an
independent Claude re-review. Production gates remain separate.

HANDOVER:

- Continue only from the remote PR #70 head shown by GitHub.
- Trust Git/CI evidence over local or stale status.
- PR #69 is closed unmerged and superseded.
- Do not apply migration or deploy without a recoverable backup and explicit
  Owner approval.

OWNER ACTION: No technical action required at this stop gate. The next decision
is review/re-review only; merge, migration and deploy are not approved.
