# L0a — LINE Webhook Reliability Hardening

Status: **IMPLEMENTED AND VERIFIED IN DRAFT PR / NOT DEPLOYED**

- Owner approval: `2026-08-17`
- Repository: `champban/dashboard`
- Base: `576513707f4567e6707e956e3e3b5ada75d42897`
- Branch: `fix/l0a-line-webhook-reliability`
- Verified remediation code head: `154c944eab5e28de0e46c8aed268fd024122f510`
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

L0a does not implement that cutover. It closes the webhook reliability
precondition before future writes become authoritative.

## Change scope

### Persistent processing ledger

The additive migration introduces `mtp_line_events`. The schema permits these
states:

- `received` — reserved/default state for future intake tooling; the current
  atomic claim RPC does **not** persist a row in this state;
- `processing` — inserted directly by `mtp_claim_line_event` for a new claim;
- `processed` — terminal successful or safely ignored event;
- `failed` — retryable failure recorded with a bounded error code.

The ledger records only a stable event identity, resolved owner UUID when known,
processing state, attempt count, bounded error code and timestamps. It does not
store raw webhook bodies, reply tokens, raw LINE user IDs, planner content or
secrets.

### Atomic ownership, lease and retries

`mtp_claim_line_event` atomically:

- claims a new event;
- rejects simultaneous processing with `busy`;
- skips a terminal `processed` duplicate;
- reclaims a `failed` event;
- reclaims a stale processing lease after 30 seconds.

`mtp_finish_line_event` finalizes only the same attempt that owns the lease. An
older invocation cannot overwrite a newer retry.

The Netlify forwarder times out after 8 seconds. A timeout can therefore leave a
ledger row in `processing` for up to roughly another 22 seconds. Redeliveries in
that interval receive `busy` and remain retryable. The original 120-second lease
was reduced because it could consume too much of LINE's finite retry window.
The 30-second setting still requires provider-level redelivery verification
before Production.

### Mutation draft idempotency and client privilege correction

`mtp_line_mutations.source_event_id` plus a unique partial index prevents one
LINE event from creating two mutation drafts if execution stops after the draft
INSERT but before event finalization.

The previous table-level `UPDATE` grant allowed authenticated browser clients to
write every column, including the new idempotency key. L0a revokes that grant and
allows authenticated updates only to the fields already used by `line-sync.js`:

- `status`
- `error_code`
- `applied_at`
- `updated_at`

RLS owner policies remain unchanged. Real PostgreSQL tests prove an authenticated
owner can update those four fields but cannot update `source_event_id`,
`operation`, `owner_id` or `expires_at`.

### Link-code ordering

`mtp_claim_line_link` remains hashed, one-time and ten-minute limited. The claim
is irreversible because it writes `used_at`. The runtime now follows this order:

```text
claim link code
  -> send the linked user-facing reply
  -> attach owner UUID to the event ledger
```

A ledger-owner update can no longer prevent the already-linked user from seeing
the correct `linked` response. A behavioral test proves the reply is delivered
before a synthetic `setOwner` failure.

### Per-event failure isolation

A successful event in a multi-event webhook batch remains `processed` even if a
later event fails. On redelivery, terminal events are skipped and only unresolved
events are retried.

Because no durable internal retry worker exists:

- all processed/safely ignored/processed-duplicate events -> HTTP 200;
- any failed or currently busy event -> HTTP 503 from Supabase;
- Netlify may translate a non-success upstream result to its gateway error;
- the ledger prevents completed work and mutation-draft creation from being
  repeated.

**This strategy requires webhook redelivery to be enabled in the LINE Developers
Console.** If redelivery is disabled, a failed or busy event that receives a
non-2xx response is permanently lost because no internal worker owns it. The
setting has not yet been verified and is a Production stop gate.

### Missing `webhookEventId`

The processor does not silently disable deduplication. It derives a deterministic
SHA-256 fallback identity from a canonical event representation while excluding
volatile `replyToken`, `deliveryContext` and `webhookEventId` fields.

Only the digest is stored. It is pseudonymous metadata rather than raw content,
but a low-entropy event could theoretically be guessed offline if the
service-role-only ledger were exposed. The ledger therefore remains inaccessible
to `anon` and `authenticated`, and the digest must not be treated as anonymous
public data.

### Mutation decision repository

Mutation repository wiring and `resolveMutationDecision` now live in the
dependency-free `event-processing.js`, leaving `index.ts` as runtime wiring.
Behavioral tests cover:

- retried confirm -> matched;
- cancel after confirm -> unmatched;
- expired draft -> unmatched;
- missing draft -> unmatched.

### Retention

`mtp_cleanup_line_events` is a service-role-only maintenance RPC for terminal
rows older than the selected cutoff, defaulting to 30 days. It is intentionally
not invoked in the webhook critical path. Scheduling it requires a separate
operations approval. Real SQL tests prove it removes only old `processed` and
`failed` rows, not active or recent rows.

### User-visible correctness

- ISO week search covers Monday through Sunday (`start + 6 days`).
- Tests assert exact boundaries for ISO weeks 1 and 53 of 2026 and weekday
  boundaries for weeks 1, 36, 49 and 53.
- Mutation confirmation postbacks carry `lang=en|th`; legacy postbacks without a
  language remain compatible and default to English.
