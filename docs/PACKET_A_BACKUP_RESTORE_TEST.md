# Packet A Backup Gate B-2 — refreshed isolated restore

> **SOURCE ONLY**
>
> **RESTORE NOT EXECUTED**
>
> **DO NOT MERGE**

This one-time packet verifies whether the refreshed encrypted logical backup
can be restored into a disposable Supabase-compatible PostgreSQL 17 target.
Opening its Draft PR runs source checks only. It does not connect to or write
Production, apply a migration, import/backfill data, change a GitHub
Environment, apply an approval label, deploy, or start L1.

## Exact source boundary

- Base: `main@eeac0ba1c542a17e3d9570f34dba936a20416c6e`
- Base tree: `fc2db3abf19a23307d70bca0723c121b62c923bc`
- Temporary branch: `ops/packet-a-isolated-restore-refresh`
- Change boundary: exactly one commit adding exactly these four files:
  - `.github/workflows/packet-a-one-time-isolated-restore.yml`
  - `docs/PACKET_A_BACKUP_RESTORE_TEST.md`
  - `ops/packet-a-one-time-isolated-restore-check.py`
  - `ops/packet-a-one-time-isolated-restore.sh`
- Workflow permissions: `actions: read`, `contents: read`
- Only referenced Environment secret: `BACKUP_PASSPHRASE`

The exact remote head and tree are recorded in the Draft PR after the single
commit is created. Any source change creates a new exact-head approval boundary.

## Exact refreshed backup contract

- Run: `32587955307`, attempt `1`, run number `3` — `SUCCESS`
- Backup job: `97067096268` — `SUCCESS`
- Artifact ID: `9479566992`
- Name: `dashboard-supabase-backup-20260822T173203Z`
- ZIP size: `30428` bytes
- ZIP SHA-256:
  `d771caa09a77e3b5e6f558dcdda155410c21ebadc786ec6434b1336791ce4d8d`
- Created: `2026-08-22T17:33:07Z`
- Expires: `2026-08-23T17:33:07Z`
  (`2026-08-24 00:33:07` Asia/Bangkok)
- Encrypted archive size: `29153` bytes
- Encrypted archive SHA-256:
  `b7f651d32b7ac31225839484736e0c8d926e65523120bcc94924c5520a166807`
- `roles.sql` SHA-256:
  `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd`
- `schema.sql` SHA-256:
  `486740df4ff1dd27ab57a780f1330b27fb46b0acc35986bf5bf821188e5c9c51`
- `data.sql` SHA-256:
  `ba5df3ef02b265060a142ab7e744258f47c13da5ad242c07c789c88ce202d9ef`
- Project: `qjaywadzvwvcspdsjxth`
- Backup source:
  `ops/l0a-one-time-production-backup@bb11eae5632cc615dff3029b87e6413caad3a279`
