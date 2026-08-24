# L1B Full Planner Parity

Status: **provider-free source contract; disabled by default; not a migration**

Exact source base: `main@19b42d6f926fe5bc327ac80854c20a16de0381da`

## Safety boundary

L1B extends the merged L1A source contract in review and throwaway tests only.
It does not create a Production migration, bucket or browser write path. It does
not repeat the L0b import, read planner content from Production, change Auth or
providers, demote Drive, reconcile owner data or cut over authority.

Browser + Google Drive remain authoritative. The shared browser bridge is
published with `enabled=false` and `mode="off"`; no timer, Drive save, LINE path,
page load or online event may enqueue or send an L1 mutation while disabled.

## Selected-profile boundary

One authenticated Supabase owner represents one selected planner dataset in
the L1 contract. The Full application's local profile list, active-profile key,
local file handles and Drive linkage remain device-local. Non-secret metadata
for the selected profile (display name and emoji) may be stored in planner
settings, but a local profile switch must fail closed until a later explicit
bind/reconciliation flow confirms the selected dataset.

This boundary matches version-7 Drive files, which contain the active profile's
planner data rather than the device's whole local profile registry. Expanding
one owner into several simultaneous server datasets requires a new identity and
migration decision; L1B does not infer or silently merge them.

## Parity map

| Version-7 planner data | L1 source representation | Write contract |
|---|---|---|
| `personal`, `work` task fields | L1A `mtp_tasks` | L1A task create/update/delete v1 |
| task `subtasks`, `deps` | `mtp_subtasks`, `mtp_task_dependencies` | atomic task-children replacement with task expected-version |
| task attachment links/private files | `mtp_task_attachments` + private Storage object | versioned attachment metadata; binary upload stays a separate acknowledged step |
| `events`, multi-window dates/locations | `mtp_events`, `mtp_event_windows` | atomic event put/delete with stable event/window UUIDs |
| `notes` | `mtp_notes` | versioned note put/delete; HTML is data and must be sanitised before rendering |
| embedded note images | `mtp_note_assets` + private Storage object | versioned asset metadata; no base64/data URL in database HTML |
| `customTabs`, `eventTypes`, saved views, group colours, tab/widget order | `mtp_planner_settings.settings` | allowlisted whole-document update with expected-version |
| selected profile name/emoji and safe UI config | `mtp_planner_settings.settings` | same settings update |

Device-local and excluded from the server document: `fileName`, file handles,
Drive file/link/sync metadata, OAuth tokens, Auth sessions, API keys/client
secrets, provider identifiers, `activity`, `tabReads`, search history,
notifications, edit history, local storage limits and UI transient state.

Allowed config keys are presentation/behaviour preferences only. Provider,
credential and local-path keys including `anthropicKey`, `googleApiKey`,
`googleClientId`, `msAppId`, `defaultFilePath` and `defaultFileName` fail closed.

## Mutation and conflict contract

Every mutation carries a client-generated UUID idempotency key. Updates and
deletes carry the exact server version observed by the client. Identical retry
returns the recorded result; different bytes under the same key fail. A stale
version never becomes last-write-wins.

Children and dependencies replace one task aggregate atomically. An omitted
direct child becomes a tombstone; an imported child is never silently deleted
by a direct client. Event windows are replaced atomically by stable UUID, not by
display ordinal. Notes, settings and attachment metadata follow the same
receipt/version/tombstone semantics.

The offline queue stores only mutation envelopes, expected versions,
idempotency keys and bounded non-binary payloads. It must:

- preserve FIFO order per selected profile;
- reuse the original idempotency key on retry;
- stop on validation, authentication and version conflicts;
- retry only transient network/5xx/rate-limit failures with bounded backoff;
- never contain base64, Blob/File objects, access tokens or provider secrets;
- require an explicit later activation before it can call Supabase.

## Private object contract

The source-only Storage contract reserves one non-public bucket,
`mtp-private`, with a 5 MiB object limit and a narrow MIME allowlist. Object
paths are owner-bound:

```text
<auth.uid()>/task/<task-uuid>/<attachment-uuid>/<safe-name>
<auth.uid()>/note/<note-uuid>/<asset-uuid>/<safe-name>
```

Authenticated policies may access only their own prefix in that bucket.
Metadata rows repeat owner binding, parent identity, byte count, MIME type,
path and SHA-256 digest. A metadata acknowledgement and a Storage upload are
separate operations; the client must not claim an attachment is durable until
both succeed. No automatic binary cleanup is part of this source slice.

## Compatible Drive export

Drive export remains version 7 and keeps the existing top-level keys. Server
rows are projected back into `personal`, `work`, `events`, `notes` and the
saved-view/config keys. UUID strings are valid planner IDs. Private objects are
exported as bounded metadata/reference entries; Drive export must never embed
Supabase Auth tokens or signed URLs. An optional later archive exporter may
download binaries only after an explicit owner action.

Until L1C is approved and verified, the browser continues to export its current
authoritative payload. L1B source publication alone does not redirect Save to
Cloud or change Drive conflict behaviour.

## Verification and later gates

Throwaway PostgreSQL 17 and browser tests must prove schema compatibility after
L0b + L1A, ACL/RLS isolation, receipt replay, stale-version conflicts,
tombstones, stable child/window identity, dependency-cycle rejection, settings
allowlists, private path constraints, offline queue safety and version-7 export
compatibility.

Promotion and activation remain separate exact gates:

1. independent source/security review and exact-head CI;
2. current recoverable backup plus isolated restore proof;
3. read-only Production catalog/data-shape preflight;
4. exact migration and Storage-policy bytes/hash/project/rollback approval;
5. schema apply and catalog verification;
6. disabled client publication, then separate activation;
7. full-owner reconciliation and observation window;
8. L1C authority cutover; only then may Drive become export/backup/archive.
