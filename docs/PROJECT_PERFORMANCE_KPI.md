# Project Performance KPI — LINE Official Integration

Status: backend, bilingual command menu, task-details v2, Search button,
confirmed-mutation UX, and L0a webhook reliability v22 are active in
Production and owner-accepted on LINE.

M0 activation confirmed: `2026-07-28T23:13:14+07:00` (`Asia/Bangkok`)

Task-details increment M0: `2026-07-30T10:10:26+07:00`

Search-button increment M0: `2026-07-30T11:49:49+07:00`

Search-button increment M4: `2026-07-30T12:00:03+07:00`
(`0.17` measured wall-clock hours from M0)

L0b source-only M0: `2026-08-20T10:27:38+07:00` (`Asia/Bangkok`)

L0b classification: `SEQUENTIAL_ONLY` — one database migration and one
Auth/RLS policy set; Codex is the sole active writer and Claude is reserved for
Final Exact-HEAD Review #2.

## Outcome

The owner can link one LINE user to the signed-in My Todo Planner account and
tap or type simple English or Thai questions against the latest
privacy-minimised task snapshot, without running an AI model.

## KPI and release gates

| KPI | Target | RC evidence | Production evidence |
|---|---:|---|---|
| Invalid LINE signatures rejected | 100% | Automated valid/tampered HMAC tests pass | Valid webhook verification passed; direct unsigned POST rejected with 401 on function v3 |
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
- M4 quality gate: complete; failed production versions `0`, CI retries `0`,
  rework cycles `0`, known-error recurrences `0`, production escapes `0`,
  manual interventions `0`. One local dependency-install retry used an
  isolated writable npm cache. The first deploy request was rejected before
  version creation because `import_map_path` was omitted; the corrected request
  created version 3. Neither retry changed source or lockfile.
- M6 technical deployment: PR #43 merged as `ad3067f`;
  `line-todo-webhook` version 3 became ACTIVE at
  `2026-07-30T12:05:31+07:00`. Production source matches merged `main`; direct
  GET returned 405 and unsigned POST returned 401, both recorded against
  version 3. Owner LINE mobile/PC acceptance passed on `2026-07-30`.

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

## Handover increment — Rich Menu assets, context corrections, health check

- M0 activation confirmed: `2026-07-30T20:17:00+07:00` (`Asia/Bangkok`) —
  mandatory global context, five skills, asset registry and repository
  agreements read before inspection.
- M4 quality gate: `2026-07-30T20:52:00+07:00` — approximately `0.6` measured
  wall-clock hours from M0, covering inspection, plan, three documentation
  changes, one new CI workflow, and a targeted 6D audit.
- Comparability: **Not comparable** to the Shared Calendar baseline or to the
  Search-button increment. This is a documentation, asset and CI increment with
  no runtime change, not a feature release, and no milestone above M4 applies —
  there is nothing to deploy. Do not publish a speed-improvement percentage
  against it.

Measured quality KPIs for this increment:

| KPI | Value | Note |
|---|---|---|
| Failed deploys | `0` | Nothing deployed |
| CI retries | `0` | |
| Rework cycles | `1` | The health check's anonymous-read assertion was wrong on first write and was corrected before push — see below |
| Known-error recurrences | `0` | |
| Production escapes | `0` | |
| Manual interventions | `3` | Rich Menu PNG upload, live health-check verification, and the three outstanding owner acceptance sets — all blocked on owner-controlled access, none delegable |
| Prevention closure rate | `100%` | The one defect found carries a regression case in `--selftest` |

Rework cycle detail — the only defect in this increment:

- Symptom: `build/line-health-check.mjs` asserted that an anonymous read of
  `mtp_line_snapshots` returns `200` with an empty array.
- Root cause: the assertion was written from an assumption about RLS behavior
  rather than from the migration. `20260728155436_line_official_readonly_bot.sql`
  line 97 revokes all privileges on that table from `anon`, so the request is
  refused outright and never returns `200`.
- Detection: reading the migration to verify the assumption, before any push of
  the workflow that would have run it.
- Impact if shipped: the scheduled job fails on every run. A monitor that is
  always red is one everybody learns to ignore, which is how the control would
  have been silently lost.
- Fix: assert denial (`401` or `403`) instead, which is also the stronger
  property — a `200` means the revoke was undone.
