# L0a — Production Deployment Runbook

Status: **RUNBOOK READY / NO PRODUCTION ACTION AUTHORIZED**

Owner approval for this document: `2026-08-18`

This runbook controls the Production activation of L0a LINE webhook reliability.
It separates migration approval from Edge Function deployment approval. Completing
or checking a section in this document does **not** grant the next approval.

## 1. Fixed scope and exact sources

| Item | Controlling value |
|---|---|
| Repository | `champban/dashboard` |
| Production branch | `main` |
| Merged L0a source commit | `3cafa19aa56f89c8d640acc717726d0043b3bd2c` |
| Reviewed implementation head included in merge | `73ad8b6a9815411364afeae34d9ce52418bd6967` |
| Supabase project | `Dashboard` — `qjaywadzvwvcspdsjxth` |
| Migration file | `supabase/migrations/20260817150000_line_webhook_event_reliability.sql` |
| Migration blob SHA | `fc497ecb14b794bd4abf6ba9312aa745e59fb51e` |
| Edge Function | `line-todo-webhook` |
| Current rollback runtime | version `21`, ACTIVE |
| Current function ID | `4873efa5-b0fb-4869-84e4-c2a77d210ba5` |
| Current v21 bundle SHA-256 | `a32064244b6faf3d419f9cc5c6b9d9fea981159b3cecd8f5d838aaef53629bc7` |
| Function JWT setting | `verify_jwt=false` by design; LINE raw-body HMAC is the public authentication gate |
| Netlify gateway source | `champban/Line-app@86522956f9b05d18e716e81ed90549d3d9556a3b` |
| Netlify forward timeout | `8000 ms` |
| L0a event-processing lease | `30 seconds` |

Do not deploy from a mutable branch name. Migration and function files must be
read from exact commit `3cafa19aa56f89c8d640acc717726d0043b3bd2c`.

Exact function package at that commit:

- `supabase/functions/line-todo-webhook/index.ts`
- `supabase/functions/line-todo-webhook/logic.js`
- `supabase/functions/line-todo-webhook/cancel-flow.js`
- `supabase/functions/line-todo-webhook/event-processing.js`
- `supabase/functions/line-todo-webhook/deno.json`

## 2. Approval boundaries

This release has two independently controlled Production gates.

### Gate A — Migration approval

Permits only:

- apply the exact L0a additive migration;
- inspect resulting schema, RLS, grants, functions and migration history;
- stop after verification.

It does **not** permit deploying the Edge Function.

### Gate B — Edge Function deployment approval

May be granted only after Gate A passes. It permits only:

- deploy the exact five-file function package pinned above;
- retain `verify_jwt=false`;
- perform the controlled live smoke and log inspection;
- rollback to captured v21 if any stop condition occurs.

It does **not** permit Netlify changes, LINE console changes, Rich Menu changes,
secret rotation, cleanup, L0b or L1.

## 3. Pre-migration gates

### 3.1 Source and review evidence

- [x] PR #70 merged exact reviewed source into `main`.
- [x] PR #69 closed unmerged as superseded.
- [x] Final Claude review verdict: PASS.
- [x] Exact-head standard CI passed.
- [x] Real PostgreSQL SQL/RLS/concurrency test passed.
- [x] Isolated signed duplicate replay passed.
- [x] Netlify 8-second timeout / 30-second lease tests passed.
- [x] Current Production runtime v21 source and bundle hash recorded.
- [ ] Re-check that Production still reports `line-todo-webhook` v21 immediately before migration.
- [ ] Re-check that `main` still contains the exact migration and runtime blobs listed above.

Evidence-only PR #71 remains Draft and must not be merged without a separate
Owner decision.

### 3.2 LINE webhook redelivery — blocking

Open: `https://developers.line.biz/console/`

For the active Messaging API channel `My APP (@103rexjo)`, verify:

- [ ] `Use webhook = Enabled`
- [ ] `Webhook redelivery = Enabled`
- [ ] Screenshot retained without Channel secret, access token, QR data or user data.

If redelivery is disabled:

