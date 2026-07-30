# Project Performance KPI — LINE Official Read-only Bot

Status: backend, bilingual command menu, and task-details v2 active in
production; Search-button increment is a verified release candidate

M0 activation confirmed: `2026-07-28T23:13:14+07:00` (`Asia/Bangkok`)

Task-details increment M0: `2026-07-30T10:10:26+07:00`

Search-button increment M0: `2026-07-30T11:49:49+07:00`

Search-button increment M4: `2026-07-30T12:00:03+07:00`
(`0.17` measured wall-clock hours from M0)

## Outcome

The owner can link one LINE user to the signed-in My Todo Planner account and
tap or type simple English or Thai questions against the latest
privacy-minimised task snapshot, without running an AI model.

## KPI and release gates

| KPI | Target | RC evidence | Production evidence |
|---|---:|---|---|
| Invalid LINE signatures rejected | 100% | Automated valid/tampered HMAC tests pass | Valid webhook verification passed; live tampered request pending |
| Link-code lifetime | 10 minutes | Browser and SQL contract implemented | Pending live expiry test |
| Link code reuse | 0 successful reuses | Atomic SQL claim + `used_at` row lock | Pending live replay test |
| Sensitive fields in snapshot | 0 | Snapshot leakage regression test passes | Pending owner data spot-check |
| LINE sharing default | Subtasks/link attachments OFF | Full/Mobile defaults and UI contract tests | Pending owner device check |
| Subtask card detail | Up to 5 rows + done/total + remaining count | Flex task-card tests pass | Pending owner LINE check |
| Attachment action safety | HTTPS only; max 3/task; no local/base64 | URL, credential, local-file, and URI-action tests pass | Pending owner LINE click test |
| Flex carousel payload | `<= 50 KiB`; `<= 12` bubbles | Oversized fixture truncates safely | Pending largest live result |
| Supported deterministic command groups | 10 | Parser/filter unit tests pass | Pending LINE acceptance test |
| Menu action validity | 9/9 per language | Eight fixed message actions plus one strict Search postback; Quick Reply count is below 13 | Pending Search-button LINE PC/iOS/Android acceptance |
| Search-button keyboard flow | Prefill `search ` / `ค้นหา ` on supported mobile clients | Exact postback, language, `openKeyboard`, `fillInText`, bare-command, and fallback tests pass | Pending owner device acceptance |
| Next-4-weeks boundary | Today through day 28 inclusive | Day 0/+28 included; overdue/+29/completed excluded | Pending live spot-check |
| Reply size | `< 5,000` characters | Capped at 4,800 and 12 tasks | Pending largest live reply |
| Snapshot task cap | 500 | Browser snapshot test passes | Monitor truncation flag |
| Snapshot follows successful Drive sync | 100% of accepted Drive paths | Full/Mobile static contracts + existing Drive regression suite | Activation exposed erased auth tokens before PostgREST; 3.77.1 regression passes, live round-trip pending |
| Drive save blocked by LINE failure | 0 | LINE helper contains its own failure | Pending induced Supabase outage |
| Webhook p95 latency | `< 2.5 s` | Deterministic DB lookup; no AI call | Measure after deployment |
| Successful reply rate | `>= 99%` | Not measurable pre-deploy | Supabase/LINE operational logs |
| Cost at `<= 10` questions/day | Approximately `0` incremental platform cost | No AI; reply API only; expected inside free quotas | Review first billing month |

## Command acceptance set

1. Link successfully; an English Flex menu must appear automatically.
2. Tap `Today`, `Next 4 weeks`, `Overdue`, `High priority`, `No due date`,
   `Search`, and `Status`. Search must prefill `search ` on supported mobile
   clients; type a keyword and send it.
3. Tap `ภาษาไทย`; the Thai menu must appear.
4. Tap `วันนี้`, `4 สัปดาห์`, `เกินกำหนด`, `สำคัญสูง`, `ไม่มีวันกำหนด`,
   `ค้นหา`, and `สถานะ`. Search must prefill `ค้นหา ` on supported mobile
   clients.
5. Type legacy commands `งานสัปดาห์นี้` and `ค้นหา <คำ>`.
6. Type `menu` and `เมนู`; each must return the corresponding language.
7. Confirm day +28 is included in `Next 4 weeks`, while overdue, day +29, and
   completed tasks are excluded.
8. Enable Subtask sharing, Save to Cloud, and confirm a task card shows
   done/total, at most five rows, and `+N` for the remainder.
9. Enable HTTPS attachment-link sharing, Save to Cloud, and confirm link,
   picture-link, and video-link buttons open.
10. Confirm HTTP, embedded-credential, local-file, and base64 attachments never
    appear.
11. Disable each sharing option, save again, and confirm the corresponding data
    disappears.

Date calculations use `Asia/Bangkok`; the week is Monday through Sunday.

## Measurement checkpoints

- M0 — activation/design confirmed: recorded above.
- M1 — **complete, owner-confirmed 2026-07-29**: migration
  `20260728155436_line_official_readonly_bot.sql`, Function Secrets, and
  `line-todo-webhook` deployed. Exact function platform version remains to be
  recorded from the Supabase dashboard.
- M2 — **partially complete 2026-07-29**: LINE console valid webhook
  verification returned Success. Invalid-signature live outcome remains
  pending; do not log message bodies or user IDs.
- M3 — Full and Mobile owner acceptance: record each command/menu action, link
  replay, Subtask/attachment opt-in and opt-out, stale snapshot, and induced
  LINE/Supabase error result.
- M4 — 30-day review: reply success rate, p95 latency, snapshot truncation count,
  and actual cost.

## Search-button increment

- Scope: `line-todo-webhook` source and regression tests only.
- Data/Auth impact: none; no migration, snapshot rewrite, or new secret.
- Release-candidate evidence: targeted LINE tests, full `npm test`,
  `npm run verify` with 0 blockers/CSP 6 of 6, and secret scan.
- Preview equivalent: deterministic message/postback contract tests; there is
  no paid Supabase development branch for this function-only increment.
- Rollback: redeploy production Function version 2.
- M4 quality gate: complete; failed deploys `0`, CI retries `0`, rework cycles
  `0`, known-error recurrences `0`, production escapes `0`, manual
  interventions `0`. One local dependency-install retry was resolved with an
  isolated writable npm cache and did not change source or lockfile.
- M6 timestamp, GitHub commit, function version, and owner acceptance are
  recorded after the corresponding gate completes.

## Activation incident measurement

- Detection point: owner acceptance, on first link-code attempt.
- Scope: browser session only; zero rows in `mtp_line_snapshots`,
  `mtp_line_link_codes`, and `mtp_line_accounts`; no Drive/task mutation.
- Diagnostic signal: Auth user lookup HTTP 200 followed by no LINE PostgREST
  request.
- Root cause: generic storage redaction blanked Supabase `access_token` and
  `refresh_token`.
- Preventive measure: exact auth-key exemption plus Full/Mobile regression test.
- Manual recovery after deployment: one fresh sign-in, then repeat link-code and
  command acceptance.
