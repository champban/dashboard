# Claude Code handover: confirmed LINE mutation production release

## Assignment

Take over the production-release procedure for the confirmed LINE Add/Edit/Delete
mutation feature merged through PR #51. The owner could not complete the Supabase
backup using the previous Codex instructions and is specifically asking Claude Code
to create and verify the backup, then continue the release safely.

Do not treat this handover as permission to migrate or deploy. Obtain the owner's
explicit approval at the production gate described below.

## Owner step 0: open the Codespace and update `main`

`main` is the repository's reviewed release branch. "Update `main`" means opening
the existing cloud development computer, selecting that branch, and downloading the
newest merged commits from GitHub. It does **not** deploy the application or change
Supabase.

Complete these small steps one at a time:

### Step 0A: open the existing Codespace

1. Open <https://github.com/codespaces> in a browser and sign in to GitHub if asked.
2. Find the Codespace whose repository is `champban/dashboard`.
3. Click the Codespace name or **Open in Browser**. Do not click **Delete**.
4. Wait for the VS Code-style page to finish loading. The file list should include
   `AGENTS.md`, `PROJECT_CONTEXT.md`, and `CLAUDE_CODE_HANDOVER.md`.

If no Codespace exists, open
<https://codespaces.new/champban/dashboard?ref=main&quickstart=1>, leave the branch as
`main`, click **Create codespace**, and wait for it to load.

### Step 0B: open a terminal

1. In the top menu choose **Terminal** → **New Terminal**.
2. A panel opens at the bottom. Click inside it.
3. Confirm the prompt contains `/workspaces/dashboard`. If it shows a different
   directory, run `cd /workspaces/dashboard`.

### Step 0C: check that no unfinished work would be lost

Run:

```bash
git status --short --branch
```

- It is safe to continue when the first line names a branch and there are no later
  lines beginning with `M`, `A`, `D`, `R`, `UU`, or `??`.
- If file-change lines appear, stop and give their output to Claude Code. Do not
  delete, stash, reset, or overwrite them unless Claude first explains what they are.

### Step 0D: select `main`

Run:

```bash
git checkout main
```

Expected output is either `Already on 'main'` or `Switched to branch 'main'`. If Git
refuses because local changes would be overwritten, stop; do not force it.

### Step 0E: download the newest merged commits

Run:

```bash
git pull --ff-only origin main
```

`Already up to date.` is success. A list of updated files is also success. A conflict,
authentication error, or `Not possible to fast-forward` is not success; stop and give
the complete error to Claude Code.

### Step 0F: confirm the handover is present

Run:

```bash
git log -1 --oneline
test -f CLAUDE_CODE_HANDOVER.md && echo "Handover found"
```

Success requires `Handover found`. Record the commit shown by `git log`. Do not
continue from an older branch that lacks the handover.

### Step 0G: start Claude Code

Run `claude` in the same terminal. If that command is unavailable, open the Claude
Code extension from the Codespace sidebar. Give Claude this first instruction:

```text
Read AGENTS.md, PROJECT_CONTEXT.md, docs/LINE_OFFICIAL_SETUP.md,
docs/SECURITY_6D_AUDIT.md, and CLAUDE_CODE_HANDOVER.md completely. Execute the
handover one step at a time. Start by checking the current branch and working tree,
then perform Step 1A. Do not migrate or deploy without the required approval.
```

Claude must verify the commands rather than assuming the owner completed them
correctly. If the owner becomes stuck, ask for only the output of the current command
and explain only the next single action.

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
backup. Complete the following substeps in order and report the result of each one
before continuing.

### Step 1A: establish identity without changing production

1. Run `supabase projects list` and confirm that the authenticated account can see
   project ref `qjaywadzvwvcspdsjxth`.
2. Run `supabase link --project-ref qjaywadzvwvcspdsjxth` only if the repository is
   not already linked. Linking selects a project; it is not permission to migrate.
3. Show the owner only the project name/ref and CLI success or failure. Do not show
   account tokens, database passwords, connection strings, or secret values.