- Prevention: `--selftest` case `grant regression (anon read succeeds) is
  caught`, run by `npm test`, fails if that assertion is ever loosened back.

Manual-step analysis, per the progress and manual-assist skill:

- All three manual interventions require owner-controlled access — a physical
  LINE client, the original image file, and unrestricted network egress. None
  can be automated away.
- The development sandbox's egress policy refuses `CONNECT` to `supabase.co`,
  so any live check against the production project has to run from a GitHub
  runner or the owner's machine. This is a recurring constraint for this
  repository, not a one-off: record it here rather than rediscovering it.
- `workflow_dispatch` cannot trigger a workflow that has not yet reached the
  default branch. Any future CI addition intended to be verified before merge
  needs a `pull_request` trigger, or verification has to be accepted as
  post-merge.

## M6 Production Verified — LINE integration, 2026-07-30

The LINE Official integration reaches `M6 Production Verified`. All five
outstanding items closed on the same day; the remaining Medium residual
(LINE-5) is accepted with compensating controls, not deferred work.

| Evidence | Result |
|---|---|
| GitHub SHA = deployed SHA | `main` `e7ea377`; Edge Function v3 bundle SHA-256 `d4ed04ca…51f6` matches the recorded value, deployed source matches merged `main` |
| Migration version verified | `20260728155436` and `20260730041511` applied; repo/database filename drift recorded rather than silently renamed |
| Auth/RLS critical flow | Anonymous read of `mtp_line_snapshots` denied with 401, asserted every day by `line-health` |
| Smoke test | `line-health` run 1 — `PASS (3/3)` |
| Owner acceptance | Rich Menu 7 steps, Search button 5 steps, live-data 7 steps — all passed on LINE mobile and LINE for PC |
| Rollback ready | Edge Function v2; `git revert` for the application; additive v1/v2 constraint deliberately kept |
| 6D audit | `PASS`, one accepted Medium residual |

Acceptance detail worth keeping, because it is the part that carries real
privacy risk rather than the part that is merely visible: an HTTP link, a local
file attachment and base64 data were each confirmed **absent** from LINE output,
and disabling each sharing opt-in separately removed only that opt-in's data
from the next reply. Subtask and attachment sharing are independent, and the
acceptance proved they are independent in production rather than only in tests.

Milestone timing for this increment:

- `M0` 2026-07-30 20:17 → `M4` 20:52 → `M6` 2026-07-30, approximately `1.5`
  measured wall-clock hours end to end.
- Comparability: **Not comparable** to the Shared Calendar `M4` baseline. That
  baseline covers building an application; this covers verifying, documenting
  and monitoring one that already existed. Do not publish a speed-improvement
  percentage against it.

Final KPI counts for the increment:

| KPI | Value |
|---|---|
| Failed deploys | `0` |
| CI retries | `0` |
| Rework cycles | `2` — the anonymous-read assertion, and the `*/2` cadence |
| Known-error recurrences | `0` |
| Production escapes | `1` — the `*/2` cadence reached `main` in PR #45 and was corrected by PR #46 before any scheduled run fired |
| Manual interventions | `3` — PNG upload, live verification, owner acceptance; none delegable |
| Prevention closure rate | `100%` |

The production escape is recorded rather than argued away. PR #45 merged one
commit short of the cadence fix, so `main` briefly carried a keepalive that
could allow the pause it exists to prevent. No scheduled run fired in that
window and PR #46 closed it the same hour, but it reached the production branch,
and the prevention is stated where the next person will read it: **verify what
landed on `main` after a merge; do not infer it from the branch that was
pushed.**


## L0a webhook reliability release — M6 Production Verified

Technical Production verification completed on `2026-08-19` (`Asia/Bangkok`).
The exact M0 start time was not captured when the Owner first approved L0a on
2026-08-17, so wall-clock hours from M0 to M6 are **N/A** rather than
reconstructed. The last live-smoke Function POST recorded at approximately
`2026-08-19T13:06:01+07:00` is the measured technical M6 evidence timestamp.

Comparability: **Not directly comparable** to the Shared Calendar application
baseline. L0a is a reliability migration/runtime release on an existing system,
not a new application or equivalent feature build. No speed-improvement
percentage is published.

### Release evidence

