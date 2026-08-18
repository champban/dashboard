# L0a — Production Activation Gate

Status: **PRE-MIGRATION GATE / WAITING FOR OWNER-CONTROLLED EVIDENCE**

Recorded: `2026-08-18T15:03:00+07:00` (`Asia/Bangkok`)

This document records the gate between merged source and any Supabase Production
migration or Edge Function deployment. It does not authorize or perform a
Production change.

## 1. Exact source and environment

| Item | Verified value |
|---|---|
| Repository | `champban/dashboard` |
| Production branch | `main` |
| Merged L0a source | `3cafa19aa56f89c8d640acc717726d0043b3bd2c` |
| Reviewed PR head included by the merge | `73ad8b6a9815411364afeae34d9ce52418bd6967` |
| Supabase project | `Dashboard` — `qjaywadzvwvcspdsjxth` |
| Supabase region / database | `ap-northeast-1` / PostgreSQL `17.6.1.063` |
| Netlify gateway repository source | `champban/Line-app@86522956f9b05d18e716e81ed90549d3d9556a3b` |
| Netlify forward timeout | `8000 ms` |
| L0a processing lease | `30 seconds` |

## 2. Production v21 rollback evidence

Production remains unchanged and currently runs:

| Field | Value |
|---|---|
| Function | `line-todo-webhook` |
| Function id | `4873efa5-b0fb-4869-84e4-c2a77d210ba5` |
| Active version | `21` |
| State | `ACTIVE` |
| JWT verification | `false` by design; LINE raw-body HMAC is the public gate |
| Provider updated time | `2026-08-17T06:32:16Z` |
| Bundle SHA-256 | `a32064244b6faf3d419f9cc5c6b9d9fea981159b3cecd8f5d838aaef53629bc7` |
| Exact source files retrieved from provider | `index.ts`, `logic.js`, `cancel-flow.js`, `deno.json` |

The provider source was captured before L0a activation. Closed, unmerged PR #69
also preserves the v21 source-capture evidence at commit
`b9440925e39b3962bfb53ef86ffa4d28bdd5ca61`; it must not be merged into `main`.

Runtime rollback procedure after a future L0a deploy:

1. Stop further smoke traffic.
2. Redeploy the captured v21 source as `line-todo-webhook`.
3. Confirm the provider reports an ACTIVE version built from the captured v21
   bundle/source.
4. Run unsigned-request rejection and one controlled `menu` smoke.
5. Leave the additive `mtp_line_events` table and nullable
   `mtp_line_mutations.source_event_id` column in place unless a separate,
   reviewed cleanup is approved. Old v21 ignores them.

No rollback action is currently required because Production is still v21.

## 3. Production database baseline before migration

Applied migrations:

1. `20260728155436_line_official_readonly_bot`
2. `20260730031026_line_task_details_snapshot_v2`
3. `20260801090000_line_snapshot_v3_events`
4. `20260802090000_line_confirmed_mutations`

The L0a migration `20260817150000_line_webhook_event_reliability.sql` is **not
applied**.

Relevant current tables:

| Table | Current rows | L0a baseline |
|---|---:|---|
| `mtp_line_snapshots` | 1 | Existing, RLS enabled |
| `mtp_line_link_codes` | 1 | Existing, RLS enabled |
| `mtp_line_accounts` | 1 | Existing, RLS enabled |
| `mtp_line_mutations` | 17 | Existing, RLS enabled; no `source_event_id` yet |
| `mtp_line_events` | absent | Must be created only after migration approval |

Current security advisor still reports one separate warning:
`auth_leaked_password_protection` is disabled. It is not introduced by L0a and
is not a reason to bypass the L0a backup/migration/deploy gates.

## 4. Isolated replay and timeout verification

Draft evidence PR: `#71`

- base: `main@3cafa19aa56f89c8d640acc717726d0043b3bd2c`
- test branch: `test/l0a-production-activation-gates`
- exact passing test head: `06c86eb7a7af54fb30310f0c9b21afeabc43d9dd`
- standard repository verification: workflow run `#111` / `32114273551` — PASS
- isolated Netlify-to-Supabase gate: workflow run `#6` / `32114273544` — PASS

The isolated gate used:

- PostgreSQL 16 throwaway service;
- the merged L0a migration and real SQL RPCs;
- exact byte-for-byte Production gateway fixtures from
  `Line-app@86522956f9b05d18e716e81ed90549d3d9556a3b`;
- synthetic LINE events and a synthetic HMAC secret only;
- no Production project, provider secret, LINE user id, or planner content.

Passed cases:

1. **Signed duplicate replay** — the same signed event traversed the real
   Netlify forwarder twice; result was one durable effect and one processed
   ledger row.
2. **Netlify timeout after upstream completion** — Netlify timed out at eight
   seconds while the isolated upstream completed at nine seconds; the first
   result was `504`, redelivery became a safe processed duplicate, and the
   effect count remained one.
