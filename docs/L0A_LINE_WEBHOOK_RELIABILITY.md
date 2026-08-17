# L0a — LINE Webhook Reliability Hardening

Status: **IMPLEMENTED IN DRAFT PR / NOT DEPLOYED**

- Owner approval: `2026-08-17`
- Repository: `champban/dashboard`
- Base: `576513707f4567e6707e956e3e3b5ada75d42897`
- Branch: `fix/l0a-line-webhook-reliability`
- Implementation head: `a410120510d5dad94c9f50b5a789ccabe5db954f`
- Draft PR: `#70`
- Production Edge Function remains: `line-todo-webhook` v21
- Production migration/deployment impact: **NONE**

## Owner architecture decision

The approved sequence is:

```text
L0a webhook reliability
  -> L0b normalized Supabase data foundation
  -> L1 direct Supabase Todo
```

After L1 is Production-verified:

- Supabase becomes the operational/live source of truth;
- browser web and LINE read/write the same normalized Supabase data;
- Google Drive becomes backup/export/archive only;
- Google Drive is removed from the normal LINE mutation application path.

L0a does not implement that cutover. It only closes the webhook reliability
precondition before future writes become authoritative.

## Change scope

### Persistent processing ledger

The additive migration introduces `mtp_line_events` with explicit lifecycle
states:

- `received`
- `processing`
- `processed`
- `failed`

The ledger records only a stable event identity, resolved owner UUID when known,
processing state, attempt count, bounded error code and timestamps. It does not
store raw webhook bodies, reply tokens, raw LINE user IDs, planner content or
secrets.

### Atomic ownership and retries

`mtp_claim_line_event` atomically:

- claims a new event;
- rejects simultaneous processing with `busy`;
- skips a terminal `processed` duplicate;
- reclaims a `failed` event;
- reclaims a stale processing lease after the configured interval.

`mtp_finish_line_event` finalizes only the same attempt that owns the lease. An
older invocation cannot overwrite a newer retry.

### Mutation draft idempotency

`mtp_line_mutations.source_event_id` plus a unique partial index prevents one
LINE event from creating two mutation drafts if execution stops after the draft
INSERT but before event finalization.

### Per-event failure isolation

A successful event in a multi-event webhook batch remains `processed` even if a
later event fails. On LINE redelivery, terminal events are skipped and only
failed events are retried.

Because no durable internal retry worker exists yet:

- all processed/safely ignored/processed-duplicate events -> HTTP 200;
- any failed or currently busy event -> retryable HTTP 503 from Supabase;
- the Netlify proxy may translate a non-success upstream result to its existing
  gateway error response, causing LINE redelivery;
- the persistent ledger makes that redelivery safe for completed events and
  idempotent for mutation-draft creation.

### Missing `webhookEventId`

The processor does not silently disable deduplication. It derives a deterministic
SHA-256 fallback identity from a canonical event representation while excluding
volatile `replyToken`, `deliveryContext` and `webhookEventId` fields.

### Retention

`mtp_cleanup_line_events` is a service-role-only maintenance RPC for terminal
rows older than the selected cutoff, defaulting to 30 days. It is intentionally
not invoked in the webhook critical path. Scheduling it requires a separate
operations approval.

### User-visible correctness

- ISO week search now covers Monday through Sunday (`start + 6 days`), not 69
  days.
- Mutation confirmation postbacks carry `lang=en|th` while old postbacks without
  a language remain compatible and default to English.
- Confirmed, cancelled and expired/already-used result messages now support
  English and Thai.
- The legacy `Open Planner / Save to Cloud` application flow remains unchanged
  until L1.

## Delivery guarantee and residual crash window

This design provides persistent deduplication and idempotent database mutation
creation. It does **not** claim mathematically exact-once LINE Reply API delivery.

An unavoidable external-side-effect window remains:

```text
LINE Reply API accepts the reply
  -> process stops before mtp_line_events becomes processed
  -> LINE redelivers
  -> the event is retried and may attempt the reply again
```

Marking the ledger `processed` before sending the reply would create the opposite
and more harmful window: a failed reply could be permanently suppressed. Exact
external delivery would require a durable outbound reply outbox plus a delivery
worker/provider contract, which is outside L0a. Future releases must describe the
guarantee as **at-least-once processing with persistent deduplication of completed
work**, not exact-once external messaging.

The link-code claim and mutation decision operations remain transactional or
idempotent at their database boundary. Independent review must specifically
inspect their behavior when the reply succeeds/fails around event finalization.

## Security and data review

- Migration is additive; no existing table, policy or data is removed.
- `mtp_line_events` has RLS enabled.
- `anon` and `authenticated` have no table access or RPC execute access.
- `service_role` receives only the table/RPC privileges needed by the webhook.
- SECURITY DEFINER RPCs use an empty `search_path` and fully qualified objects.
- No secret, raw webhook payload, raw LINE user ID or private planner content is
  written to source, status output or the event ledger.
- A recoverable Supabase backup/export is mandatory before any future Production
  migration application.

## Verification evidence

GitHub Actions run `32038462723` against PR merge ref for head
`a410120510d5dad94c9f50b5a789ccabe5db954f` completed successfully.

Passed:

- locked `npm ci`;
- secret scanner self-test and repository scan — no credentials found;
- Vite production build;
- browser harness `LEN 25129 / NODES 141`;
- static audit `blockers=0`, pre-existing warnings `3`;
- package/CSP verification `6/6`;
- full regression suite;
- `LINE bot logic: PASS`;
- Cancel flow `6/6`;
- `LINE event processing reliability: PASS`;
- LINE browser snapshot tests;
- Supabase auth-storage security tests;
- LINE integration contract tests;
- health-check self-test;
- generated `index.html` / `BUILD-MANIFEST.json` byte parity;
- ES2019 guard.

The install log reports three pre-existing dependency advisories (`1 moderate`,
`2 high`). This PR changes no dependency or lockfile. They remain a separate
supply-chain review item and must not be represented as zero vulnerabilities.

## Not yet verified

The following are intentionally outstanding at this stop gate:

- PostgreSQL/Supabase execution of the new migration/RPCs in an isolated branch
  or non-Production project;
- real concurrent RPC claims against PostgreSQL;
- signed LINE redelivery replay through Netlify -> isolated Supabase;
- Production migration application;
- Production Edge Function deployment;
- live LINE smoke;
- scheduled retention cleanup.

Static/behavioral tests cannot substitute for the isolated Supabase migration
and concurrency gate.

## Rollback

Before any future deployment:

1. verify and record the active Production Edge Function version (currently v21);
2. take a recoverable Supabase backup/export;
3. apply the additive migration before deploying code that requires it;
4. retain v21 as the runtime rollback point.

If runtime verification fails, redeploy v21. The additive ledger and nullable
`source_event_id` column can remain unused without changing planner behavior.
No task/planner data is modified by L0a itself.

## Current stop gate

- Draft PR remains unmerged.
- Migration remains unapplied.
- Edge Function remains undeployed.
- Netlify/LINE Console/Rich Menu/secrets/environment remain unchanged.
- Next owner: Claude Code for independent read-only architecture/security/code
  review.
- Any migration, merge or Production deploy requires a separate Owner approval.
