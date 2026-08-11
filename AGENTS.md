# Repository Working Agreement

Read `PROJECT_CONTEXT.md` before changing this repository. For cross-project
policy, also read `champban/Engineering1` → branch `Doc` →
`project_context.md` through the connected GitHub tool.

When Codex and Claude Code may share this Codespace/working tree, or the user
asks for handover/takeover, also read `champban/Engineering1` → branch `Doc` →
`skills/ai-continuity-handover/SKILL.md`.

## AI continuity: Codex + Claude Code

- `PROJECT_CONTEXT.md`, repository files and Git are the durable source of truth.
- `.ai/state.json` is local ephemeral task/coordination state only and must stay
  ignored by Git. Never put secrets, tokens, credentials, customer data, or
  sensitive production payloads in it.
- Only one active writer may edit this working tree at a time.
- If `.ai/state.json` says Claude is `ACTIVE`, Codex remains read-only unless the
  user explicitly asks Codex to `take over` (or equivalent).
- On `handover to Claude`, Codex must stop new implementation work, inspect the
  actual branch/HEAD/status/diff/test evidence, checkpoint the task into
  `.ai/state.json`, set `READY_FOR_TAKEOVER`, and stop editing.
- On explicit Codex `take over`, Codex must read the mandatory project context,
  inspect `.ai/state.json`, independently verify branch/HEAD/status/diff/tests,
  reconcile any stale state, set Codex `ACTIVE`, then continue from verified next
  actions.
- If Claude stops unexpectedly because of token/session limits, an explicit user
  takeover authorizes Codex to assume the writer role after repository
  verification. A separate prose handover is not required.
- Do not implement automatic token monitoring or automatic failover.
- Codex may perform read-only independent review while Claude is active when the
  user asks for review.

## Source and release rules

- `index.html` is generated. Edit `src/App.jsx` or `build/*`, then run
  `npm run verify`.
- `mobile/index.html` is a separate vanilla-JS application. Shared behavior must
  be implemented and tested in both Full and Mobile.
- Work on a feature branch and open a pull request. Never merge or deploy to
  production without explicit owner approval.
- Run `npm test`, `npm run verify`, and `npm run scan-secrets` before handoff.
- Do not commit credentials. Browser code may contain the Supabase publishable
  key and Google OAuth client ID; LINE channel secrets and Supabase secret keys
  belong only in Supabase Function Secrets.

## LINE integration invariants

- Google Drive reconciliation succeeds before a LINE snapshot is published.
- A LINE snapshot is secondary and read-only. Its failure must not fail or roll
  back a successful Drive save.
- Confirmed LINE mutations use a separate, single-use queue. Full/Mobile apply
  them only as part of a successful Google Drive save; never mutate snapshots
  directly or mark a queued change applied before Drive succeeds.
- Snapshot v2/v3 always limits core task fields to task type, title, status,
  due date, category, and priority. It may additionally include sanitised Subtask
  text/done state and HTTPS attachment-link metadata only when the owner enables
  the corresponding opt-in. Snapshot v3 may include events limited to type,
  title, start date, end date, and category. Never include raw IDs, notes,
  descriptions, locations, local files, base64 data, HTTP URLs, URLs with
  embedded username/password,
  configuration, tokens, or API keys.
- Verify `x-line-signature` against the untouched raw request body before parsing
  JSON.
- Keep `line-todo-webhook` deterministic; do not add AI or MCP runtime without a
  new design decision, cost review, and owner approval.
- Keep the one-time link code hashed, single-use, and valid for 10 minutes.
- Use `Asia/Bangkok` for date-based commands.

## Backup responsibility

- Supabase is the main server-state store for Auth, LINE mappings, and snapshots.
- GitHub is the main backup/audit trail for code and database migrations.
- Google Drive is the supplementary user-controlled planner recovery copy.
- Take a Supabase backup before applying a production migration.
