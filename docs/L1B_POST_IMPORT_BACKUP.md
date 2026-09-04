# L1B Fresh Post-Import Backup Gate B-1

Status: **TEMPORARY EVIDENCE BRANCH / CONDITIONALLY OWNER-APPROVED ONE-TIME RUN / DO NOT MERGE**

Decision date: `2026-08-25` (`Asia/Bangkok`)

This temporary packet creates the fresh encrypted logical backup required after
the accepted first L0b import and before any L1A/L1B Production apply decision.
It is authorized under `Q-L1B-002` only within the exact boundaries below.

## Exact source boundary

- Repository: `champban/dashboard`
- Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Base tree: `c25d9b044e7a46963c3fc5661bd53b08f48d83d6`
- Temporary branch: `ops/l1b-post-import-backup`
- Target project: `qjaywadzvwvcspdsjxth`
- GitHub Environment: `production-backup`
- Existing protected secrets consumed without value change:
  - `SUPABASE_DB_URL`
  - `BACKUP_PASSPHRASE`
- Artifact retention: one day
- Exact final head/tree/run/job/artifact metadata: recorded in the Draft PR after
  GitHub creates them.

The branch must remain exactly one commit ahead of the frozen base and add only:

1. `.github/workflows/l1b-one-time-encrypted-backup.yml`
2. `ops/l1b-one-time-backup.sh`
3. `docs/L1B_POST_IMPORT_BACKUP.md`

## Authorized operation

One qualifying workflow execution may:

1. use the existing protected Production connection URI to perform logical
   read/export only;
2. dump non-empty `roles.sql`, `schema.sql`, and `data.sql` with pinned Supabase
   CLI `2.111.0`;
3. hash the three SQL files;
4. package and encrypt them with GPG AES256 using the existing protected
   passphrase;
5. immediately decrypt and verify byte/hash integrity on the ephemeral runner;
6. upload only the encrypted archive and non-sensitive digest manifest; and
7. retain the artifact for one day.

Plain SQL, connection URI, passphrase and private row content must remain on the
ephemeral GitHub-hosted runner and be deleted by the cleanup trap.

## Source-safety gates

Before the Environment-gated backup job may run, the workflow must prove:

- same repository and exact temporary branch;
- exact base SHA and one-commit history;
- exact three-file change set;
- immutable GitHub Action SHAs;
- exact two-secret reference set;
- shell syntax and static secret/output safety;
- no `pull_request_target`, `workflow_dispatch`, push trigger, bulk `db push`,
  remote helper download or plaintext artifact upload path.

Normal repository `verify` must also pass at the exact PR head.

## Evidence required after success

Record without exposing secret or planner content:

- workflow run and job IDs;
- exact branch head/tree and base;
- artifact ID/name, creation and expiry times;
- artifact ZIP byte size and SHA-256;
- encrypted archive byte size and SHA-256;
- `roles.sql`, `schema.sql`, and `data.sql` byte sizes and SHA-256 values;
- source SHA and Supabase CLI version;
- Environment gate result and cleanup result;
- Owner custody status of a downloaded recoverable encrypted copy.

This B-1 evidence qualifies B-2 only when the exact artifact remains available
and no substitution occurs.

## Hard stops

Do not run or continue if:

- branch, base, head, file set or project differs;
- either protected secret is absent or invalid;
- the connection URI does not identify `qjaywadzvwvcspdsjxth`;
- the exact-head source-safety or normal CI gate fails;
- any plaintext/secret would be printed or uploaded;
- the operation would write Production, apply SQL, alter migration history,
  change Auth/RLS/secrets/providers or create Storage resources;
- another backup attempt has already completed under this authorization.

Do not merge this branch. This packet does not authorize Production migration,
Storage creation/policies, import/re-import, client activation, reconciliation,
Drive demotion, cleanup/resource deletion or L1C cutover.
