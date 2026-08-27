# L1B fresh post-import B-2 isolated restore

## Status

This document defines the **Draft-only, non-Production** recovery proof for the
fresh post-import B-1 backup. It does not authorize merge, Production migration,
Storage creation, import, client activation, reconciliation, Drive demotion,
cleanup, or L1C cutover.

The source branch must remain exactly one commit from
`main@297854c09205097a6a58cbce4c64961c802cd7a3` and contain only the twelve
files listed below. A synchronize event may run source checks only. The restore
job can run only from one fresh `owner-approved-b2-restore` label event, run
attempt 1, and the protected `production-backup` Environment.

## Fresh replacement B-1 recovery anchor

- Backup workflow run: `33080201954`
- Backup source branch: `ops/l1b-post-import-backup-refresh`
- Backup source SHA: `f620c67909a7cbfd88acabe88ba75c404f44efe9`
- Source-safety job: `98545017025` — **PASS**
- Owner-gated backup job: `98545082126` — **PASS**
- Artifact ID: `9649991620`
- Artifact name: `dashboard-l1b-post-import-backup-20260827T141138Z`
- Created: `2026-08-27T14:12:42Z`
- Expires: `2026-08-28T14:12:41Z`
- ZIP: `56354` bytes; SHA-256
  `45cb33f845f6f979f7d759b88b17ad79acac215f924b47e84ad9fd55d4453a8a`
- Encrypted archive: `54957` bytes; SHA-256
  `01a1a64458601b69d47187f2a2a7b4976b6bb31d5e2afe7ffffea866454a7260`
- Roles/schema/data SHA-256:
  `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd`,
  `645e07100834b1e50da3baeeddd9a9a56c59474620a0ec1864d94bfe5ae7a46e`,
  `b886880bbfd824515291297dd766f829fa6f6f4dac55851587b707270ab5a693`
- Manifest SHA-256:
  `b16d6e83a55e9e993f8dfe97a55a9d57e626c94d627a02a5c3cffd97a26a58da`
- GitHub artifact availability: **available and unexpired at packet creation**
- Owner custody of a separately downloaded copy of this replacement artifact:
  **pending confirmation**

No replacement artifact or unpinned metadata is accepted. The prior artifact
`9550594832` is expired and is not a valid substitute.

## Exact twelve-file boundary

1. `.github/workflows/l1b-post-import-isolated-restore.yml`
2. `docs/L1B_POST_IMPORT_RESTORE.md`
3. `ops/l1b-post-import-isolated-restore-acl-check.sh`
4. `ops/l1b-post-import-isolated-restore-acl-patch.py`
5. `ops/l1b-post-import-isolated-restore-aicc-check.py`
6. `ops/l1b-post-import-isolated-restore-check.py`
7. `ops/l1b-post-import-isolated-restore-core.sh`
8. `ops/l1b-post-import-isolated-restore-count-check.py`
9. `ops/l1b-post-import-isolated-restore-review-check.sh`
10. `ops/l1b-post-import-isolated-restore-stdin-patch.py`
11. `ops/l1b-post-import-isolated-restore-telemetry.sh`
12. `ops/l1b-post-import-isolated-restore.sh`

## Frozen source and derived pins

The ten executable helper/source blobs are unchanged from the privacy-reviewed
predecessor:

- Wrapper blob: `228a584f7d3428fb9b5565402730103282fe2389`
- Telemetry blob: `7dfdd97243f24342b1464ba8cac24dc9c5625721`
- Catalog/stage/cleanup injector blob: `ae3970904f1044b27ed756350d61323cbce05bed`
- Stdin/review patcher blob: `8fca84c90bfd972c034997ba575484b285dda89b`
- Raw core blob: `081095bb462429900f119fba1615842e3b4690db`
- Raw ACL checker blob: `24d275b120cda5508b38e7825643c3740af63221`
- AICC checker blob: `33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2`
- Contract checker blob: `a30e5ba299a8c81c49c36376baae25aef06f9116`
- Count checker blob: `39acfa0b950c5ec9365f46623d416d4cbc882e52`
- Raw review checker blob: `eadcafd96d440e9467671a4de457843ba8b98505`
- Stdin-safe core / ACL / review:
  `3257712533abcf7eb1cde350a63b4fa882e137db` /
  `87158a8c3da4807672c7ba463c644b57c9dd39a0` /
  `c3ac18d0c68485beb841dc96ef0df11db33b6b01`
