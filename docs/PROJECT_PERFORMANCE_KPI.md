# Project Performance KPI — LINE Official Read-only Bot

Status: backend activated; auth hotfix merged; bilingual command-menu release
candidate awaiting review/deploy approval

M0 activation confirmed: `2026-07-28T23:13:14+07:00` (`Asia/Bangkok`)

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
| Supported deterministic command groups | 10 | Parser/filter unit tests pass | Pending LINE acceptance test |
| Menu action validity | 8/8 per language | Flex and Quick Reply actions resolve to known commands; Quick Reply count is below 13 | Pending LINE PC/iOS/Android acceptance |
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
2. Tap `Today`, `Next 4 weeks`, `Overdue`, `High priority`, `No due date`, and
   `Status`.
3. Tap `ภาษาไทย`; the Thai menu must appear.
4. Tap `วันนี้`, `4 สัปดาห์`, `เกินกำหนด`, `สำคัญสูง`, `ไม่มีวันกำหนด`, and
   `สถานะ`.
5. Type legacy commands `งานสัปดาห์นี้` and `ค้นหา <คำ>`.
6. Type `menu` and `เมนู`; each must return the corresponding language.
7. Confirm day +28 is included in `Next 4 weeks`, while overdue, day +29, and
   completed tasks are excluded.

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
  replay, stale snapshot, and induced LINE/Supabase error result.
- M4 — 30-day review: reply success rate, p95 latency, snapshot truncation count,
  and actual cost.

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
