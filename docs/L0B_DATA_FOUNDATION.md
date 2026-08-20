# L0b Normalized Supabase Data Foundation

Status: source merged in PR #76 as `main@67fe86cac29b3facecd08290a3000ba23bc8a684`;
migration not applied, no backfill/import run, and no source-of-truth cutover.
The GitHub Pages path published the browser asset automatically after merge;
Packet A keeps its Full/Mobile controls disabled in source until a separate
backend-activation release.

## Purpose and boundary

L0b adds an additive, owner-scoped normalized projection of the current planner
data. It is a foundation and reconciliation exercise, not L1 direct Todo access.
The browser plus Google Drive remain authoritative. The reviewed manual importer
is retained, but Packet A exposes `enabled=false`, hides both Full/Mobile
controls, and makes their handlers fail closed. A later reviewed activation must
deliberately enable it. Drive save, Auto-sync, LINE snapshots, mutation queues,
timers, and provider configuration do not invoke it.

The unapplied migration is
`supabase/migrations/20260820032749_l0b_data_foundation.sql`. The local Supabase
CLI was unavailable when the file was authored, so the filename uses the
recorded UTC creation timestamp. No remote migration command was run.

## Exact data model

L0b creates exactly nine `public` tables:

1. `mtp_import_batches` — lease/generation fence and server evidence.
2. `mtp_import_chunks` — exact-byte chunk hashes and stream completeness; no
   planner content.
3. `mtp_import_staging` — transient projected content only.
4. `mtp_import_rejects` — metadata-only quarantine evidence.
5. `mtp_tasks` — personal/work tasks.
6. `mtp_subtasks` — stable-ID task children with `text`, `done`, and display
   `ordinal`.
7. `mtp_events` — event metadata; dates live only in the windows table.
8. `mtp_event_windows` — positional date values keyed by
   `(owner_id,event_id,ordinal)`.
9. `mtp_task_attachments` — HTTPS/file-reference metadata only; never binary
   content.

Tasks, subtasks, events, and attachments receive server UUIDs and retain their
usable legacy source ID. Event windows deliberately do not receive UUIDs or a
source key: reordering changes positional values, so L0b does not claim stable
window identity across reorder.

Every relationship carries `owner_id` in a composite foreign key. Parent targets
have matching `(owner_id,id)` uniqueness. This prevents cross-owner references
structurally even if a definer function later loses an owner predicate.

## Identity

Canonical source IDs accept NFC strings or safe integers. Empty, whitespace-only,
control-character, oversize, fractional, unsafe-integer, boolean, array, object,
missing, and null IDs are rejected. Canonical keys use length-prefixed namespaces:

```text
task       = T + N(task_kind) + N(canon(task.id))
event      = E + N(canon(event.id))
subtask    = S + N(parent task key) + N(canon(subtask.id))
attachment = A + N(parent task key) + N(canon(attachment.id))
```

There is no ordinal or content-fingerprint identity fallback. Every occurrence
of a duplicate canonical key is quarantined; there is no first/last winner. In
particular, a legacy `Date.now()` subtask collision makes the whole import
`partial`, writes no normalized entity/tombstone, and requires the Owner to
repair that subtask in the authoritative planner. This is the approved D-1
`A + A1` behavior; changing existing subtask IDs is deferred to L1 preparation.

## D-1 source-shape policy

L0b preserves source shape rather than converting legacy irregularities into
whole-batch failures:

- subtask text is stored as `text` with a 4,000-character corruption backstop,
  not the AI-only 120-character truncation;
- subtask and event-window ordinals require only `>= 0`; no current UI cap is a
  database upper bound;
- inverted event windows are preserved; no `window_end >= window_start` check
  exists;
- counts above current UI expectations and inverted windows are recorded in
  database-generated `counts.anomalies`, not reject rows.

Identity and unsafe-content failures remain rejects. This keeps all-or-nothing
finalization intact.

## Authorization and RLS

All nine tables have RLS enabled. Each has exactly one owner-scoped SELECT policy:

```sql
owner_id = (select auth.uid())
```

`authenticated` receives SELECT only on the eight readable tables and no direct
access to staging. No client role receives table writes. The two L0b identity
sequences are explicitly revoked from `PUBLIC`, `anon`, `authenticated`, and
`service_role`. Every function is explicitly revoked by full signature; only six
RPCs are granted back to `authenticated`:

- `mtp_import_claim`
- `mtp_import_heartbeat`
- `mtp_import_stage`
- `mtp_import_finalize`
- `mtp_import_abort`
- `mtp_import_purge_staging`

The write RPCs derive the owner from `auth.uid()`, use `SECURITY DEFINER` with an
empty `search_path`, fully qualify objects, carry explicit owner predicates, and
return the same `42501 import_not_available` result for nonexistent, stale, or
cross-owner batches. No service-role table or function grant is needed.

