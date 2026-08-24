# Project Performance KPI — LINE Official Integration

Status: backend, bilingual command menu, task-details v2, Search button,
confirmed-mutation UX, and L0a webhook reliability v22 are active in
Production and owner-accepted on LINE. Packet A is applied and catalog-verified
with functional smoke Owner-waived / not executed. L0b source and schema-only
Production apply/catalog gates are complete. Gate 4 manual-control source was
merged and published from exact PR #86 head. The separately approved M6b first
manual import and bounded aggregate acceptance are complete; repeat import and
L1 remain separately gated, and Browser + Google Drive remain authoritative.

M0 activation confirmed: `2026-07-28T23:13:14+07:00` (`Asia/Bangkok`)

Task-details increment M0: `2026-07-30T10:10:26+07:00`

Search-button increment M0: `2026-07-30T11:49:49+07:00`

Search-button increment M4: `2026-07-30T12:00:03+07:00`
(`0.17` measured wall-clock hours from M0)

L0b source-only M0: `2026-08-20T10:27:38+07:00` (`Asia/Bangkok`)

Packet A M0: `2026-08-20T15:37:14+07:00` (`Asia/Bangkok`)

L0b/Packet A classification: `SEQUENTIAL_ONLY` — database migration and
Auth/RLS/ACL policy sets use one active writer. The two L0b reviews and Packet A
Production catalog gate and the L0b schema-only gate are closed. The separately
approved first L0b projection/import and bounded aggregate acceptance are also
complete; any repeat import, cleanup, source-of-truth cutover or L1 action
remains separately Owner-gated.

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


## Packet A ACL hardening — Production catalog closure

Technical Production apply and catalog verification completed on `2026-08-22`
(`Asia/Bangkok`). Packet A M0 was not captured as a comparable timed milestone,
so end-to-end elapsed hours and speed-improvement percentages are **N/A**, not
reconstructed.

| KPI / gate | Result |
|---|---|
| Exact targeted migration apply | PASS — provider version `20260822162710` |
| Migration apply attempts | `1` successful attempt |
| Unexpected migration records | `0`; L0b remained unapplied |
| Target ACL/default/RPC matrix | PASS |
| RLS/policy drift | `0`; five tables enabled, ten policies unchanged |
| Target row-count delta | `0`; counts stayed `1/5/1/17/1` |
| Unrelated `aicc_*` v2 canary drift | `0`; `848e24b1452c3c4e5ff6b7b9ce308044` |
| Post-apply LINE v2 fingerprint stability | PASS twice; `f939987598538c846c82d85942a37037` |
| L0b tables created | `0/9` |
| Rollback / forward fix required | `0` |
| Functional smoke coverage | `0/3` — Owner-waived / NOT EXECUTED |
| Decision | CONDITIONAL PASS with accepted `PACKET-A-R1` assurance residual |

Do not publish a 100% functional-verification claim. Management closure counts
the explicit Owner waiver as a closed decision gate, while technical evidence
continues to show the three smoke checks were not run.

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

## L0b normalized data foundation — Production record

