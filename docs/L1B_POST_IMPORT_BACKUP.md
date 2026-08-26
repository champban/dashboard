# L1B Replacement Fresh Post-Import Backup Gate B-1

Status: **OWNER AUTHORIZED / SOURCE REQUALIFICATION REQUIRED / ENVIRONMENT-GATED / DO NOT MERGE**

Decision date: `2026-08-26` (`Asia/Bangkok`)

## Why this packet exists

The previously qualifying B-1 artifact `9550594832` expired on
`2026-08-26T05:35:57Z`. Owner custody of a downloaded encrypted copy is
confirmed, but the B-2 contract prohibits artifact substitution. A newly pinned
GitHub artifact is therefore required before B-2 can run.

The Owner has authorized exactly one replacement B-1 Production logical-read /
export operation, conditional on exact-head source-safety and normal repository
verification passing. The authorization does not permit Production SQL writes,
migrations, Storage creation, Auth/RLS/secret/provider changes, import,
reconciliation, client activation, merge, cleanup or L1C cutover.

## Exact source boundary

- Repository: `champban/dashboard`
- Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Base tree: `c25d9b044e7a46963c3fc5661bd53b08f48d83d6`
- Temporary branch: `ops/l1b-post-import-backup-refresh`
- Target project: `qjaywadzvwvcspdsjxth`
- GitHub Environment: `production-backup`
- Exact Environment execution ref: the current Draft PR merge ref
  `refs/pull/<CURRENT_PR_NUMBER>/merge`; confirm the actual PR number immediately
  before Environment approval.
- Existing protected secrets are consumed without value change:
  - `SUPABASE_DB_URL`
  - `BACKUP_PASSPHRASE`
- Artifact retention: one day

The branch must remain exactly one commit ahead of the frozen base and add only:

1. `.github/workflows/l1b-one-time-encrypted-backup.yml`
2. `docs/L1B_POST_IMPORT_BACKUP.md`
3. `ops/l1b-one-time-backup.sh`

The backup script is the exact previously successful reviewed blob
`932a6669eb2e84f66197e946cc4402bf51a4ae28`.

## Owner-authorized execution gate

The Environment-gated backup job contains the exact literal condition:

```text
'OWNER_APPROVED_B1_REFRESH' == 'OWNER_APPROVED_B1_REFRESH'
```

This condition authorizes only the already approved single replacement logical
read/export. It does not bypass `production-backup`: the job must first pass
source-safety and then wait for the protected Environment reviewer. The reviewer
must not approve the deployment until both exact-head source-safety and the
normal repository `verify` suite pass for the same HEAD.

The workflow also requires `github.run_attempt == 1`, so a consumed event must
not be rerun as a second backup attempt.

## Authorized replacement operation

One qualifying workflow execution may:

1. use the existing protected Production connection URI for logical read/export
   only;
2. dump non-empty `roles.sql`, `schema.sql`, and `data.sql` using pinned Supabase
   CLI `2.111.0`;
3. hash those SQL files;
4. encrypt the archive with GPG AES256 using the existing protected passphrase;
5. immediately decrypt and hash-verify it on the ephemeral runner;
6. verify all plaintext SQL, temporary archives and the passphrase are absent
   before artifact upload;
7. upload only the encrypted archive and non-sensitive digest manifest; and
8. retain the GitHub artifact for one day.

No raw SQL, connection URI, passphrase or planner row content may be logged or
uploaded.

## Qualification requirements before Environment approval

The current Draft PR must prove on one exact HEAD:

- exact repository, branch, base, one-commit history and three-file diff;
- exact previously successful backup script blob;
- immutable GitHub Action SHAs;
- exact two-secret reference set;
- literal one-shot job and in-job run-attempt guards;
- shell syntax and static output/secret safety;
- no `pull_request_target`, `workflow_dispatch`, push trigger, bulk `db push`,
  remote helper download or plaintext artifact upload path;
- exact Owner-authorized B-1 gate; and
- exact-head normal repository `verify` PASS.

If any qualification fails or GitHub reports startup/infrastructure failure, the
Environment reviewer must not approve the backup job. The affected event is not
considered a successful backup and no recovery evidence may be claimed.

## Evidence required after success

Record without exposing secret or planner content:

- workflow run and job IDs;
- exact branch head/tree and base;
- Environment ref and reviewer result;
- artifact ID/name, creation and expiry times;
- artifact ZIP byte size and SHA-256;
- encrypted archive byte size and SHA-256;
- `roles.sql`, `schema.sql`, and `data.sql` byte sizes and SHA-256 values;
- source SHA, Supabase CLI version and plaintext-cleanup result; and
- Owner custody status for a downloaded encrypted copy.

PR #97 must then be rebuilt as an exact one-commit B-2 packet pinned only to the
new artifact, followed by exact-head source-safety, normal CI, fresh independent
review, unchanged read-only Production baseline and exactly one network-isolated
B-2 restore attempt under the Owner's standing conditional approval.

## Hard stops

- **DO NOT APPROVE THE ENVIRONMENT JOB UNTIL EXACT-HEAD SOURCE-SAFETY AND VERIFY PASS.**
- **DO NOT RERUN A CONSUMED SUCCESSFUL BACKUP EVENT.**
- **DO NOT MERGE THE TEMPORARY B-1 PR.**
- No Production SQL/DDL/DML or migration-history write.
- No Storage bucket/policy creation.
- No import/re-import, client activation or reconciliation.
- No Auth/RLS/secret-value/provider change.
- No Drive demotion, Production cleanup/resource deletion or L1C cutover.
- Stop on branch/base/head/file-set/project drift, failed CI, missing protected
  input, plaintext exposure risk or any operation beyond logical read/export.
