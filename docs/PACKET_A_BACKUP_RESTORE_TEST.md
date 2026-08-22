# Packet A Backup Gate B-2 — One-time isolated restore

Status: **SOURCE-ONLY STORAGE COMPATIBILITY REMEDIATION / ATTEMPT 3 FAILED CLOSED / RESTORE NOT COMPLETED / DO NOT MERGE**

This temporary packet tests whether the fresh encrypted logical backup can be
restored into a disposable Supabase-compatible PostgreSQL 17 target. It does
not connect to or write Production, apply a Production/repository migration, import planner data,
deploy an application, alter a provider, expose a secret, clean up retained
evidence, or start L1.

## Exact source and backup contract

- Source base: `main@15dcf50feff137df8d9fec1ac44dd2a611647981`
- Temporary branch: `ops/packet-a-isolated-restore-test`
- Fresh backup run: `32149051510`, attempt 2
- Backup job: `96681690187` — `SUCCESS`
- Artifact ID: `9452687931`
- Artifact name: `dashboard-supabase-backup-20260821T153930Z`
- Artifact size: `30451` bytes
- Artifact ZIP SHA-256:
  `8e4ab3857f546e027df7b5ee7867e27070798fac3f77a292bbc8c92bef9812d8`
- Artifact expiry: `2026-08-22T15:40:38Z`
- Encrypted archive size: `29176` bytes
- Encrypted archive SHA-256:
  `1f74262d1b341ed919b0a8f8fe29ffb852946cd5d6ab1700f13e97ede97c91e4`
- Backup source branch: `ops/l0a-one-time-production-backup`
- Backup source head: `bb11eae5632cc615dff3029b87e6413caad3a279`
- Supabase CLI: `2.111.0`
- CLI Storage baseline / required compatibility target: migrations `60 / 62`
- Reviewed upstream Storage migration blobs:
  `473f19ac94419f9cd3f25f2e40c97cefafb2798d` (`61`) and
  `76cf3f7f0f26d37d257c32ebb90f5beeb5a32a1e` (`62`)
- Restore image:
  `supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f`
  (`supabase/postgres:17.6.1.156` multi-platform manifest embedded by CLI
  `2.111.0`)

The workflow validates GitHub artifact metadata before download, including the
repository, run, source branch, source SHA, artifact name, size, digest, creation
time and expiry. It then verifies the downloaded ZIP digest, exact two-member
ZIP contract, encrypted archive digest, manifest and all three plaintext SQL
digests. Any mismatch stops without fallback.

## Attempt 1 failure and source remediation

Workflow run `32509169596` at PR head
`6752c81491dcf0788196719e7fd8d6763a41a1b4` passed source-safety and the pinned
artifact metadata, ZIP digest, CLI, tooling and passphrase gates. Job
`96856080311` then failed closed at the exact two-file check, before image pull,
bootstrap, decryption or restore. No plaintext backup was created, no database
connection was made, Production was unchanged and the run uploaded no artifact.

The deterministic cause was order-only: downloaded member names were sorted as
manifest then archive, while the expected array remained archive then manifest.
This source remediation sorts both sets with the same canonical locale and uses
the runtime helper in a source-safety regression test that accepts the exact two
files and rejects an unexpected member. The consumed approval label was removed.
No rerun is authorized by this remediation; a replacement exact head requires a
new Owner execution approval, label application and protected Environment
approval.

## Attempt 2 failure and diagnostic remediation

Workflow run `32512449962` at PR head
`14fa503cd52319d13d2714a1e4ccb1232ca8e78f` passed source-safety, artifact
metadata and digest validation, the pinned CLI/tooling/passphrase gates,
network-isolated PostgreSQL 17 bootstrap, decryption and exact five-file digest
validation. Job `96866506598` then failed closed inside the single atomic
roles -> schema -> replica-mode data restore. Post-restore reconciliation was
not reached. The private raw log was withheld and deleted, no output artifact
was uploaded, and no Production connection or change occurred.

