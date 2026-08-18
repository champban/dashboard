# L0a one-time encrypted Supabase backup

Status: **TEMPORARY BRANCH ONLY / DO NOT MERGE**

This branch provides a one-time logical export for the L0a Production migration
gate. It does not apply a migration, deploy an Edge Function, change Netlify or
LINE configuration, or mutate Production data.

## Fixed scope

- Repository: `champban/dashboard`
- Branch: `ops/l0a-one-time-production-backup`
- Approved Supabase project ref: `qjaywadzvwvcspdsjxth`
- GitHub Environment: `production-backup`
- Required Environment secrets:
  - `SUPABASE_DB_URL`
  - `BACKUP_PASSPHRASE`
- Artifact retention: 1 day
- Output committed to Git: none
- Output uploaded: one GPG-encrypted archive and one non-sensitive hash manifest

The workflow runs only for a same-repository pull request from the exact branch
above into `main`.

## Owner setup in GitHub

1. Open `champban/dashboard`.
2. Go to **Settings → Environments → New environment**.
3. Create `production-backup`.
4. Under **Deployment branches and tags**, allow only:
   `ops/l0a-one-time-production-backup`.
5. Add Environment secret `SUPABASE_DB_URL` using the Supabase **Session
   pooler** PostgreSQL URI for project `qjaywadzvwvcspdsjxth`.
6. Add Environment secret `BACKUP_PASSPHRASE` with at least 24 characters,
   generated uniquely and stored in a password manager.
7. Never put either value in chat, a GitHub issue/PR comment, source code, logs,
   or screenshots.

After the two secrets exist, open the Draft PR or ask the project orchestrator to
open it. The pull-request event runs the workflow.

## What the workflow verifies

1. Exact same-repository branch and PR target.
2. Database URI identifies the approved project ref.
3. Pinned Supabase CLI `2.111.0`.
4. Non-empty `roles.sql`, `schema.sql`, and `data.sql`.
5. SHA-256 hashes for all three SQL files.
6. GPG symmetric encryption using AES256.
7. Immediate decryption, byte comparison, extraction, and
   `sha256sum -c` verification.
8. Upload of encrypted material only, retained for one day.

Plain SQL, the connection URI and the passphrase remain on the ephemeral
GitHub-hosted runner and are removed before the job exits.

## Download and second copy

After the workflow passes:

1. Open the successful workflow run.
2. Download artifact `dashboard-supabase-backup-<UTC stamp>`.
3. Store the encrypted `.tar.gz.gpg` file and its manifest in two private
   locations.
4. Recommended labels:
   - Primary: private local or encrypted external drive
   - Secondary: private Google Drive archive
5. Delete the GitHub artifact after both copies are verified, or allow the
   one-day retention to expire.

## Local decryption when recovery is required

Run on a trusted machine that has GnuPG:

```bash
gpg --output dashboard-supabase-backup.tar.gz \
  --decrypt dashboard-supabase-backup-<UTC stamp>.tar.gz.gpg

mkdir dashboard-supabase-backup
tar -C dashboard-supabase-backup \
  -xzf dashboard-supabase-backup.tar.gz

cd dashboard-supabase-backup
sha256sum -c SHA256SUMS.txt
```

Enter the passphrase only in the hidden GPG prompt.

## Stop conditions

Do not open or rerun the PR workflow if:

- either secret is missing;
- the URI points to another Supabase project;
- the passphrase is lost;
- the branch or base differs from the fixed scope;
- any unreviewed file is added to the branch.

Do not merge this branch. Production migration and Edge Function deployment
remain separately Owner-controlled.