| Gate | Result | Evidence |
|---|---|---|
| Final review | PASS | Claude independent exact-head review at `73ad8b6a9815411364afeae34d9ce52418bd6967` |
| Code quality | PASS | CI #104 and #116; build, tests, secret scan, generated-artifact parity, ES2019 guard |
| SQL/RLS/concurrency | PASS | Real PostgreSQL lifecycle/RLS and genuine two-session claim test |
| Backup | CONDITIONAL PASS | Encrypted logical export/decrypt/hash verified; one Personal-PC copy accepted by Owner |
| Migration | PASS | `20260818154406_line_webhook_event_reliability` applied; RLS/grants/RPCs verified; 17 existing mutations unchanged |
| Runtime | PASS | `line-todo-webhook` v22 ACTIVE; bundle `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa` |
| Public security smoke | PASS | Direct/Netlify invalid signature 401; direct GET 405; gateway configured GET 200 |
| Owner live smoke | PASS | `menu`, Edit -> Cancel, `search week 49 2026` |
| Ledger/data | PASS | 5 processed, 0 failed/processing, max attempt 1; no mutation count/source-event change |
| Rollback | READY | Captured v21 source/version/bundle; additive migration compatible |

### L0a KPI record

| KPI | Value | Basis / caveat |
|---|---:|---|
| Wall-clock hours to M6 | `N/A` | M0 exact time was not captured; do not reconstruct |
| Failed Production deploys | `0` | Migration and v22 deployment each succeeded on the approved attempt |
| Confirmed CI retries | `>=1` | One documented retry corrected the throwaway `service_role`/BYPASSRLS harness mismatch; full historical count was not captured at M0 |
| Rework cycles | `1` | Initial implementation reopened once after independent review and L0A-01…08 remediation |
| Known-error recurrence | `0` | No duplicate/lost processing recurrence during controlled Production smoke |
| Production escapes from L0a | `0` | No L0a defect found after M6 verification |
| Manual intervention batches | `7` | LINE redelivery check; two-secret entry; backup approval; backup storage; migration approval; deploy approval; live smoke |
| Prevention closure rate | `100%` | Root cause, persistent controls, regression tests, rollback, Production verification and recurrence record completed |

### Manual-step analysis

Owner-controlled steps were limited to provider settings, secret entry, local
backup custody, gated approvals and physical LINE-client acceptance. The encrypted
GitHub Actions backup removed the earlier Codespace dependency. Future releases
should reuse the Owner-gated backup workflow pattern, but its temporary branch,
Environment secrets and artifact cleanup remain separate approvals.

### Remaining follow-ups, not L0a blockers

- Schedule/retention decision for `mtp_cleanup_line_events`.
- Dependency advisory review by `2026-09-17`; no forced upgrade.
- L0b normalized Supabase data foundation requires a new approval and KPI record.
- L1 direct Todo mutation and Drive export-only cutover remain unstarted.

## L0b normalized data foundation — source-only record

| Milestone | Timestamp (`Asia/Bangkok`) | Evidence / status |
|---|---|---|
| M0 activation | `2026-08-20T10:27:38+07:00` | Owner approved source-only Codex implementation after Review #1 closure; no provider action |
| M1 branch/bootstrap | `2026-08-20T10:27:49+07:00` | `feature/l0b-data-foundation` created from exact `488d4a75`; `SEQUENTIAL_ONLY`; one active writer |
| M2 source complete | `2026-08-20T11:00:35+07:00` | Nine-table migration, manual Full/Mobile client, shared JS/SQL vectors, CI/tests/docs complete locally |
| M3 local verification | `2026-08-20T11:00:35+07:00` | Build/harness `LEN 25129 / NODES 141`, audit `0 blockers`, package/CSP `6/6`, full regression chain, secret scan, static SQL gate, and `git diff --check` passed; PostgreSQL 17 execution remains the Draft-PR CI gate because local `psql` is unavailable |
| M4 Draft PR / CI | Pending | One Draft PR; standard verify + L0a SQL + L0b PostgreSQL 17 jobs |
| M5 Final Exact-HEAD 6D | Pending | Claude Review #2 only; no repeated full review unless a blocking critical area changes |
| M6 Production verified | Not authorized | Requires separate backup, migration, backfill/deployment approvals and smoke |

Comparability: this database/data-architecture increment is not comparable to
the earlier LINE feature increments. No speed, quality, or manual-step
improvement is claimed before M3/M4 evidence exists. Review count target is
exactly the approved two critical points: Review #1 is closed; Review #2 is the
only remaining full independent review.