That privacy control left the exact failing phase and database error class
unknown. This source-only remediation separates psql stdout from private stderr,
adds ordered `roles`, `schema`, and `data` stderr markers bound to a fresh
128-bit per-run nonce, and sets psql error verbosity to `sqlstate`. On failure,
a bounded parser accepts exactly one error only when its marker nonce, phase and
dump-file source (or the approved data-phase client action) agree. The SQLSTATE
must also be one of the PostgreSQL 17 error codes pinned in the checker from the
reviewed upstream source blob. Only the phase and that allow-listed SQLSTATE are
published. Raw SQL, object names, line content, row values and both private logs
remain withheld and deleted. Every nonempty stderr line must match the narrow
marker/error/non-error grammar; a custom code, any other server or client
diagnostic, or an absent, malformed or ambiguous classification reports only
`phase=unknown sqlstate=unknown` and stops.

This is diagnostic instrumentation, not a restore fix. It does not authorize a
third attempt. Any rerun still requires a new Owner execution approval for the
replacement exact head, label application and protected Environment approval.

The phase classification trust boundary is the exact approved B-1 artifact:
the workflow pins its ZIP and encrypted-archive digests, and the restore script
pins the three plaintext dump digests generated by the approved dump tooling.
The nonce-bound stderr grammar reduces accidental ambiguity and output
injection within those immutable inputs; it is not an authenticity mechanism
for arbitrary or unpinned executable psql scripts, which are outside this
one-time packet's contract.

## Attempt 3 failure and Storage compatibility remediation

Workflow run `32560555056` at PR head
`45e153c9b0a47a442d40cf76307316da5760391d` passed source-safety, artifact,
toolchain, passphrase, immutable-image, PostgreSQL 17, network-isolation,
decryption and plaintext-digest gates. Job `97001355525` then failed closed in
the data phase with SQLSTATE `42703` (`undefined_column`). Private diagnostics
and plaintext were deleted, no output artifact was uploaded, and no Production
connection or change occurred.

The deterministic compatibility mismatch is between the pinned disposable
stack and the approved backup. CLI `2.111.0` bootstraps Supabase Storage through
upstream migration `60`. Production and the B-1 data dump include migration
`62`, whose additive schema adds `storage.buckets.versioning_status` plus
`storage.objects.archived_at`, `is_delete_marker`, and `is_versioned`. A
`pg_dump --data-only --use-copy` COPY header names source columns even when the
table has zero rows, so the migration-60 target rejects that header with
`42703` before reconciliation.

This replacement source keeps the reviewed CLI, artifact and immutable
PostgreSQL image. After the disposable database is verified as `--network none`
and before decryption, it requires the exact migration-60 Storage baseline,
applies the reviewed additive SQL from upstream migrations `61` and `62` in one
transaction, verifies the function, four columns and three constraints, and
verifies that `storage.migrations` remains unchanged at `60`. The bridge does
not edit the backup, run a Storage service, claim service-managed migration
history, use a remote database variable, or affect Production. Its entire
source block is SHA-256 pinned by the source-safety checker.

This source change does not authorize a fourth attempt. A rerun requires a new
Owner approval for the replacement exact head, the exact label and the protected
Environment approval.

## Source-only gate

Opening the Draft PR runs only non-secret source-safety checks. The restore job
requires every item below later and remains outside the current authorization:

1. the exact PR base, head, one-commit and four-file boundary remain unchanged;
2. source-safety CI passes;
3. the focused security/recovery check has no blocker;
4. the Owner separately approves restore execution at the exact PR head;
5. the exact label `owner-approved-b2-restore` is applied after that approval;
6. GitHub Environment `production-backup` is separately allowed for the exact
   temporary branch; and
7. the Owner approves that exact protected Environment deployment.

Do not change the Environment, apply the label, approve a deployment, execute
the restore, reopen PR #72, or merge this temporary branch under source-only
authorization.

