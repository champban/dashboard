# L1 Direct Supabase Todo

Status: **L1A source contract in progress; not a migration and not active**

Exact source base: `main@a5a2a31f3c0ffe195ff56108c6cdf1b68f66b307`

## Safety boundary

This document and `supabase/contracts/l1a_direct_todo.sql` are source/test
artifacts only. The SQL contract is deliberately outside
`supabase/migrations/`. Committing or reviewing it does not authorize:

- applying a database migration;
- repeating the L0b import or reading owner planner content;
- enabling a browser write path;
- changing Auth, secrets, providers, LINE, Storage, or Google Drive;
- demoting Drive or cutting over the planner source of truth;
- merging or publishing the source branch.

Browser + Google Drive remain authoritative until a separately approved L1C
cutover is Production-verified. Generic `supabase db push` remains prohibited.

## Staged delivery

1. **L1A contract and Todo thin slice** — complete operational Todo/Event
   schema, stable child identity, dependency and opaque LINE-reference design,
   plus idempotent/versioned task mutation RPCs. No Production apply or client
   activation.
2. **L1B full planner parity** — notes, saved views/non-secret profile settings,
   private attachment/note-image storage, desktop/mobile adapters, offline
   queue, and compatible Drive export.
3. **L1C reconciliation and cutover** — separately approved full-owner
   reconciliation, owner-only observation window, exact cutover gate,
   Production verification, then Drive export/backup/archive.

L1A alone is a Todo write contract. It is not permission to claim Supabase is
the source of truth for the whole planner.

## L1A schema contract

### Existing normalized entities

`mtp_tasks` gains:

- `record_origin` (`import` or `direct`);
- description, start date, assignee, project, progress;
- recurrence rule/flag;
- task location and task notes;
- pin, postponement history, milestone/completion timestamps;
- source-created timestamp and renewed-from task reference.

`mtp_subtasks`, `mtp_events`, `mtp_event_windows`, and
`mtp_task_attachments` gain a direct/import origin contract. Event windows gain
stable UUID identity, description, and structured per-window location.
Attachments gain private-storage metadata placeholders and a content digest;
the L1A source does not create a bucket or upload a binary.

Imported rows keep their L0b batch references. Direct rows use the canonical
entity UUID and no import-batch reference. A check constraint prevents an
ambiguous mixed origin.

### New owner-scoped entities

- `mtp_task_dependencies` stores canonical task-to-task edges, rejects
  self-dependencies, and has a cycle-prevention trigger.
- `mtp_task_external_refs` maps a task to a SHA-256 digest of a random opaque
  provider reference. Raw LINE message text, titles, user IDs, and reference
  tokens are not stored as identifiers.
- `mtp_mutation_receipts` provides durable per-owner idempotency evidence. It is
  not directly readable or writable by browser roles.

Every new public table has RLS enabled. `anon`, `authenticated`, and
`service_role` receive no implicit privileges. Only the minimum owner-scoped
SELECT grants are restored to `authenticated`; writes remain RPC-only.

## Task write contract v1

Public Data API entry points:

```text
mtp_task_create_v1(task_id, task_kind, payload, idempotency_key)
mtp_task_update_v1(task_id, expected_version, patch, idempotency_key)
mtp_task_delete_v1(task_id, expected_version, idempotency_key)
```

Rules:

1. Owner is always derived from `auth.uid()`; no API accepts `owner_id`.
2. Create requires a client-generated canonical task UUID, and every mutation
   requires an owner-scoped UUID idempotency key.
3. Identical retry returns the stored result and performs no second write.
4. Reusing a key for different request bytes fails closed.
5. Update/delete require exact `expected_version`; stale writes fail with an
   explicit conflict and never silently overwrite.
6. Deletes are tombstones. No direct hard delete or automatic cleanup exists.
7. Payload keys and types are allowlisted. Unknown or invalid fields fail
   before entity mutation.
8. Private `SECURITY DEFINER` cores have empty `search_path`, fully-qualified
   objects, explicit `auth.uid()` checks, and no `PUBLIC`/`anon` execute grant.
   Exposed wrappers are `SECURITY INVOKER` and are the only authenticated RPCs.

The first source slice implements task create/update/delete only. Subtask,
event/window, dependency, note, attachment-binary, and settings mutations must
use the same receipt/version contract in later reviewed slices.

## Conflict and client behavior

- A client queues the original `idempotency_key`, entity UUID, and base version.
- Transient retries reuse them exactly.
- Validation, auth, missing-owner-row, and version conflicts are permanent until
  the user changes the request or resolves the conflict.
- A conflict UI must compare local and server values or offer an explicit
  direction. Last-write-wins is prohibited.
- Realtime may later invalidate/read newer state, but cannot replace RLS or the
  expected-version check.

## Verification contract

`supabase/tests/l1a_direct_todo.test.sql` and its runner must prove on throwaway
PostgreSQL 17:

- additive compatibility after the exact L0b migration;
- stable event-window UUIDs and direct/import origin constraints;
- exact public/private function privileges and empty definer `search_path`;
- owner-only reads and zero direct client table writes;
- create, identical retry, conflicting-key rejection, update, stale-version
  rejection, tombstone delete, and retry-after-delete;
- cross-owner denial without existence disclosure;
- unknown field and invalid progress rejection;
- dependency self-edge and cycle rejection;
- no change to existing LINE or unrelated objects in the test fixture.

Full repository gates remain `npm test`, `npm run verify`,
`npm run scan-secrets`, generated-artifact parity, and targeted 6D review.

## Promotion to a migration

The contract may be promoted into `supabase/migrations/` only after:

1. exact source HEAD/base/diff and PostgreSQL 17 CI pass;
2. independent security/schema review closes all findings;
3. field/API contracts are frozen;
4. a current recoverable Production backup and restore proof are qualified;
5. read-only Production preflight confirms the expected L0b/catalog baseline;
6. the Owner approves the exact migration bytes, hash, project, base, and
   rollback procedure.

The migration must be created with the project-pinned Supabase CLI in an
environment where that CLI is available. This source workspace cannot create
the CLI state directory, so this review packet intentionally does not invent a
migration filename.

## Rollback

- Before Production apply: close the branch/PR or revert the source commit.
- After an additive schema apply but before client activation: keep Drive
  authoritative, disable L1 flags, and forward-fix; do not drop tables or erase
  receipts automatically.
- After any acknowledged L1 write: freeze writes and export/reconcile every
  acknowledged mutation before changing authority. Never point clients blindly
  at an older Drive snapshot.