1. Stop.
2. Do not apply the migration.
3. Request separate Owner approval to change the LINE provider setting.

Reason: L0a returns retryable non-2xx for failed or busy events. There is no
durable internal retry worker. Without provider redelivery, unresolved events
can be lost.

### 3.3 Recoverable Supabase backup — conditional pass

Backup evidence:

| Field | Value |
|---|---|
| Backup UTC | `20260818T145008Z` |
| Source commit | `bb11eae5632cc615dff3029b87e6413caad3a279` |
| Supabase CLI | `2.111.0` |
| `roles.sql` | `297` bytes — SHA-256 `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| `schema.sql` | `44253` bytes — SHA-256 `0b66607f23cf603cc5351feeabc1a6e35dd3be9382ee4057ceb198f53baed01a` |
| `data.sql` | `107994` bytes — SHA-256 `64fa0c32c472855c47dbb033c91ae3490e846ef8881c54d178f1a7abdab17c6f` |
| Encrypted archive | `27612` bytes — SHA-256 `d42b6862a98324c53c047dca139190ff2ff3f4abd9ac7befc4e8539d2d677f3b` |
| Encryption | GPG symmetric AES256; passphrase not stored in artifact |
| Restore order | roles → schema → `session_replication_role=replica` → data |

Owner-approved exception:

- [x] Encrypted backup stored on `Personal PC`.
- [x] Owner accepted single-copy risk for this additive L0a migration.
- [ ] Immediately before migration, confirm the `.gpg` archive and manifest are still present and non-zero.
- [ ] Confirm `BACKUP_PASSPHRASE` remains available in the Owner's password manager.

Decision: **CONDITIONAL PASS**.

Accepted residual risk: loss, ransomware or failure of the Personal PC would
remove the only backup copy. Risk owner: `P'Boy`.

Do not upload plaintext SQL to GitHub, chat, issue comments or public storage.

### 3.4 Current Production baseline

Expected before migration:

Applied migration history:

1. `20260728155436_line_official_readonly_bot`
2. `20260730031026_line_task_details_snapshot_v2`
3. `20260801090000_line_snapshot_v3_events`
4. `20260802090000_line_confirmed_mutations`

Expected schema state:

- [ ] `public.mtp_line_events` does not exist.
- [ ] `public.mtp_line_mutations.source_event_id` does not exist.
- [ ] Record current row count of `public.mtp_line_mutations`.
- [ ] Record current function version and bundle hash.
- [ ] No migration or runtime writer is active in another session.

If any baseline differs, stop and reconcile before applying anything.

## 4. Owner approval — migration only

Use an approval equivalent to:

```text
อนุมัติให้ apply migration
20260817150000_line_webhook_event_reliability.sql
จาก exact source commit
3cafa19aa56f89c8d640acc717726d0043b3bd2c
ไป Supabase project qjaywadzvwvcspdsjxth เท่านั้น
และหยุดหลัง schema/RLS verification
ยังไม่อนุมัติ Edge Function deploy, Netlify, LINE Console, Rich Menu,
secrets, cleanup, L0b หรือ L1
```

Approval is invalid if the exact source, migration blob, Production baseline or
redelivery evidence changed after review.

## 5. Apply the migration

Executor: one writer only.

- [ ] Fetch the exact migration from commit `3cafa19aa56f89c8d640acc717726d0043b3bd2c`.
- [ ] Confirm blob SHA `fc497ecb14b794bd4abf6ba9312aa745e59fb51e`.
- [ ] Apply through an approved Supabase migration action, not arbitrary browser/client SQL.
- [ ] Migration name recorded as `line_webhook_event_reliability`.
- [ ] Record provider-returned migration version and map it to repository file `20260817150000_...` if timestamps differ.
- [ ] Do not deploy the function in the same operation.

The migration is additive and creates/adds:

- `public.mtp_line_events`;
- `public.mtp_line_mutations.source_event_id`;
- unique partial index for mutation event idempotency;
- `mtp_claim_line_event`;
- `mtp_finish_line_event`;
- `mtp_cleanup_line_events`;
- authenticated column-level mutation-update restriction.