- Supabase CLI: `2.111.0`
- Packet A ACL source SHA-256:
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`
- Restore image:
  `supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f`
- Owner custody of this refreshed artifact: **NOT CONFIRMED**

The workflow validates the artifact repository/run/source identity, metadata,
expiry, ZIP size/digest and exact two-member ZIP contract before decryption.
The restore script then validates the encrypted archive, manifest and all three
plaintext SQL digests. There is no fallback or artifact substitution.

## Why this refresh adds Packet A ACL checks

This backup was captured after the Packet A ACL hardening was applied. The
restore must therefore fail closed unless the disposable target reproduces:

- the exact `anon`, `authenticated`, and `service_role` privilege matrix for
  all five `mtp_line_*` tables and their columns across PostgreSQL 17
  privileges, with no API-role grant option;
- authenticated `UPDATE` only on
  `status`, `error_code`, `applied_at`, and `updated_at` in
  `mtp_line_mutations`;
- `EXECUTE` on the four LINE `SECURITY DEFINER` functions only for
  `service_role`;
- RLS on all five tables and the exact ten-policy inventory; and
- no effective API-role access on a new postgres-owned table, sequence, or
  function, proving the restored postgres default-privilege behavior.

The probe objects are created only inside the network-isolated disposable
database, checked in the post-restore transaction, and dropped. The reviewed
ACL assertion source block is itself SHA-256 locked by the checker.

## Separately gated restore procedure

If separately authorized at the final exact PR head, the restore job will:

1. revalidate the same-repository branch, base, head, one-commit and four-file
   source boundary;
2. download only artifact `9479566992` from run `32587955307` through the
   read-only GitHub token;
3. consume only the protected `BACKUP_PASSPHRASE` Environment secret;
4. bootstrap PostgreSQL 17 with Supabase CLI `2.111.0`, repository migrations
   and seed disabled;
5. verify the immutable image and compatible Auth catalog;
6. stop the local stack and restart only its database volume with
   `--network none`, no published port and no remote database variable;
7. before decryption, require the exact Storage migration `0..60` bootstrap,
   apply the reviewed additive migration 61–62 compatibility bridge to the
   disposable target, and keep the Storage service ledger unchanged;
8. decrypt only inside the ephemeral runner, then verify the exact internal
   five-file archive and digests;
9. restore `roles.sql` → `schema.sql` → replica-mode `data.sql` atomically;
10. reconcile exact COPY/restored counts for `auth.users` and the five LINE
    tables;
11. verify exact tables, RLS, policies, functions, indexes, ACLs, default
    privileges, zero LINE owner orphans, and zero L0b tables; and
12. delete the isolated container, plaintext SQL, passphrase material and
    private logs without uploading an output artifact.

The durable output contains fixed metadata and aggregate PASS/FAIL assertions
only. Raw SQL, row content and private restore diagnostics are neither printed
nor uploaded.

## Execution gate — not authorized by this source packet

The restore job remains skipped unless all of these happen later:

1. source-safety and normal CI pass at the final exact PR head;
2. focused security/recovery review has no blocker;
3. the Owner separately approves restore execution for that exact head;
4. label `owner-approved-b2-restore` is applied after that approval;
5. protected Environment `production-backup` is configured to allow only the
   exact generated PR ref `refs/pull/<PR_NUMBER>/merge`; and
6. the required Environment reviewer approves that exact deployment.

Do not infer authorization for any item above from opening this Draft PR.
Do not add the label, change the Environment, approve the deployment, execute
the restore, merge, or apply L0b under source-only authorization.

## Fail-closed stop conditions

Stop without repair, fallback, substitution, or blind retry if:

- the pinned artifact is expired, unavailable, renamed, moved, or differs by
  metadata, member set, size, manifest, or digest;
- the passphrase is absent or cannot decrypt the exact archive;
- a remote database variable reaches the job;
- the CLI, image, PostgreSQL 17/Auth catalog, network mode, or port boundary
  differs;
- the Storage baseline/bridge or its unchanged service ledger differs;
- roles/schema/data cannot restore in the single transaction;
- row counts, required objects, RLS, policies, indexes, function security
  metadata, exact ACLs, postgres default privileges, or owner reconciliation
  differ;
- an L0b table exists; or
- the branch, source, label, Environment ref, or approval boundary differs.

If the artifact expires, request a separate B-1 rerun. Never substitute another
artifact. Never edit the dump, ignore restore errors, run `supabase db push`,
upload diagnostics, or connect the drill to Production.

## Boundary and limitations

B-2 proves logical recoverability and the explicitly asserted restored catalog
contract only. B-1 did not dump the migration ledger separately, so this drill
does **not** claim migration-history identity even though it pins and checks the
Packet A ACL source and effective restored privileges.

The disposable Storage bridge proves only the schema compatibility needed by
this pinned logical dump; because it deliberately leaves the service ledger at
`60`, it is not evidence that the isolated Storage service ran migration `62`.
Storage binaries, Edge Functions, LINE/Netlify configuration, secrets, DNS,
Google Drive, deployments and Production changes remain out of scope.
