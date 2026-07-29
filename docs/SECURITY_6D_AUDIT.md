# Security 6D Audit — LINE Official Read-only Bot

Audit date: 2026-07-29

Scope: LINE production activation and `hotfix/supabase-auth-storage`

Decision: **CONDITIONAL / backend active; client hotfix not production-ready
until the remaining gates below pass**

## 1. Functional correctness and data integrity — PASS for release candidate

- Full and Mobile publish only after a successful Drive upload, download, or
  content-confirmed reconciliation.
- LINE publication errors are contained and cannot reverse a successful Drive
  operation.
- Date commands use `Asia/Bangkok`; week boundaries are Monday–Sunday.
- Deterministic command, filtering, sort, cap, HMAC, and privacy tests pass.
- Google Drive remains independent of the webhook; the function cannot mutate
  planner tasks.
- Activation diagnostics prove the failed link attempt stopped in the browser:
  OAuth user lookup returned 200, no LINE PostgREST request was emitted, and all
  three LINE tables remained empty.
- The 3.77.1 regression test proves existing and refreshed Supabase sessions
  retain both required tokens in Full and Mobile.

Production gate: complete Full/Mobile Drive → Supabase → LINE round trips with
owner data.

## 2. UI, usability, and accessibility — PASS with live-device gate

- Full Sync Manager and Mobile Sync show link state, snapshot time, one-time
  code, copy action, refresh, busy state, and errors.
- The UI states that LINE is read-only and names fields excluded from the
  snapshot.
- Existing touch/button styling and focus behavior are reused.
- A visible signed-in profile is no longer accepted as sufficient auth evidence
  in testing; link-code acceptance must also produce a database row.

Production gate: verify code copy, expiry text, and error layout on the owner’s
iPhone and desktop browser.

## 3. Lean architecture and performance — PASS

- No AI, MCP server, vector database, cron, or new browser polling loop.
- A LINE query is one account lookup, one snapshot lookup, and one reply call.
- Snapshot is capped at 500 tasks / 240 KiB browser-side and 256 KiB in
  PostgreSQL; replies are capped at 12 tasks / 4,800 characters.
- Supabase JS is version-pinned for the Edge Function.

Production gate: measure webhook p95 and reply success after activation.

## 4. Security and privacy — PASS with disclosed residuals

Controls:

- `x-line-signature` is verified with HMAC-SHA256 against the untouched raw body
  before JSON parsing.
- The public webhook has Supabase JWT verification disabled by design; invalid
  LINE signatures receive HTTP 401.
- Browser writes use the signed-in publishable client plus RLS
  (`auth.uid() = owner_id`).
- Storage redaction exempts only the exact Supabase Auth session key required by
  the SDK. Lookalike and ordinary keys still redact token/secret fields.
- One-time link codes use CSPRNG, store SHA-256 only, expire in 10 minutes, and
  are claimed atomically in a locked transaction.
- The claim function is `SECURITY DEFINER` with an empty `search_path`; execution
  is revoked from public/anon/authenticated and granted only to `service_role`.
- LINE and Supabase backend keys exist only in Function Secrets.
- Snapshot regression tests prove that profile IDs, notes, descriptions,
  attachments, config, and API-key fields are excluded.
- Function errors do not log request bodies, LINE user IDs, task data, or
  secrets.

Residuals:

- Task title, status, due date, category, and priority are copied to Supabase and
  may be delivered into LINE chat history. Users must not treat either location
  as suitable for highly sensitive information.
- The MVP does not persist LINE `webhookEventId`; a provider retry can attempt
  the same one-time reply twice. LINE reply tokens are single-use, so the second
  attempt should fail rather than duplicate a state change, but operational
  metrics should watch this.
- Account unlink is performed by re-linking to another LINE user or operational
  support; a self-service unlink control is not in this release candidate.

## 5. Reliability and recovery — PASS with provider gate

- Google Drive is not read from the webhook and stays available when LINE is
  down.
- Supabase snapshot publishing is secondary and fails visibly without failing
  Drive.
- Linking can recover from a stolen/incorrect code by creating a new code and
  re-linking the owner; the mapping remains one owner ↔ one LINE user.
- Database migration, function source, tests, and runbook are versioned in
  GitHub.
- The failed activation wrote no LINE rows and changed no task/Drive data, so
  recovery needs a client redeploy and fresh login rather than a database
  restore.

Production gate: induce a Supabase snapshot error and a LINE reply error, then
confirm recovery and retry behavior.

## 6. Connectivity and operations — CONDITIONAL / partially activated

- Local build/package CSP passes, static audit reports 0 blockers, and all
  existing plus LINE regression tests pass.
- `supabase/config.toml` pins the project and declares the public webhook
  verification mode.
- Deployment order and rollback are documented in
  `docs/LINE_OFFICIAL_SETUP.md`.
- Completed in production: logical backup acceptance, migration, Function
  Secrets, Edge Function deployment, and successful LINE webhook verification.
- The activation stop was detected during owner acceptance before a link code
  or snapshot entered Supabase.

Remaining production items:

1. Merge/deploy hotfix 3.77.1 only after explicit owner approval.
2. Sign in once to replace the already-redacted browser session.
3. Create and claim a new one-time link code; verify a row is created without
   exposing its value in logs or documentation.
4. Complete Full/Mobile owner acceptance and the seven LINE commands.
5. Exercise an invalid-signature request and induced provider failures.
6. Re-run this audit with live evidence and change the decision explicitly.

## Verification evidence

- `npm test` — existing Drive/UI regressions plus:
  - `build/line-bot.test.mjs`
  - `build/line-sync-browser.test.mjs`
  - `build/auth-storage-security.test.mjs`
  - `build/line-contract.test.mjs`
- `npm run verify` — Vite build, jsdom harness, six-dimension static audit,
  generated package, and 6/6 CSP hash verification.
- `npm run scan-secrets` — required again immediately before commit/push.