## 6. Production schema and RLS verification

Run read-only verification immediately after migration.

### 6.1 Migration and structure

- [ ] Applied migration appears once in migration history.
- [ ] `mtp_line_events` exists with RLS enabled.
- [ ] Required columns exist: `event_id`, `owner_id`, `status`, `attempt_count`, `last_error_code`, `received_at`, `processing_started_at`, `processed_at`, `updated_at`.
- [ ] Status constraint permits only `received`, `processing`, `processed`, `failed`.
- [ ] `source_event_id` exists and is nullable.
- [ ] All pre-existing mutation rows have `source_event_id IS NULL`.
- [ ] Mutation row count is unchanged from the preflight count.
- [ ] Both event-ledger indexes and the mutation unique partial index exist.

### 6.2 Permission matrix

- [ ] `anon` has no table access to `mtp_line_events`.
- [ ] `authenticated` has no table access to `mtp_line_events`.
- [ ] `anon` and `authenticated` cannot execute the three ledger RPCs.
- [ ] `service_role` has only the required table and RPC privileges.
- [ ] Authenticated clients can update only `status`, `error_code`, `applied_at`, `updated_at` on `mtp_line_mutations` under existing owner RLS.
- [ ] Authenticated clients cannot update `source_event_id`, `operation`, `owner_id` or `expires_at`.
- [ ] SECURITY DEFINER functions retain empty `search_path` and fully qualified objects.

### 6.3 Runtime isolation

- [ ] Production Edge Function is still v21.
- [ ] No Netlify deploy occurred.
- [ ] No LINE setting or secret changed.
- [ ] No row was inserted into `mtp_line_events` before L0a runtime deployment.

### Gate A decision

- [ ] PASS — proceed to request separate Edge Function deployment approval.
- [ ] BLOCK — stop; leave additive schema in place; investigate without cleanup.

Do not drop the table, column, indexes or functions during incident response.
Current v21 ignores them and can continue running safely.

## 7. Owner approval — Edge Function deployment only

Use an approval equivalent to:

```text
อนุมัติ deploy Supabase Edge Function line-todo-webhook
จาก exact five-file package ที่ commit
3cafa19aa56f89c8d640acc717726d0043b3bd2c
ไป project qjaywadzvwvcspdsjxth โดยคง verify_jwt=false
หลัง migration/RLS gate PASS เท่านั้น
ห้ามเปลี่ยน Netlify, LINE Console, Rich Menu, secrets, cleanup, L0b หรือ L1
หาก source SHA, file blobs, migration state หรือ rollback evidence เปลี่ยน ให้หยุด
```

## 8. Deploy exact reviewed function package

Before deployment:

- [ ] Gate A schema/RLS decision is PASS.
- [ ] LINE webhook redelivery evidence is PASS.
- [ ] Personal-PC backup and passphrase availability reconfirmed.
- [ ] Current v21 function metadata and bundle hash recorded again.
- [ ] Exact five function blobs match commit `3cafa19...`.
- [ ] Secret scan and repository CI remain green for reviewed source.

Deployment:

- [ ] Deploy only `line-todo-webhook`.
- [ ] Entrypoint: `index.ts`.
- [ ] Include `deno.json` and all three relative JavaScript dependencies.
- [ ] Keep `verify_jwt=false`.
- [ ] Record new function version, function ID, update timestamp and bundle hash.
- [ ] Confirm status is ACTIVE.

## 9. Controlled live smoke

Do not use Add/Edit/Delete/Status Confirm during this L0a smoke. The legacy queue
and Drive application path remain active until L1.

### 9.1 Provider and security checks

- [ ] Unsigned or invalid-signature request is rejected with HTTP 401.
- [ ] Valid LINE event reaches `Netlify → Supabase`.
- [ ] Netlify remains proxy-only and does not call LINE Reply API.
- [ ] Logs contain no raw body, LINE user ID, reply token, planner content or secret.

### 9.2 Owner LINE checks

1. Send `menu` once.
   - [ ] Exactly one reply is received.
   - [ ] Reply content is correct.
