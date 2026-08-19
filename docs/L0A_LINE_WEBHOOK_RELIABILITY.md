# L0a — LINE Webhook Reliability Hardening

Status: **PRODUCTION VERIFIED / FORMAL CLOSURE RECORDED**

- Initial Owner approval: `2026-08-17`
- Production verification: `2026-08-19` (`Asia/Bangkok`)
- Repository: `champban/dashboard`
- Implementation base: `576513707f4567e6707e956e3e3b5ada75d42897`
- Final independently reviewed head: `73ad8b6a9815411364afeae34d9ce52418bd6967`
- Source merge: `3cafa19aa56f89c8d640acc717726d0043b3bd2c` (PR #70)
- Runbook baseline on `main`: `27634ef9d971dfc204607b2ff8a0500e8bd4c4f0` (PR #73)
- Applied Production migration: `20260818154406_line_webhook_event_reliability`
- Active Edge Function: `line-todo-webhook` v22
- Function bundle SHA-256: `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`
- Function setting: `verify_jwt=false` by design; LINE HMAC is verified on the
  untouched raw body at both Netlify and Supabase.
- Runtime rollback: captured v21 bundle
  `a32064244b6faf3d419f9cc5c6b9d9fea981159b3cecd8f5d838aaef53629bc7`.

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
The 30-second setting was verified with the Netlify 8-second timeout in an
isolated replay test, and LINE webhook redelivery was Owner-confirmed enabled
before Production activation.

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

**This strategy requires webhook redelivery to remain enabled in the LINE
Developers Console.** The Owner verified both `Use webhook = Enabled` and
`Webhook redelivery = Enabled` before migration and v22 deployment. If that
setting is later disabled, failed or busy events can again be lost because no
internal retry worker owns them.

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
- Encrypted logical backup `20260818T145008Z` passed export, decryption and
  SHA-256 integrity verification before the Production migration. Owner accepted
  the Personal-PC-only copy as a documented conditional risk.

## Verification evidence

### Independent review and exact-head CI

- Claude final read-only review verdict: `PASS` at `73ad8b6a9815411364afeae34d9ce52418bd6967`.
- GitHub Actions run #104 passed both `verify` and real PostgreSQL
  SQL/RLS/concurrency jobs at that exact head.
- PR #70 merged the reviewed source into `3cafa19aa56f89c8d640acc717726d0043b3bd2c` without changing the
  reviewed implementation tree.

### Isolated release gates

- Evidence PR #71: signed duplicate replay, partial failure/retry behavior,
  Netlify 8-second timeout versus 30-second lease, mutation idempotency, and
  genuine concurrent claim testing passed against synthetic data only.
- Evidence PR #72: logical `roles.sql`, `schema.sql`, and `data.sql` exports were
  non-empty, hashed, encrypted with GPG AES256, decrypted, and re-verified.
- Public endpoint evidence PR #74 and CI run #116 passed: direct Supabase GET
  `405`, direct invalid signature `401`, Netlify configured GET `200`, and
  Netlify invalid signature `401`.

### Production migration and RLS — PASS

- Provider migration version: `20260818154406_line_webhook_event_reliability`.
- `mtp_line_events` exists with RLS enabled and zero client policies.
- `anon` and `authenticated` have no ledger table/RPC access.
- `service_role` has the required ledger table/RPC access.
- Authenticated mutation updates are limited to `status`, `error_code`,
  `applied_at`, and `updated_at`; protected identity/operation fields are denied.
- Pre-existing mutation row count remained 17 and every existing
  `source_event_id` remained null.

### Production v22 and live LINE smoke — PASS

- `line-todo-webhook` v22 became ACTIVE with bundle `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`.
- Owner acceptance: `menu`, Edit -> Cancel, and `search week 49 2026` all passed.
- Five resulting ledger events were `processed`; zero were `failed` or
  `processing`; no row exceeded the 30-second lease; maximum attempt count was 1.
- Mutation rows remained 17, with zero non-null `source_event_id` values.
- Valid live POSTs returned HTTP 200; invalid signatures remained HTTP 401.

## Production verification

Completed gates:

- [x] Final independent review and exact-head CI.
- [x] PR #69 closed unmerged as superseded; PR #70 merged.
- [x] Recoverable encrypted backup created and integrity-verified.
- [x] LINE `Use webhook` and `Webhook redelivery` verified enabled.
- [x] Signed duplicate replay and gateway-timeout/lease behavior tested in isolation.
- [x] v21 source/version/bundle captured as rollback evidence.
- [x] Exact additive migration applied and Production schema/RLS verified.
- [x] Exact five-file package deployed as v22 with `verify_jwt=false`.
- [x] Invalid-signature checks, menu, Cancel, and ISO-week search smoke passed.
- [x] Ledger and mutation-state post-smoke verification passed.

Intentionally deferred and not authorized by L0a:

- retention scheduling or ledger cleanup;
- normalized Todo tables or source-of-truth cutover (L0b);
- direct Supabase Todo mutation or removal of Open Planner/Save to Cloud (L1);
- Netlify, Rich Menu, LINE provider, or secret changes.

## Rollback

Runtime rollback remains redeploying the captured `line-todo-webhook` v21 source
and confirming invalid-signature rejection plus one controlled `menu` reply.
The additive migration is compatible with v21 and should remain in place unless a
separate destructive cleanup is reviewed and explicitly approved.

A database restore is reserved for verified data damage. L0a did not rewrite
Todo/planner content, and Production verification found the pre-existing mutation
row count unchanged.

## Formal closure state

- L0a runtime is Production verified on v22; rollback was not required.
- This documentation-only closure updates the durable release, audit, KPI and
  recurrence records.
- Evidence-only PRs #71, #72 and #74 may be closed unmerged after this closure
  evidence is committed; their branches and backup are not deleted.
- Retention cleanup, provider/secrets changes, temporary-branch deletion, L0b and
  L1 remain outside scope and require separate Owner approval.
- Next product phase after formal closure: review and approve L0b normalized
  Supabase data foundation; do not start it from this closure task.