- Final derived restore core:
  `793485061488079cbdf69e341c3c52ee4a0bfa49`

Every GitHub Action reference is a 40-hex immutable commit SHA. The disposable
database image remains:

`supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f`

## Previous fail-closed attempts

### Attempt 1 — run `32841653681`

The restore stopped because heredoc-backed `docker exec` calls did not keep
stdin open. No Production connection or write occurred. The deterministic stdin
patcher now audits and repairs every heredoc-backed Docker execution.

### Attempt 2 — run `32850877666`

Source safety passed, but the restore stopped before a recovery PASS could be
established. Private diagnostics were deliberately withheld. The final source
adds fixed, privacy-safe stage telemetry and does not represent Attempt 2 as
successful.

## Recovery and security controls

The final source enforces:

- exact repository, base, branch, one-commit history and twelve-file manifest;
- exact encrypted artifact metadata, expiry, sizes and hashes;
- only the `BACKUP_PASSPHRASE` Environment secret;
- no Production database URL or provider write credential;
- PostgreSQL 17 target with `--network none` and no published port before
  decryption;
- transactional roles → schema → replica-mode data restore;
- exact B-1 COPY-count reconciliation;
- accepted planner aggregate `105/17/6/15/0`, LINE `1/5/1/17/1`, and eight
  zero-row AICC tables;
- RLS, policies, catalog/index fingerprints, raw/default/function ACLs,
  effective privileges, complete runtime role graph, owner integrity and all
  `57` public application foreign keys;
- absence of L1A/L1B tables, the `private` schema, `mtp-private` bucket/policies,
  and `storage.objects` rows for that bucket;
- fixed-stage diagnostics that never publish SQL, credentials, row content,
  source paths, line numbers, return codes or private helper logs;
- cleanup trap installed before passphrase materialization;
- unconditional deletion and verification of passphrase, metadata, artifact ZIP,
  extracted encrypted files, plaintext work directory, disposable containers and
  inherited database volume;
- no PASS marker until disposable cleanup has been verified.

## Attempt gate

Before creating the fresh label event:

1. exact-head normal CI must pass;
2. B-2 source-safety must pass and synchronize restore must be skipped;
3. independent exact-head review must report zero unresolved
   Critical/High/Medium findings;
4. all review threads must be resolved;
5. read-only Production baseline must remain unchanged;
6. artifact `9649991620` must remain exact, available and unexpired;
7. Owner custody of a separately downloaded copy of artifact `9649991620` must
   be confirmed.

A label event is consumed once. GitHub reruns are blocked by
`github.run_attempt == 1`. The Environment reviewer must approve only the exact
new run.

## Hard stop

**DO NOT MERGE OR APPLY.** This packet does not authorize Production SQL,
migration-history writes, Storage creation, Auth/RLS/provider changes, import,
backfill, reconciliation, client activation, Drive demotion, resource deletion,
cleanup of Production assets, or L1C cutover. Q-L1B-004 and Q-L1B-005 remain a
separate exact Owner Critical Gate.

## Exact final PASS and diagnostic boundary

- Every database fingerprint/query command writes stdout and stderr only to a
  mode-`0600` runner-private file.
- Public failure output is limited to fixed allowlisted stage markers and
  validated count/digest fields.
- Core, ACL and independent-review helpers emit completion markers only; they do
  not emit the recovery PASS marker.
- The telemetry entrypoint removes and verifies absence of passphrase, run
  metadata, artifact metadata, downloaded ZIP and extracted encrypted artifact
  before returning success.
- The workflow emits the sole exact
  `L1B fresh post-import B-2 isolated restore: PASS` marker only after the
  restore succeeds and the unconditional cleanup gate verifies zero residual
  artifact paths, containers, inherited volumes and plaintext work directories.

## Requalification note

This packet changes only the B-1 artifact pins in the workflow and recovery
document. All ten executable helper/source blobs remain unchanged. The workflow retains one
clearly marked, non-environment legacy source-token comment solely for compatibility
with the predecessor static contract checker; runtime metadata validation parses and
uses only the active `f620c679...` environment pin. A synchronize event may qualify
source and normal CI, but cannot execute the restore because no approval label is
present.