2. Start an Edit flow, then tap `Cancel`.
   - [ ] Cancel reply is correct.
   - [ ] No Todo data changes.
3. Send a safe read-only ISO-week query such as `search week 49 2026`.
   - [ ] Response succeeds without the former roughly ten-week over-range symptom.
   - [ ] If there is insufficient live data to judge the range visually, rely on the exact-head behavioral tests and record live verification as inconclusive rather than inventing a pass.

### 9.3 Ledger and database evidence

After smoke:

- [ ] New smoke event rows exist in `mtp_line_events`.
- [ ] Successful events are `processed`.
- [ ] Normal event attempts are `attempt_count = 1`.
- [ ] No duplicate business mutation was created.
- [ ] Mutation count changed only if explicitly expected; the recommended smoke expects no confirmed mutation.
- [ ] No event remains `processing` beyond the 30-second lease.
- [ ] No unexpected `failed` events or new Edge Function errors.

Do not run retention cleanup during the release smoke.

## 10. Stop and rollback conditions

Rollback immediately if any of these occur:

- migration/RLS verification differs from the reviewed permission matrix;
- function cannot become ACTIVE;
- valid LINE messages produce no reply or duplicate replies;
- invalid signatures are accepted;
- events remain busy/processing beyond the reviewed lease without explanation;
- mutation drafts or user data duplicate;
- raw payload, LINE user ID, reply token, planner content or secret appears in logs;
- Netlify or LINE provider configuration changes unexpectedly;
- deployed source cannot be matched to the pinned commit/file blobs.

Runtime rollback:

1. Stop further smoke traffic.
2. Redeploy captured `line-todo-webhook` v21 source.
3. Confirm ACTIVE function metadata matches the captured v21 rollback package.
4. Verify invalid signature rejection.
5. Send one controlled `menu` message and confirm one reply.
6. Leave the additive migration in place unless a separate destructive cleanup is reviewed and approved.

The rollback target is runtime v21, not a database restore. A database restore is
reserved for verified data damage; L0a migration itself does not rewrite Todo
content.

## 11. Release closure

Only after all smoke checks pass:

- [ ] Update `PROJECT_CONTEXT.md` with current `main`, applied migration mapping and deployed function version/hash.
- [ ] Update `docs/L0A_LINE_WEBHOOK_RELIABILITY.md` from pre-deploy status to Production verified.
- [ ] Update `docs/SECURITY_6D_AUDIT.md` with the post-deploy targeted decision.
- [ ] Record exact migration version, function version, source SHA and smoke timestamp.
- [ ] Add/update Prevented Recurrence Register for LINE redelivery/deduplication.
- [ ] Update `docs/PROJECT_PERFORMANCE_KPI.md` with CI retry/manual-intervention/rework evidence.
- [ ] Close PR #71 and PR #72 unmerged after their evidence is durably recorded.
- [ ] Delete temporary evidence/backup branches only after closure evidence is retained.
- [ ] Remove or disable the one-time backup Environment secrets/workflow path after backup evidence is no longer needed, under separate explicit authorization.
- [ ] Do not start L0b or L1 until L0a is formally Production verified.

## 12. Final completion record

```text
STATUS:
COMPLETED:
PRODUCTION MIGRATION VERSION:
PRODUCTION FUNCTION VERSION:
SOURCE SHA:
FUNCTION BUNDLE SHA-256:
BACKUP DECISION:
LINE REDELIVERY EVIDENCE:
SCHEMA/RLS VERIFICATION:
LIVE SMOKE:
ROLLBACK STATUS:
BLOCKERS:
NEXT OWNER:
NEXT TASK:
```

## 13. Current stop point

At document creation:

- merged source exists on `main`;
- isolated replay/timeout gates passed;
- v21 rollback evidence exists;
- encrypted backup passed integrity verification;
- Owner accepted Personal-PC-only backup risk;
- LINE redelivery evidence remains pending;
- Production migration is not applied;
- L0a function is not deployed;
- no Production action is authorized by this document.