## Restore procedure

The separately gated job will:

1. download only artifact ID `9452687931` from run `32149051510` through the
   read-only built-in GitHub token;
2. consume only the existing protected `BACKUP_PASSPHRASE` Environment secret;
3. bootstrap an empty local Supabase catalog with CLI `2.111.0`, repository
   migrations and seed disabled;
4. verify that the bootstrapped database uses the exact immutable PostgreSQL 17
   image above and contains a compatible `auth.users` catalog;
5. stop every container in that exact disposable local project;
6. restart only its database volume in an explicit container with
   `--network none`, no published port and no Production credential;
7. verify network mode, port bindings, image identity and PostgreSQL major 17
   before any decryption;
8. require the exact Storage migration-60 bootstrap shape, apply the reviewed
   additive migrations 61-62 compatibility bridge transactionally, verify its
   function/column/constraint shape, and leave the service ledger unchanged;
9. decrypt inside the ephemeral runner only after isolation, then verify the
   exact five-member archive and internal SQL hashes;
10. restore unedited `roles.sql`, `schema.sql` and replica-mode `data.sql` once
   in one transaction with `ON_ERROR_STOP=1`;
11. reconcile COPY counts with restored counts for `auth.users` and all five
    existing `mtp_line_*` tables;
12. verify the exact five LINE tables, exact ten-policy inventory, RLS, exact
    four RPC signatures, function owner/security/search-path metadata, four
    named indexes, zero owner orphans and an L0b table count of zero; and
13. remove the isolated container and delete plaintext SQL, passphrase material
    and raw logs from the ephemeral runner without uploading an artifact.

Raw SQL, planner/LINE row content and restore logs are never printed or
uploaded. A restore failure emits only a nonce-bound phase and one
approved PostgreSQL 17 error SQLSTATE, or an unknown/unknown fail-closed
fallback. The durable result is a non-sensitive PASS/FAIL summary with fixed
digests and aggregate assertions.

## Stop conditions

Stop without substitution, repair or blind retry when:

- the artifact is expired, unavailable, renamed, moved, or differs by metadata,
  file set, size, manifest or digest;
- the passphrase is missing or does not decrypt the pinned archive;
- a remote database variable reaches the job;
- the Supabase bootstrap or immutable image identity differs;
- the restore target has a network other than `none` or publishes any port;
- the target is not PostgreSQL 17 or lacks compatible Supabase Auth objects;
- the disposable Storage ledger is not exactly `0..60`, its expected migration
  60 objects already differ, or the reviewed compatibility bridge/post-check fails;
- roles/schema/data cannot restore transactionally;
- Auth or LINE COPY counts differ from restored aggregate counts;
- required LINE tables, policies, RLS, RPC security metadata or indexes differ;
- any LINE `owner_id` has no matching `auth.users` row;
- any of the nine L0b tables exists; or
- source, branch, label, Environment or approval gates differ.

Do not edit the SQL dump, ignore role errors, apply repository migrations, run
`supabase db push`, use another backup, upload diagnostics, or connect to
Production. A failure becomes a new scoped Owner decision.

## Boundary and limitations

B-2 proves logical database recoverability only. The B-1 manifest has no source
catalog/ACL or migration-history fingerprint, so B-2 cannot claim full
Production ACL or migration-history identity. The backup also predates the
Packet A ACL migration; this drill deliberately does not assert that hardening.
The disposable Storage bridge proves only the data-shape compatibility needed
for this pinned logical dump; because it deliberately does not modify the
service ledger, it is not evidence that Storage migration `62` was service-run.

Storage binaries, Edge Functions, LINE/Netlify configuration, secrets, DNS and
Google Drive are outside this packet. Browser + Google Drive remain the
authoritative Todo persistence; Supabase is not cut over by B-2.

No additional full Claude review is planned. The completed focused independent
security/recovery check is the only B-2 design review because this packet does
not change schema, migrations, RLS, application runtime or Production state.
