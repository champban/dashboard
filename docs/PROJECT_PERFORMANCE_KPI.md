# Project Performance KPI — LINE Official Read-only Bot

Status: release candidate, not deployed

M0 activation confirmed: `2026-07-28T23:13:14+07:00` (`Asia/Bangkok`)

## Outcome

The owner can link one LINE user to the signed-in My Todo Planner account and ask
simple Thai questions against the latest privacy-minimised task snapshot, without
running an AI model.

## KPI and release gates

| KPI | Target | RC evidence | Production evidence |
|---|---:|---|---|
| Invalid LINE signatures rejected | 100% | Automated valid/tampered HMAC tests pass | Pending live LINE verification |
| Link-code lifetime | 10 minutes | Browser and SQL contract implemented | Pending live expiry test |
| Link code reuse | 0 successful reuses | Atomic SQL claim + `used_at` row lock | Pending live replay test |
| Sensitive fields in snapshot | 0 | Snapshot leakage regression test passes | Pending owner data spot-check |
| Supported deterministic commands | 7 | Parser/filter unit tests pass | Pending LINE acceptance test |
| Reply size | `< 5,000` characters | Capped at 4,800 and 12 tasks | Pending largest live reply |
| Snapshot task cap | 500 | Browser snapshot test passes | Monitor truncation flag |
| Snapshot follows successful Drive sync | 100% of accepted Drive paths | Full/Mobile static contracts + existing Drive regression suite | Pending Full/Mobile round-trip |
| Drive save blocked by LINE failure | 0 | LINE helper contains its own failure | Pending induced Supabase outage |
| Webhook p95 latency | `< 2.5 s` | Deterministic DB lookup; no AI call | Measure after deployment |
| Successful reply rate | `>= 99%` | Not measurable pre-deploy | Supabase/LINE operational logs |
| Cost at `<= 10` questions/day | Approximately `0` incremental platform cost | No AI; reply API only; expected inside free quotas | Review first billing month |

## Command acceptance set

1. `งานวันนี้`
2. `งานสัปดาห์นี้`
3. `งานเกินกำหนด`
4. `งานไม่มีวันกำหนด`
5. `ค้นหา <คำ>`
6. `สถานะ`
7. `ช่วยเหลือ`

Date calculations use `Asia/Bangkok`; the week is Monday through Sunday.

## Measurement checkpoints

- M0 — activation/design confirmed: recorded above.
- M1 — migration and function deployed: record Supabase migration version and
  function version.
- M2 — LINE webhook verified: record valid-signature and invalid-signature
  outcomes without logging message bodies or user IDs.
- M3 — Full and Mobile owner acceptance: record each command, link replay, stale
  snapshot, and induced LINE/Supabase error result.
- M4 — 30-day review: reply success rate, p95 latency, snapshot truncation count,
  and actual cost.
