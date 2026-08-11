# Claude Working Agreement

Follow `AGENTS.md` and `PROJECT_CONTEXT.md` as the operating contract.
For cross-project policy, read `champban/Engineering1` branch `Doc` →
`project_context.md`.

When Claude Code and Codex may share this Codespace/working tree, or the user
asks for handover/takeover, also read `champban/Engineering1` branch `Doc` →
`skills/ai-continuity-handover/SKILL.md`.

## AI continuity: Claude Code + Codex

- `PROJECT_CONTEXT.md`, repository files and Git are durable truth.
- `.ai/state.json` is local ephemeral coordination state only; it must stay
  ignored by Git and must not contain secrets, tokens, credentials, customer
  data, or sensitive production payloads.
- Only one active writer may edit this working tree at a time.
- If `.ai/state.json` says Codex is `ACTIVE`, Claude remains read-only unless the
  user explicitly asks Claude to `take over` (or equivalent).
- On `handover to Codex`, Claude stops new implementation work, verifies the
  actual branch/HEAD/status/diff/test evidence, checkpoints the task into
  `.ai/state.json`, sets `READY_FOR_TAKEOVER`, and stops editing.
- On explicit Claude `take over`, Claude first reads the mandatory project
  context, reads `.ai/state.json`, independently verifies branch/HEAD/status/
  diff/tests, reconciles stale state, sets Claude `ACTIVE`, then continues from
  verified next actions.
- If Codex stops unexpectedly because of token/session limits, an explicit user
  takeover authorizes Claude to assume the writer role after repository
  verification. A separate prose handover is not required.
- Do not implement automatic token monitoring or automatic failover.
- Claude may perform read-only independent review while Codex is active when the
  user asks for review.

## Project-specific starting points

For the LINE Official integration, start with:

- `line-sync.js` — privacy-minimised browser snapshot and one-time link code
- `supabase/migrations/20260728155436_line_official_readonly_bot.sql`
- `supabase/migrations/20260730031026_line_task_details_snapshot_v2.sql`
- `supabase/functions/line-todo-webhook/`
- `docs/LINE_OFFICIAL_SETUP.md`
- `docs/SECURITY_6D_AUDIT.md`
- `docs/PROJECT_PERFORMANCE_KPI.md`

`CLAUDE_CODE_HANDOVER.md` is a task-specific historical production-release
handover. Use it only when the current task actually matches that release, and
always prefer newer repository state and `PROJECT_CONTEXT.md`.

Do not put provider secrets in code, do not edit generated `index.html`, and do
not merge/deploy without explicit approval.

Snapshot v2 Subtasks and HTTPS attachment links are separate owner opt-ins.
Never send local files, base64 data, raw IDs, notes, descriptions, HTTP links,
URLs with embedded username/password, or secrets.