3. **Crash after side effect and before finalization** — immediate redelivery
   returned busy/non-success; after the reviewed 30-second lease became stale,
   the event was reclaimed as attempt two with no duplicate effect.
4. Existing SQL/RLS lifecycle, terminal-only cleanup, stale-attempt protection,
   and genuine two-session claim race remained PASS.

The first two CI attempts were test-infrastructure failures only:

- the dashboard-scoped Actions token could not clone the separate private
  `Line-app` repository;
- the exact fixture initially inherited dashboard's ESM mode although the
  upstream gateway is CommonJS.

Both were corrected without changing Production logic: the exact upstream blobs
were vendored into the test-only branch with recorded blob hashes and an
isolated CommonJS package boundary.

## 5. LINE webhook redelivery gate — OWNER EVIDENCE REQUIRED

Required state in LINE Developers Console:

- **Use webhook:** Enabled
- **Webhook redelivery:** Enabled

Why this is blocking: L0a returns retryable non-2xx responses for failed or busy
events because no durable internal retry worker exists. If LINE redelivery is
disabled, an unresolved event can be lost.

Owner evidence required: one screenshot showing both settings for the active
Messaging API channel. Do not include access tokens, secrets, QR login data, or
private user information.

Status: **PENDING OWNER EVIDENCE**

## 6. Recoverable Supabase backup gate — OWNER ACTION REQUIRED

The project is on the Supabase Free plan. A fresh logical export is required
before the Production migration. Do not rely on the older July backup acceptance.

Use the Supabase Dashboard **Connect** panel and select the Session pooler URI.
Run the following in a trusted Codespace or local terminal. Paste the connection
URI only into the hidden terminal prompt; never paste it into chat, GitHub,
logs, or source.

```bash
set -euo pipefail
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$HOME/supabase-backups/dashboard-$STAMP"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

read -rsp "Paste the full Supabase Session-pooler URI: " DB_URL
echo

supabase db dump --db-url "$DB_URL" \
  -f "$BACKUP_DIR/roles.sql" --role-only

supabase db dump --db-url "$DB_URL" \
  -f "$BACKUP_DIR/schema.sql"

supabase db dump --db-url "$DB_URL" \
  -f "$BACKUP_DIR/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

unset DB_URL

test -s "$BACKUP_DIR/roles.sql"
test -s "$BACKUP_DIR/schema.sql"
test -s "$BACKUP_DIR/data.sql"

sha256sum \
  "$BACKUP_DIR/roles.sql" \
  "$BACKUP_DIR/schema.sql" \
  "$BACKUP_DIR/data.sql" \
  | tee "$BACKUP_DIR/SHA256SUMS.txt"

ls -lh "$BACKUP_DIR"
echo "BACKUP_DIR=$BACKUP_DIR"
```

Backup acceptance criteria:

- all three SQL files are created successfully and non-empty;
- SHA-256 values and UTC timestamp are recorded;
- files are stored outside the public repository;
- at least one second private copy exists, such as Google Drive archive or an
  encrypted local drive;
- the official restore procedure is retained: one transaction, `ON_ERROR_STOP`,
  roles → schema → `session_replication_role=replica` → data;
- no connection URI or password appears in the evidence returned to the PM.

Owner should return only:

- backup UTC timestamp;
- file sizes;
- the three SHA-256 hashes;
- the two private storage locations by general label only.

Status: **PENDING OWNER EVIDENCE**

## 7. Gate status and stop point

| Gate | Status |
|---|---|
| Exact merged source identified | PASS |
| Production v21 rollback metadata/source recorded | PASS |
| Current migration/table baseline recorded | PASS |
| Real PostgreSQL SQL/RLS/concurrency verification | PASS |
| Signed duplicate replay through exact gateway logic | PASS |
| Netlify 8-second timeout / 30-second lease cases | PASS |
| LINE webhook redelivery enabled | PENDING OWNER EVIDENCE |
| Fresh recoverable Supabase logical export | PENDING OWNER EVIDENCE |
| Owner approval to apply migration | **NOT GRANTED** |
| Production migration applied | NOT STARTED |
| Production schema/RLS verified | NOT STARTED |
| Owner approval to deploy Edge Function | **NOT GRANTED** |
| Edge Function deployment | NOT STARTED |
| Live LINE smoke | NOT STARTED |

## 8. Explicit stop conditions

Do not apply the migration until both Owner-controlled evidence gates above are
PASS and the Owner explicitly approves the exact migration application.

Do not deploy the Edge Function merely because the migration later passes.
Function deployment requires another explicit Owner approval after Production
schema/RLS verification.

PR #71 is test evidence only and remains Draft. It must not be merged as part of
this gate without a separate Owner decision.
