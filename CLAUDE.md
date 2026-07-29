# Claude Handoff

Follow `AGENTS.md` and `PROJECT_CONTEXT.md` as the operating contract.

For the LINE Official integration, start with:

- `line-sync.js` — privacy-minimised browser snapshot and one-time link code
- `supabase/migrations/20260728155436_line_official_readonly_bot.sql`
- `supabase/functions/line-todo-webhook/`
- `docs/LINE_OFFICIAL_SETUP.md`
- `docs/SECURITY_6D_AUDIT.md`
- `docs/PROJECT_PERFORMANCE_KPI.md`

Do not put provider secrets in code, do not edit generated `index.html`, and do
not merge/deploy without explicit approval.
