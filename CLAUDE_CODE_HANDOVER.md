# Claude Code handover: confirmed LINE mutation production release

## Assignment

Take over the production-release procedure for the confirmed LINE Add/Edit/Delete
mutation feature merged through PR #51. The owner could not complete the Supabase
backup using the previous Codex instructions and is specifically asking Claude Code
to create and verify the backup, then continue the release safely.

Do not treat this handover as permission to migrate or deploy. Obtain the owner's
explicit approval at the production gate described below.

## Repository and current state

- Repository: `champban/dashboard`
- Pull request: <https://github.com/champban/dashboard/pull/51>
- PR #51 is merged.
- Local handover baseline observed on 2026-08-04:
  `b235a32 Merge pull request #51 from champban/codex/troubleshoot-search-results-in-line-krwxqs`
- Supabase project ref: `qjaywadzvwvcspdsjxth`
- The owner reports that `supabase login` succeeded and
  `supabase projects list` completed.
- The production migration, function deployment, and application deployment are
  not confirmed as complete.
- Production temporal search is already deployed and owner-verified. It must not
  regress.

Before acting, read `AGENTS.md`, all of `PROJECT_CONTEXT.md`,
`docs/LINE_OFFICIAL_SETUP.md`, `docs/SECURITY_6D_AUDIT.md`, and the applicable
Supabase migration/function source. Follow any newer repository state over this
handover.

## First task: create and verify the Supabase backup

The backup must cover production server state, including Auth/LINE mappings and
the mutation/snapshot tables. A schema-only dump is not a sufficient production
backup.

1. Confirm that the linked project is exactly `qjaywadzvwvcspdsjxth`.
2. Determine which supported backup mechanism is available for the project's
   current Supabase plan:
   - Prefer a fresh, successful Supabase Dashboard/platform backup when the plan
     provides on-demand or restorable backups.
   - If a platform backup cannot be created, use an official Supabase logical
     backup procedure that includes roles, schema, and data. Verify the exact CLI
     syntax against the installed CLI version before running it.
3. Never print, echo, commit, or paste database passwords, personal access tokens,
   service-role keys, LINE secrets, connection strings with credentials, or backup
   contents into chat/log output.
4. Store any downloaded/logical backup outside the Git working tree with restrictive
   permissions. Do not add it to Git. Tell the owner where it is stored and how it
   should be transferred to durable encrypted storage; a Codespace is disposable.
5. Verify the backup is non-empty, readable by the corresponding official restore
   tooling, and contains schema plus data. Record only safe evidence: timestamp,
   backup type, size, checksum, verification command/result, and storage location.
6. Do not perform a restore against production merely to test the backup.
7. If account permissions, plan limitations, missing database credentials, or lack
   of browser access prevent a valid backup, stop and state the exact blocker. Give
   the owner one direct link and one action at a time. Never claim the backup passed
   when it did not.

Useful project page:
<https://supabase.com/dashboard/project/qjaywadzvwvcspdsjxth/database/backups>

Also ask the owner to confirm a supplementary Google Drive planner JSON recovery
copy. This does not replace the Supabase backup.

## Mandatory pre-deployment verification

Work from the latest merged `origin/main`, record its SHA, and run:

```bash
git checkout main
git pull --ff-only origin main
npm ci
npm test
npm run verify
npm run scan-secrets
git diff --check
git status --short
```

The final working tree must be clean. Do not edit generated `index.html` directly.
If a real fix is needed, use a feature branch and PR; do not patch production from
an unreviewed Codespace state.

## Production approval gate

After merged-main verification and backup verification, inspect without applying:

```bash
supabase link --project-ref qjaywadzvwvcspdsjxth
supabase db push --dry-run
```

The intended new migration is
`20260802090000_line_confirmed_mutations.sql`. Account for the historical migration
timestamp drift documented in `PROJECT_CONTEXT.md`; stop on unexpected, duplicate,
unrelated, or destructive migration output.

Summarise the exact dry-run plan and wait until the owner explicitly writes:

```text
APPROVE PRODUCTION RELEASE
```

Neither this handover nor the merged PR supplies that approval.

## Deployment sequence after explicit approval

Only after a verified backup, clean checks, a reviewed dry run, and the exact owner
approval above:

1. Apply the reviewed migration with `supabase db push`.
2. Verify `public.mtp_line_mutations`, its RLS, grants, constraints, and the absence
   of unintended snapshot changes without exposing production row contents.
3. Deploy with `supabase functions deploy line-todo-webhook`.
4. Verify the LINE webhook (valid Verify request HTTP 200; unsigned/altered request
   HTTP 401) and run the repository health check.
5. Determine the repository's actual GitHub Pages workflow and deploy the verified
   merged `main` build, including both Full and Mobile. Do not guess or deploy a
   stale PR branch.
6. Guide the owner through real Full, Mobile, and LINE acceptance one test at a
   time.

Do not deploy the Edge Function before its required migration. Do not apply any
production migration or deploy any component if the backup or a required check is
unverified.

## Required mutation behavior

- `add Buy insurance, 01-12-2026` defaults to Personal / General / Medium /
  Pending.
- `add work Prepare report, 05-12-2026` and
  `add event Annual meeting, 10-12-2026` select explicit alternatives.
- Edit/Delete use exact-title matching and reject missing or duplicate titles.
- Every Add/Edit/Delete requires Confirm or Cancel.
- Confirmation postbacks contain only mutation ID and decision.
- Confirmed changes use the separate, single-use Supabase queue.
- Snapshots remain secondary and read-only; never mutate a snapshot directly.
- Full/Mobile apply a confirmed operation only as part of a successful Google Drive
  save, and never mark it applied before Drive succeeds.
- Mobile resolves cloud-ahead state first and must not persist mutation-enriched
  local/browser state before `driveUpdate` succeeds.
- A failed Drive upload leaves local state unchanged and the mutation pending.
- Drive reconciliation precedes snapshot publication. Snapshot failure must not
  roll back a successful Drive save.

## Temporal-search and privacy regression gates

- Keep snapshot schema v3 and the already verified
  `search buy December 2026` behavior.
- `search week36 2026` covers Tasks and Events from ISO week 36 through week 45
  inclusive.
- Month/year/week searches remain deterministic.
- Multi-window events publish one occurrence per real window.
- Select recent candidates using source `createdAt` before caps, but never publish
  `createdAt`.
- Event output is limited to type, sanitised title, start date, end date, and
  category.
- Never expose raw IDs, notes, descriptions, locations, local files, base64 data,
  HTTP or credential-bearing URLs, configuration, tokens, or API keys.

## Completion definition and report

Do not call the release complete until backup evidence, merged-main checks,
migration, function deployment, web deployment, and owner acceptance have all
passed. Report:

- merged-main SHA;
- backup type, timestamp, size, checksum, verification result, and safe storage
  location;
- Google Drive recovery-copy confirmation;
- every required test/check result;
- dry-run migrations;
- applied migration/version;
- Edge Function version and webhook/health results;
- deployed web commit/workflow URL;
- Full/Mobile mutation acceptance, exact-match rejection, Confirm/Cancel, Drive
  failure/retry/single-use behavior, and snapshot privacy results;
- temporal-search regression results;
- rollback point and every remaining risk or manual requirement.

After production acceptance, update the still-pending release record in
`PROJECT_CONTEXT.md` through a separate reviewed documentation PR. Do not merge it
without owner approval.