| Milestone | Timestamp (`Asia/Bangkok`) | Evidence / status |
|---|---|---|
| M0 activation | `2026-08-20T10:27:38+07:00` | Owner approved source-only Codex implementation after Review #1 closure; no provider action |
| M1 branch/bootstrap | `2026-08-20T10:27:49+07:00` | `feature/l0b-data-foundation` created from exact `488d4a75`; `SEQUENTIAL_ONLY`; one active writer |
| M2 source complete | `2026-08-20T11:00:35+07:00` | Nine-table migration, manual Full/Mobile client, shared JS/SQL vectors, CI/tests/docs complete locally |
| M3 local verification | `2026-08-20T11:00:35+07:00` | Build/harness `LEN 25129 / NODES 141`, audit `0 blockers`, package/CSP `6/6`, full regression chain, secret scan, static SQL gate, and `git diff --check` passed; PostgreSQL 17 execution remains the Draft-PR CI gate because local `psql` is unavailable |
| M4 Draft PR / CI re-verified | `2026-08-20` | CI #124 passed at remediation commit `14d67b2d`; exact-head CI #125 passed all three jobs at `e3a52c53`; no migration was applied outside throwaway PostgreSQL |
| M5 source merge | `2026-08-20` | Owner approved exact head `e3a52c53` only; PR #76 merged as `67fe86ca`. GitHub Pages then published the browser asset through existing deployment coupling; no L0b backend/data was activated |
| M6a schema-only Production verified | `2026-08-23` | Exact targeted apply from `main@1ece6091`; provider version `20260823055451_l0b_data_foundation`; tables/RLS/policies `9/9`, RPCs `6/6`, zero rows, canaries unchanged; importer disabled |
| Gate 4 source candidate | `2026-08-23T14:00:10+07:00` | Draft PR #86 exact source head `db3c8cde`, tree `9cb2bad4`; one commit/two files; local full gate and exact-head GitHub Actions `verify` #150 run `32623877211` passed 4/4 jobs; targeted 6D returned `CONDITIONAL PASS` for a separate merge/publication decision; no provider write |
| Gate 4 merge/publication | `2026-08-23T19:29:26+07:00` | Owner approved PR #86 exact head `4830b6cf`, tree `34f3859b`, against exact base `167b84cf`; merged as `main@8fc88a8a` with the same tree. Exact-head CI #151, post-merge CI #152 and Pages deployment #117 passed; no import/provider write |
| M6b first manual import / acceptance | `2026-08-23T21:29:13+07:00` | Exactly one Full manual import from `main@fe654751` succeeded: chunks `4/4`, final chunks `1`, rejects `0`, hashes/counts reconciled, staging `0`; catalog and LINE/AICC canaries remained intact |

Comparability: this database/data-architecture increment is not comparable to
the earlier LINE feature increments. No speed, quality, or manual-step
improvement is claimed. Review #1, PR #76 source, schema-only apply, and catalog
verification and M6b first-import acceptance are closed. Browser + Google Drive
remain authoritative; repeat import, source-of-truth cutover and L1 remain
separately gated.

### L0b Gate 4 and M6b acceptance record

| KPI | Current value | Evidence / gate |
|---|---:|---|
| Approved PR head | PASS | PR #86 exact head `4830b6cf82aa1ff65306b775e2382d84e96af21e`, tree `34f3859b997a530d80c4387bca0212388b731dc7`; exact base `main@167b84cfdfeedd19c0396b2f520e9806244eec3b`; runtime source commit `db3c8cde` changes two files and final commit records targeted closure only |
| Exact-head/post-merge CI | PASS | Exact PR-head `verify` #151 run `32624687421` and push `verify` #152 run `32639538682` completed successfully on all four jobs; CI retries caused by source/config/dependency failure: `0` |
| Targeted 6D | PASS through M6b bounded acceptance | No new Critical/High finding; publication completed without tree drift and the separately approved first import reconciled successfully |
| Provider effect | `1` successful import batch | Production remained `ACTIVE_HEALTHY`; migration tail stayed `20260823055451_l0b_data_foundation`; exactly one batch succeeded and normalized aggregate counts matched server evidence |
| Manual intervention | `1` Owner import action | Owner authenticated and initiated the Full manual import; no credential or raw planner content entered chat/evidence |
| Production publication | PASS | PR #86 merged as `main@8fc88a8a94017eadb58b98adecbb87e22d65496c`, tree `34f3859b997a530d80c4387bca0212388b731dc7`; Pages run `32639537950` completed build/report/deploy successfully and points to https://champban.github.io/dashboard/ |
| First import / acceptance | PASS | Batch `07021dad-c25d-40dc-a722-b405c8b2a5c7`; `4/4` chunks, `0` rejects, traversal/hash/count reconciliation PASS, staging `0`, no retry |

### L0b quality/rework record

| KPI | Value | Evidence / caveat |
|---|---:|---|
| Rework cycles | `1` | Final Review #2 reopened F1-F5 once; remediation stayed within the approved source-only scope |
| CI retries before Review #2 | `1` | Initial run #122 exposed the invalid schema-qualified lease clamp; corrected run #123 passed |
| Remediation CI retries | `0` | Run #124 passed all three jobs on the first remediation attempt |
| Failed deploys | `0` | No manual deployment command was attempted |
| Release-control escapes | `1` | Existing GitHub Pages coupling published the merged L0b browser asset although approval excluded deployment; backend RPCs/tables were absent, so no import/data change occurred |
| Manual intervention batches | `2` | Owner transferred the Claude review result between panels and later initiated the separately approved first Full manual import; no secret entered chat |

Comparability remains `Not comparable`. This is a database architecture and
security-test increment on an existing application, so no speed-improvement
percentage is published.