- Confirmed, cancelled and expired/already-used results support English and Thai.
- The legacy `Open Planner / Save to Cloud` application flow remains unchanged
  until L1.
- The existing Thai help wording `เลือกสถานะใหม่` remains unchanged; no unrelated
  copy decision was taken in this remediation.

## Delivery guarantee and residual reply windows

This design provides persistent event state and idempotent mutation-draft
creation. It does **not** provide mathematically exact-once LINE Reply API
delivery.

### Reply accepted, final ledger write fails

```text
LINE Reply API accepts the reply
  -> process stops or event finalization fails
  -> LINE redelivers
  -> database/ledger work can be repaired or recognized
  -> the original replyToken is already consumed
```

The redelivered event's `replyToken` must not be relied upon for user-visible
recovery. This is why `replyToken` and `deliveryContext` are excluded from the
fallback event identity. A retry can restore ledger/database state but generally
cannot guarantee delivery of the original user-facing reply.

### Mark processed before reply

Marking the ledger `processed` before calling LINE would create the opposite and
more harmful window:

```text
ledger marked processed
  -> LINE Reply API fails
  -> redelivery is skipped
  -> user never receives the reply
```

The runtime therefore sends the reply before terminal event finalization and
accepts the residual described above. Exact external delivery would require a
durable outbound reply outbox plus a worker/provider contract, outside L0a.

The truthful guarantee is:

> Persistent deduplication of completed database work with retryable event
> processing; no exact-once guarantee for external LINE replies.

## Security and data review

- Migration is additive; no existing row, table or RLS policy is removed.
- `CREATE TABLE`, `ADD COLUMN` and indexes use repair-friendly `IF NOT EXISTS`.
- `mtp_line_events` has RLS enabled.
- `anon` and `authenticated` have no ledger table access or RPC execute access.
- `service_role` receives only required table/RPC privileges.
- Authenticated mutation updates are column-limited as described above.
- SECURITY DEFINER RPCs use empty `search_path` and qualified objects.
- No secret, raw webhook payload, raw LINE user ID, reply token or planner
  content is written to the ledger, logs, status or source.
- A recoverable Supabase backup/export remains mandatory before any future
  Production migration application.

## Verification evidence

GitHub Actions workflow run `32043846970` / run #102 completed successfully at
verified remediation code head `154c944eab5e28de0e46c8aed268fd024122f510`.

### Main verification job — PASS

- locked `npm ci`;
- secret scanner self-test and repository scan — no credentials found;
- Vite Production build;
- browser harness `LEN 25129 / NODES 141`;
- static audit `blockers=0`, pre-existing warnings `3`;
- package/CSP verification `6/6`;
- full regression suite;
- `LINE bot logic: PASS`;
- Cancel flow `6/6`;
- `LINE event processing reliability: PASS`;
- browser snapshot, auth-storage, LINE contract and health-check tests;
- generated artifact byte parity;
- ES2019 guard.

### Real PostgreSQL 16 job — PASS

- repeatable baseline and L0a migrations executed;
- lifecycle `claimed -> busy -> claimed_stale -> claimed_retry ->
  duplicate_processed` verified against the real SQL;
- stale attempt finalization rejected;
- anon/authenticated table and RPC denial verified;
- authenticated column-level mutation updates verified;
- cleanup removes only old terminal rows;
- two genuine concurrent sessions produced exactly
  `claimed=1, busy=1`.

The first SQL run correctly exposed that a plain PostgreSQL test role did not
match Supabase `service_role`'s `BYPASSRLS` property. The throwaway harness was
corrected to mirror Supabase semantics and the full gate then passed. No
Production database was contacted.

### Supply-chain note

`npm ci` reports three pre-existing development dependency advisories:
`1 moderate`, `2 high`. This remediation changes neither `package.json`
dependencies nor `package-lock.json`. The targeted 6D audit records the bounded
acceptance and expiry; the advisories are not represented as zero.

## Not yet verified / Production stop gates

- LINE Developers Console: webhook redelivery is enabled;
- signed event replay through the actual Netlify -> isolated Supabase path;
- exact Netlify 8-second timeout / 30-second lease behavior under provider
  retries;
- Supabase-specific migration execution in a development branch (none exists);
  PostgreSQL 16 execution passed as the available isolated gate;
- Production backup/export;
- Production migration application;
- Production Edge Function deployment;
- live LINE smoke;
- scheduled retention cleanup.

## Rollback

Before any future deployment:

1. verify and record active Production Edge Function version v21;
2. take a recoverable Supabase backup/export;
3. apply the additive migration before deploying code that requires it;
4. retain v21 as the runtime rollback point.

If runtime verification fails, redeploy v21. The additive ledger and nullable
`source_event_id` can remain unused without changing planner behavior. L0a does
not modify task/planner data.

## Current stop gate

- PR #70 remains Draft and unmerged.
- Migration remains unapplied.
- Edge Function remains undeployed.
- Netlify, LINE Console, Rich Menu, secrets and environment remain unchanged.
- PR #69 must be closed as superseded before PR #70 can be considered for merge.
- Next owner after final exact-head verification: Owner for gate decision, then
  Claude for any requested independent re-review.
- Merge, migration and Production deployment each require separate approval.