The L0b migration names every L0b object. It never uses schema-wide `ON ALL`
object grants/revokes and does not change the unrelated `aicc_*` product or
existing L0a objects. Packet A adds a separate, unapplied ACL-only migration for
`postgres` default privileges and exact existing `mtp_line_*` grants. It does
not alter existing `aicc_*` ACLs. The built-in future-function `PUBLIC EXECUTE`
default is revoked globally for the `postgres` owner because PostgreSQL cannot
remove that default per schema. `RISK-L0A-ACL-1` remains open in Production,
including provider-owned `supabase_admin` defaults, until separate apply and
provider-setting approvals are completed and verified.

## Manual import protocol

The browser projects only approved fields and strips attachment binary values
before transport. It serializes each bounded chunk once and retries the exact
same UTF-8 string. The server hashes the received bytes before parsing:

```text
chunk_hash = sha256(enc_int(seq) || enc_text(kind) || enc_bytes(UTF8(payload_text)))
stream_hash = sha256(concat(chunk_hash ordered by seq))
```

Each chunk is limited to 1 MiB and 2,000 rows. Invalid JSON, non-array JSON, or a
limit violation aborts the RPC before a chunk or staging row persists. Identical
retry is a no-op; the same sequence with different bytes, kind, or final flag is
a conflict.

Claim freezes both `declared_chunk_count` and the client stream hash. The server
derives completeness from count, contiguous sequence range, final position, and
hash equality. An explicitly empty traversal has zero chunks and both sides use
`sha256('')`; it is the only valid full-deactivation path.

One running batch per owner is enforced by a partial unique index. Monotonic
generation and a lease fence reject stale writers. Expired takeover marks the
old batch terminal and purges its staging before issuing a new generation.

## Finalize, reconciliation, and tombstones

Finalize has two phases:

1. Outside the apply subtransaction it validates the fence and complete stream,
   generates reject/quarantine evidence over the complete staged set, and
   computes the payload set hash. Incomplete streams fail; any reject produces
   `partial`. Both paths make zero normalized changes and zero tombstones.
2. A complete zero-reject batch performs parent-first upserts and tombstone
   updates inside one PL/pgSQL exception subtransaction. The database computes
   active/tombstone hashes and counts. A hash mismatch raises SQLSTATE `L0B01`;
   PostgreSQL rolls back every entity change to the implicit savepoint, then the
   outer function records bounded failure evidence.

The persisted failure detail is only a fixed code and five-character SQLSTATE;
no database message, constraint name, raw ID, or planner content is retained.

The canonical row encoder is typed and length-prefixed. Set hashes sort 32-byte
row hashes bytewise and retain multiplicity. `version` changes only when content
hash or active state changes; it is not advertised as optimistic concurrency.

Missing source records are tombstoned with `is_active=false`; the importer never
hard-deletes normalized entities. Reappearance matches the stable source key and
reactivates the original UUID. Parent deactivation logically deactivates its
children. Projected staging content is purged on finalize, abort, expired
takeover, or the explicit owner purge RPC; batch/chunk/reject evidence remains.

## Projection exclusions and non-goals

L0b is intentionally a partial projection. It excludes notes, descriptions,
`customTabs`, `eventTypes`, saved views/configuration, progress, assignee,
project-specific extended fields, recurrence, dependencies, event-window
location/`loc`, and attachment binaries.

L0b does not:

- make Supabase authoritative;
- perform backfill or import against Production;
- enable automatic, shadow, or dual write;
- add direct browser/LINE Todo mutation;
- retire the LINE mutation queue or snapshots;
- remove Open Planner or Save to Cloud;
- change Google Drive, Netlify, LINE Console, Rich Menu, Edge Functions,
  secrets, retention, cleanup, or existing migrations.

## Verification and release gates

`build/l0b-import.test.mjs` verifies projection boundaries, D-1 fidelity,
exact-byte hashing, zero-chunk hashing, RPC order, and that the one reviewed
manual control per client remains behind the disabled Packet A gate. Node and
PostgreSQL both consume the committed
`test/vectors/l0b-canonical.json` and `test/vectors/l0b-chunk-bytes.json` suites
to detect row-encoder, source-key, set-order, multiplicity, Unicode, framing,
and transport-byte drift. `static_l0b_data_foundation.sh` enforces scope and
privilege patterns.
`l0b_data_foundation.test.sql` applies the source migration only to a throwaway
PostgreSQL 17 service and exercises privileges, RLS, exact-byte idempotency,
duplicate quarantine, empty traversal, tombstone/reactivation, evidence purge,
and cross-owner denial.

The PR #76 source gate is closed and source is merged. Packet A is a separate
source-only Draft PR: CI must pass at exact HEAD, followed by one targeted
critical review; no repeated full L0b review is required. Any Production change
still requires an Owner-approved fresh recoverable backup, provider/default-ACL
decision, separate migration/import/deployment approvals, and post-deploy
reconciliation smoke. Rollback for L0b writes is to keep the importer disabled;
the additive tables may remain and the browser/Drive/LINE snapshot path stays
usable.