4. Stop if the ref differs, the project is unavailable, or the account is not an
   owner/authorised project member.

Success for Step 1A means Claude can state: `Project identity verified:
qjaywadzvwvcspdsjxth`. It does not mean a backup exists.

### Step 1B: inspect the platform backup option

1. Give the owner this direct link and, if browser automation is available, open it:
   <https://supabase.com/dashboard/project/qjaywadzvwvcspdsjxth/database/backups>.
2. Inspect the page without clicking Restore, deleting a backup, changing retention,
   or changing the project plan.
3. Report which of these is actually visible:
   - a recent successful restorable platform backup;
   - a supported control for creating an on-demand backup;
   - backups unavailable on the current plan;
   - access denied or the page cannot be inspected.
4. Prefer a new on-demand platform backup when the existing plan supports it. Before
   clicking a control that creates a backup, tell the owner exactly what will happen;
   creation is allowed, but restoration, deletion, billing changes, and plan upgrades
   are not.
5. Wait until creation finishes. Record its displayed completion time/status and
   retention information. A pending, failed, or merely scheduled backup is not a
   verified backup.

If Claude cannot operate the Supabase page, ask the owner for only one action at a
time, starting with: "Open the backup link and tell me which of the four options in
Step 1B.3 you see." Do not send the owner into an open-ended dashboard search.

### Step 1C: use a complete logical backup only when needed

Use this fallback only when a fresh/restorable platform backup cannot be verified.

1. Check the installed CLI version with `supabase --version`.
2. Consult the current official Supabase backup documentation and `supabase db dump
   --help` before constructing commands. Do not rely on remembered flags.
3. Explain the exact proposed commands and which outputs cover roles, schema, and
   data. Ask for any required database password through a hidden interactive prompt;
   never place it in a command argument, environment dump, repository file, or chat.
4. Save every output outside `/workspaces/dashboard`, in a newly created directory
   whose permissions are restricted to the current user. Never use the Git tree as
   temporary backup storage.
5. If the supported procedure cannot capture all required roles, schema, and data,
   stop. Do not substitute a schema-only dump and do not continue to migration.

Claude must run the logical-backup commands itself when its terminal access permits
it. The owner should not be asked to copy a long sequence of database commands that
Claude can safely execute.

### Step 1D: verify the backup without restoring production

1. Confirm every expected backup artifact exists, is a regular file, and is non-empty.
2. Use the matching official inspection/restore tooling in list or validation mode to
   prove the artifact is readable. Do not restore it into production.
3. Verify that the backup set represents roles, schema, and data. Do not print table
   rows or backup contents while doing so.
4. Calculate a SHA-256 checksum and record the UTC verification time and byte size.
5. For a platform backup, use the Dashboard's successful/restorable status as the
   platform verification evidence and record its displayed timestamp/retention.
6. Report safe evidence only: method, UTC timestamp, status, size when available,
   checksum for downloaded artifacts, validation result, and temporary location.

### Step 1E: move the backup out of the disposable Codespace

1. Explain that `/tmp` and Codespace storage are not durable backup destinations.
2. Ask the owner to transfer downloaded artifacts to durable encrypted storage using
   the Codespaces file download UI or another approved secure transfer method.
3. Wait for the owner to confirm the durable copy before deleting any temporary file.
4. Keep backup artifacts out of Git, commits, pull requests, Actions artifacts, and
   public/shared links.
5. A platform-managed backup needs no Codespace download if its successful status and
   retention are verified, but record that it is platform-managed.

### Step 1F: record the gate result

Declare `SUPABASE BACKUP VERIFIED` only when Steps 1A through 1E establish a complete,
restorable backup and durable retention. Otherwise declare `SUPABASE BACKUP BLOCKED`
and state the exact missing requirement.

Never print, echo, commit, or paste database passwords, personal access tokens,
service-role keys, LINE secrets, credential-bearing connection strings, or backup
contents into chat/log output. If account permissions, plan limitations, missing
database credentials, or lack of browser access block a valid backup, give the owner
one direct link and one action at a time. Never claim the backup passed when it did
not.

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
