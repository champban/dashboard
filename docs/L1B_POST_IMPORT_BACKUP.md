# L1B Fresh Post-Import Backup Gate B-1 — Replacement 2

Status: **SOURCE PACKET ONLY / EXACT OWNER APPROVAL REQUIRED / ENVIRONMENT-GATED / DO NOT MERGE**

Decision baseline: `2026-09-02` (`Asia/Bangkok`)

## Why a second replacement is required

The previously successful fresh B-1 artifact `9805484584` was created by run
`33409097769` and expired at `2026-09-02T14:37:10Z`.

The exact Owner-gated B-2 event later ran as workflow `33639876203`, job
`100280026584`. The restore command started at `2026-09-02T14:57:37Z`, after
that expiry. The checker stopped fail closed with `artifact metadata mismatch:
expired` before artifact download, decryption, disposable database startup or
logical restore.

The unconditional cleanup step emitted
`L1B_B2_UNCONDITIONAL_CLEANUP_COMPLETE`. No plaintext backup, passphrase,
artifact ZIP, extracted directory, disposable container, database volume or
B-2 work directory remained. The sole B-2 recovery PASS marker was not emitted.
Production was not connected to or changed by that failed B-2 event.

The B-2 event is consumed and must not be rerun. A fresh encrypted Production
logical-read backup and a newly pinned B-2 event are therefore required.

## Authority boundary

This commit prepares source and verification only. It does **not** authorize the
new Production logical read/export.

The new B-1 operation remains blocked until all of the following are true for one
exact HEAD and workflow run:

1. source-safety and normal repository CI pass;
2. independent review finds no blocking issue;
3. P' Boy explicitly authorizes the exact HEAD/run operation;
4. one exact GitHub issue comment from login `champban` binds that HEAD and run;
5. P' Boy approves the corresponding `production-backup` Environment job.

No prior approval marker, prior Environment approval or the word `Next` is a
substitute for the new exact Production gate.

## Exact source boundary

- Repository: `champban/dashboard`
- Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Base tree: `c25d9b044e7a46963c3fc5661bd53b08f48d83d6`
- Temporary branch: `ops/l1b-post-import-backup-refresh`
- Draft PR: `#100`
- Target Supabase project: `qjaywadzvwvcspdsjxth`
- Protected Environment: `production-backup`
- Workflow blob: `1894f266d9e2b73d4c689ae32cc1fdee962d0154`
- Frozen backup script blob: `932a6669eb2e84f66197e946cc4402bf51a4ae28`
- Prior successful B-1 run baseline: `33409097769`
- Artifact retention after a successful execution: one day

The branch must remain exactly one commit ahead of the frozen base and add only:

1. `.github/workflows/l1b-one-time-encrypted-backup.yml`
2. `docs/L1B_POST_IMPORT_BACKUP.md`
3. `ops/l1b-one-time-backup.sh`

The backup script bytes are unchanged from the previously reviewed and
successful B-1 operation.

## One-event and exact-owner controls

The new workflow triggers only on the branch `synchronize` event that installs
this exact three-file packet. It requires `github.run_attempt == 1`; rerunning a
consumed event cannot execute the backup job.

Run `33409097769` is the frozen event baseline. The Environment-gated job refuses
to execute if any workflow event other than the current exact run exists after
that baseline.

The required Owner marker body is exactly:

```text
OWNER_APPROVED_B1_REFRESH
head_sha=<EXACT_CURRENT_HEAD>
run_id=<EXACT_CURRENT_B1_RUN_ID>
operation=production-logical-read-export-once
```

The marker must be posted exactly once by GitHub login `champban`. It is checked
inside the protected job after Environment approval and before protected
connection inputs are used.

The literal source gate remains:

```text
'OWNER_APPROVED_B1_REFRESH' == 'OWNER_APPROVED_B1_REFRESH'
```

That literal records the operation class only. It does not itself constitute
Owner approval and does not bypass the exact comment, run-attempt, event-baseline
or Protected Environment controls.

## Permitted operation after exact approval

One qualifying execution may only:

1. use the existing protected Production PostgreSQL URI for logical read/export;
2. validate that the URI identifies project `qjaywadzvwvcspdsjxth` and contains
   no query or fragment capable of overriding the host/database;
3. dump non-empty `roles.sql`, `schema.sql` and `data.sql` with pinned Supabase
   CLI `2.111.0`;
4. hash the SQL files and archive;
5. encrypt the archive using GPG AES256 and the existing protected passphrase;
6. immediately decrypt and hash-verify it on the ephemeral runner;
7. remove and verify absence of plaintext SQL, temporary archives and
   passphrase before upload; and
8. upload only the encrypted archive plus a non-sensitive digest manifest with
   one-day retention.

No raw SQL, planner row content, connection URI, password or passphrase may be
logged, committed or uploaded.

## Source qualification requirements

Before the Environment job may be approved, verify:

- exact repository, branch, base, one-commit history and three-file diff;
- exact frozen backup-script blob;
- immutable GitHub Action SHAs;
- exact protected-secret reference set (`SUPABASE_DB_URL` and
  `BACKUP_PASSPHRASE` only);
- one-shot job and in-job run-attempt guards;
- exact Owner HEAD/run marker contract;
- no second post-baseline workflow event;
- structural direct/Supavisor URI validation with every query parameter and
  fragment rejected;
- shell syntax, secret/output safety and normal repository CI;
- no `pull_request_target`, `workflow_dispatch`, push trigger, bulk
  `supabase db push`, remote helper download or plaintext artifact path; and
- independent exact-head review with no unresolved blocking finding.

## Required evidence after B-1 success

Record only aggregate and non-sensitive evidence:

- exact HEAD/tree/base and three file blobs;
- workflow run and protected job IDs;
- Environment ref/reviewer result;
- artifact ID/name, creation/expiry, ZIP size and SHA-256;
- encrypted archive size and SHA-256;
- roles/schema/data sizes and SHA-256 values;
- source SHA, CLI version and cleanup result; and
- encrypted-copy custody status without disclosing the passphrase.

After that, PR #97 must be rebuilt as another exact one-commit/12-file B-2 packet
pinned only to the new artifact. It requires fresh normal CI, source-safety,
independent review, bounded read-only Production invariance verification, a new
one-shot label event and a separate Owner Environment approval. No old B-2 event
may be rerun.

## Hard stops

- **DO NOT APPROVE THE B-1 ENVIRONMENT JOB UNTIL EXACT-HEAD CI AND REVIEW PASS.**
- **DO NOT POST THE OWNER MARKER WITHOUT A NEW EXPLICIT OWNER AUTHORIZATION.**
- **DO NOT RERUN RUN `33409097769` OR B-2 RUN `33639876203`.**
- **DO NOT MERGE PR #100 OR PR #97.**
- No Production SQL/DDL/DML, migration-history write or generic database push.
- No Storage bucket/policy, Auth/RLS/secret/provider change.
- No import/re-import, reconciliation, client activation or source-of-truth
  change.
- No Drive demotion, Production cleanup/deletion or L1C cutover.
- Stop on branch/base/head/file-set/project drift, failed CI/review, missing
  protected input, plaintext exposure risk or any operation beyond the exact
  logical read/export.