### Gate Hardening Packet A — source and backup/restore gate record

| KPI | Current value | Evidence / gate |
|---|---:|---|
| Source gate | Complete | PR #77 merged exact reviewed head `a9c99719` as `main@9a5a95f5`; merge did not authorize database apply/deploy |
| UI prevention | Merged | Full/Mobile control render and handlers require a bridge whose default is `enabled=false` |
| ACL prevention | Applied / catalog-verified | Provider version `20260822162710`; exact least-privilege ACL/default matrix, RLS/policies, row counts and unrelated `aicc_*` canary passed; functional smoke Owner-waived / not executed |
| PostgreSQL 17 coverage | PASS | Exact-head CI #127 passed all four jobs, including ACL/default-privilege, L0b, and L0a SQL gates |
| Provider residual | Accepted; Gate A closed | Current Supabase documentation records `supabase_admin` defaults as intentional provider-managed state that does not bypass RLS by itself; Packet A does not alter that role |
| Review count | Closed | Owner approved the exact reviewed PR #77 head; no repeated full L0b review while SQL/permission contract is unchanged |
| B-1 backup gate | PASS; refreshed after apply | Original run `32149051510` has Owner custody. Post-apply run `32587955307`, job `97067096268`, artifact `9479566992` passed; Owner confirmed refreshed custody before expiry `2026-08-23T17:33:07Z` and before the L0b schema apply |
| B-2 isolated restore | PASS; refreshed after apply | Draft PR #83 exact remote head `48aaa796`; run `32618003121`; source job `97141728425` and restore job `97141748031` passed exact Packet A ACL reconciliation |
| B-2 refreshed final-run duration | `2m 36s` measured | Exact corrected-head run `32618003121`; normal verify run `32616039132` and source-safety run `32616039104` also passed |
| B-2 refreshed failed attempts | `1` | Previous corrected-series attempt failed closed at post-restore ACL reconciliation; the exact corrected-head attempt passed. Historical PR #79 attempt counts remain recorded in its Draft PR |
| Output artifacts from B-2 | `0` | Successful run produced no artifact; private plaintext and logs were cleanup-scoped to the runner |
| Production changes | `2` targeted migrations + `1` manual import | Packet A ACL-only and L0b schema-only applies each succeeded once; M6b added exactly one successful normalized projection batch. No deployment, provider change, cleanup, source-of-truth cutover, or L1 action |

### L0b Production and M6b acceptance record

| KPI | Current value | Evidence / gate |
|---|---:|---|
| Exact apply | PASS | Production `qjaywadzvwvcspdsjxth`; `main@1ece6091`; blob `59aad11b`; SHA-256 `75d07941...`; provider version `20260823055451_l0b_data_foundation`; targeted connector call exactly once |
| Catalog verification | PASS | Tables/owners/RLS/policies `9/9`; RPCs `6/6`; triggers `5/5`; indexes `8/8`; unvalidated constraints, owner-orphans, and ACL differences all `0` |
| Data movement | `1` bounded projection batch | Active aggregates: tasks `105`, subtasks `17`, events `6`, event windows `15`, attachments `0`; tombstoned/anomaly counts `0`; no raw planner content captured in evidence |
| Existing-system canaries | PASS / unchanged | Frozen LINE and unrelated `aicc_*` aggregate catalog, ACL, policy, function, and row-count fingerprints matched before/after |
| Import controls | Published, manual only | Full/Mobile use `UI_ENABLED=true` behind signed-in render/fail-closed handlers; no timer/Drive/LINE path invokes import. First Full manual acceptance passed; another import remains separately gated |
| Security advisor residual | `6` expected WARNs | The reviewed authenticated `SECURITY DEFINER` importer RPCs intentionally remain executable by `authenticated`; exact ACLs, `auth.uid()` binding, empty `search_path`, RLS, and fencing verified |

Packet A is `Not comparable` to feature delivery. It is management-closed as
`CONDITIONAL PASS`: source, backup/restore, targeted 6D, ACL-only apply, and
catalog/RLS gates passed; the three functional smoke checks remain explicitly
Owner-waived / not executed. L0b M6b first-import acceptance is now closed under
`docs/L0B_PRODUCTION_READINESS.md`; L1 remains unstarted and separately gated.
Total B-1/B-2 wall-clock time and manual-
intervention count were not captured consistently and remain `N/A` rather than
reconstructed.
