# Project Context

Shared context for whichever assistant (Claude / ChatGPT / Codex) picks up this
project. Update this file whenever architecture, decisions, or open bugs change.

## Current release

- Packet A Production apply base was
  `main@a061319cc6762fe58243f1e10a40e0737489aa2e`, tree
  `d18a9f466f1ee62021a9d41541cfd0fcbe14b73e`, after documentation-only PR #81
  recorded the preflight/6D gate. The last
  source-changing Packet A merge remains
  `9a5a95f5c9065214c0418def80a3086fdf79d323`. Its reviewed/Owner-approved
  source parent is
  `a9c99719e0e6abdf2a5f1fbedd282328f812577b`, tree
  `6479a43d73b04351f842e985a538afada694ce5e`; the other parent is the PR #76
  L0b source merge `67fe86cac29b3facecd08290a3000ba23bc8a684`.
- The exact L0a runtime source package is pinned to merge commit `3cafa19aa56f89c8d640acc717726d0043b3bd2c`,
  which contains independently reviewed implementation head `73ad8b6a9815411364afeae34d9ce52418bd6967`.
- Supabase project `Dashboard` (`qjaywadzvwvcspdsjxth`) records applied
  migrations `20260818154406_line_webhook_event_reliability` and
  `20260822162710_line_acl_default_privilege_hardening`, followed by the
  targeted L0b provider record `20260823055451_l0b_data_foundation`. Packet A
  maps to
  `supabase/migrations/20260820083714_line_acl_default_privilege_hardening.sql`
  at SHA-256
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`.
- Supabase Edge Function `line-todo-webhook` version **22** is `ACTIVE`, keeps
  `verify_jwt=false` by design, and has bundle SHA-256 `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`.
- Verified live path: `LINE @103rexjo -> Netlify line-app-public-line-webhook
  -> Supabase line-todo-webhook v22 -> LINE Reply API`.
- L0a Production acceptance passed on 2026-08-19: `menu`, Edit -> Cancel, and
  `search week 49 2026`; five ledger events were `processed`, zero were
  `failed`/`processing`, maximum attempt count was 1, and mutation rows stayed
  at 17 with no new `source_event_id` values.
- `APP_VERSION` in `src/App.jsx` remains the Full version source; it flows into
  the UI and filenames. `BUILD-MANIFEST.json` records the packaged Full/Mobile
  artifacts.
- Full application: `index.html` — **generated, do not edit directly**.
- Mobile application: `mobile/index.html` (separate hand-written vanilla-JS
  app, task-details candidate v3.75.2).
- Live planner: https://champban.github.io/dashboard/

### L0b normalized data foundation — schema active, importer disabled

- Owner approved D-1 `A + A1`, closed Review #1 without another Claude pass,
  then separately approved Codex source-only implementation.
- PR #76 merged exact source head
  `e3a52c5306e44856970eeb811dc52ecc9b8c3527` as
  `main@67fe86cac29b3facecd08290a3000ba23bc8a684`. Exact-head CI #125 passed the
  browser/build gate, L0a SQL/RLS/concurrency gate, and L0b PostgreSQL 17 gate.
- Source adds exactly nine normalized/import tables, six authenticated manual
  import RPCs, owner-composite foreign keys, SELECT-only RLS, explicit object
  revocation, stable task/subtask/event/attachment identity, lease fencing,
  exact-byte chunks, database reconciliation, tombstones, and manual controls in
  Full/Mobile. See `docs/L0B_DATA_FOUNDATION.md`.
- Migration `20260820032749_l0b_data_foundation.sql`, Git blob
  `59aad11b7b0d3761bc62d7673c7102f164e25f8a`, SHA-256
  `75d0794155cfcc4a3575868f92a16a5d670f6660787c30611e3955a98fe04e8c`,
  was applied once through targeted `apply_migration` from
  `main@1ece60919d0a4ecdeafcfa4c05b509fc9543492a`; provider version is
  `20260823055451_l0b_data_foundation`. Catalog verification passed. No
  backfill/import, Production planner-data copy, shadow/dual write, or
  source-of-truth cutover occurred.
- The existing GitHub Pages publication path exposed the PR #76 browser asset
  at the live planner without a separate manual deploy. At that time the import
  control was visible while its RPCs/tables did not exist; calls failed without
  changing data. PR #77 merged the Packet A prevention: Full/Mobile controls are
  fail-closed behind `enabled=false`, and handlers reject disabled calls. The
  later schema-only apply did not enable either control or import data.
- Browser + Google Drive remain the Todo source of truth. L0b does not start L1,
  does not make Supabase authoritative, and does not alter the LINE
  snapshot/mutation queue or Drive save paths.
- `RISK-L0A-ACL-1` is closed for the broad `postgres` defaults and existing
  `mtp_line_*` grant defect after exact targeted apply and catalog verification
  on `2026-08-22`. Provider-owned `supabase_admin` defaults remain the accepted
  provider-managed residual decided on `2026-08-21`. The Owner waived the three
  functional smoke checks; that accepted assurance residual is tracked as
  `PACKET-A-R1` and is not represented as PASS.
- Final Exact-HEAD 6D Review #2 returned `REQUIRED CHANGES` at
  `749af1b4a2deeb7853b4a8aa564503e3b9fd5539`. F1-F5 were remediated without
  widening scope: default-privilege simulation, Phase-B rollback evidence,
  lease/generation fencing, incomplete-stream cases, and two NULL-safe staging
  predicates. The source/test remediation commit is
  `14d67b2d2cea69bb16cf78e1d4d54732ca5d93c0`, tree
  `85ed997abb74a3a02ee14cdb7dbce24329500fab`; CI run #124 passed all three jobs.
- L0b Review #1 and the PR #76 source gate are closed. PR #77 merged exact head
  `a9c99719e0e6abdf2a5f1fbedd282328f812577b` after exact-head CI #127 passed
  all four jobs and the Owner approved that reviewed head only. Packet A source
  is merged and its exact ACL-only migration was applied and catalog-verified on
  `2026-08-22`; the exact L0b schema was separately applied and verified on
  `2026-08-23`. No additional full Claude review is planned while the reviewed
  SQL/permission contract is unchanged.
- Packet A Production readiness is controlled by
  `docs/PACKET_A_PRODUCTION_READINESS.md`. A generic `supabase db push` is
  prohibited: the repository timestamp and provider-assigned L0b ledger version
  differ, so bulk history inference can attempt an unsafe reapply. The
  read-only Production preflight, targeted pre-Production 6D decision, exact
  ACL-only apply, and post-apply catalog verification are complete at the
  base/hash recorded below. The subsequent exact L0b schema-only apply used a
  separate Owner gate. No L0b import/backfill, provider change, deployment,
  cleanup, or L1 was authorized by Packet A closure or by the schema-only gate.

### Packet A backup gates B-1/B-2 — completed and post-apply refresh verified

- B-1 created the pinned encrypted logical backup in run `32149051510`, attempt
  2, job `96681690187` — `SUCCESS`. Artifact `9452687931`,
  `dashboard-supabase-backup-20260821T153930Z`, was 30,451 bytes with ZIP
  SHA-256 `8e4ab3857f546e027df7b5ee7867e27070798fac3f77a292bbc8c92bef9812d8`;
  the encrypted archive SHA-256 was
  `1f74262d1b341ed919b0a8f8fe29ffb852946cd5d6ab1700f13e97ede97c91e4`.
  Owner confirmed custody of a downloaded copy. The GitHub artifact expiry is
  `2026-08-22T15:40:38Z`; a future restore after expiry requires a separately
  approved fresh B-1 run, never a substitute artifact.
- The original pre-apply B-2 completed at Draft PR #79 exact head
  `796b42a41b5e33f96f2ecc0752baf691c645d35c`, tree
  `d79ffb9b1eb3d5c6ed9380058aaedac1d9266b9f`. Run `32577304437`, source-safety
  job `97041400164`, and isolated restore job `97041418226` all passed. The
  final job log recorded `Packet A Backup Gate B-2 isolated restore: PASS` at
  `2026-08-22T14:01:43.5534694Z`.
- The successful target used the pinned PostgreSQL 17 image with network mode
  `none` and no published port. A reviewed Storage compatibility bridge applied
  upstream migrations 61-62 only to the disposable target before decryption,
  while retaining the target service ledger at 0-60. Atomic roles, schema and
  data restore plus exact table/RPC/RLS/policy/index/owner-orphan/count
  reconciliation passed.
- The original successful run produced no output artifact and used no Production
  connection. Post-run read-only Production table counts matched the pre-run
  snapshot. Its consumed approval label and Environment rule were removed.
  PR #79 remains Draft and must not be merged.
- After Packet A Production apply, a refreshed B-1 backup completed in run
  `32587955307`, job `97067096268`, artifact `9479566992`
  (`dashboard-supabase-backup-20260822T173203Z`): 30,428-byte ZIP SHA-256
  `d771caa09a77e3b5e6f558dcdda155410c21ebadc786ec6434b1336791ce4d8d`,
  encrypted archive SHA-256
  `b7f651d32b7ac31225839484736e0c8d926e65523120bcc94924c5520a166807`,
  expiring `2026-08-23T17:33:07Z`. Owner confirmed custody of the downloaded
  refreshed artifact before the exact L0b schema-only apply. Future recovery
  gates must still use qualifying evidence; no artifact substitution is allowed.
- Refreshed B-2 source is the one-commit/four-addition Draft PR #83 at remote
  head `48aaa7968ab76946095207d919a1db29cc3c7f05`, tree
  `c573d02e52aae7613724b874bd3dd7e7ba6736bf`, based on
  `main@eeac0ba1c542a17e3d9570f34dba936a20416c6e`. Exact-head verify run
  `32616039132` and source-safety run `32616039104` passed. The separately
  approved isolated restore run `32618003121` passed source job `97141728425`
  and restore job `97141748031` in 2m36s; all cleanup steps passed and output
  artifacts remained zero.
- The refreshed target retained the immutable PostgreSQL 17 image, network mode
  `none`, no published port, atomic restore, and exact aggregate/catalog/RLS/
  policy/index/ACL/owner-orphan/L0b reconciliation. Production remained
  `ACTIVE_HEALTHY`; at restore time its ledger ended at
  `20260822162710_line_acl_default_privilege_hardening`, with L0b absent. That
  was the verified pre-L0b-apply state.
- PR #83 remains open Draft and must not be merged. Its approval label and exact
  Environment rule `refs/pull/83/merge` remain present; they authorize no new
  event/run without a separate exact-head approval. Cleanup is separately gated.
- The original B-2 proves logical recoverability of the pre-apply approved
  backup. It does not assert
  Packet A hardened ACLs because the backup predates Packet A, and it does not
  claim migration-history identity because B-1 did not dump that ledger
  separately. The refreshed B-2 additionally reconciles the applied Packet A
  ACL contract from the post-apply backup without changing Production.

### Packet A read-only preflight and targeted 6D — historical apply gate complete

- Owner authorized read-only Production inspection, then separately authorized
  targeted 6D review/documentation. The exact base was
  `main@bc42edf5ecac980462d4e9def4cdd2d9078299dc`, tree
  `17f0b4940b3f04c7f0daea0865645d0fe395488a`; migration blob
  `3a6e760e183889b72c13df48bd72b10a9655c69f` and SHA-256
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`
  matched the reviewed source.
- Production `qjaywadzvwvcspdsjxth` was `ACTIVE_HEALTHY` on PostgreSQL
  17.6. Applied migrations stopped at
  `20260818154406_line_webhook_event_reliability`; Packet A and L0b were not
  applied. All required LINE tables/functions existed, five target tables had
  RLS enabled, total policies were ten, and row counts were
  accounts/events/link-codes/mutations/snapshots = `1/5/1/17/1`.
- Frozen pre-apply fingerprints: LINE policies
  `2596ad76480f6484ae9ea0523eb4d674`; LINE ACL
  `8e36fd84519a1aed7efb8ab52b03d14b` over 138 parts; unrelated `aicc_*`
  canary `1a120bb49bdf81711391bc8a45abbd88` over 409 parts. The
  `aicc_*` value was identical across two reads; no prior digest existed, so
  it is the authoritative pre-apply baseline for post-apply equality checking.
  All nine L0b tables remained absent.
- Targeted 6D decision:
  `CONDITIONAL PASS — EXACT ACL-ONLY APPLY GATE`. No Critical/High blocker
  remains for applying the exact remediation. Existing
  `RISK-L0A-ACL-1` remains open until apply and verification.
- Supabase security advisors reported an expected informational
  `mtp_line_events` no-policy state and a pre-existing leaked-password
  protection warning. The Auth warning is a Medium follow-up owned by P'Boy,
  due `2026-09-22` or before any Auth configuration change; no Auth/provider
  setting change is authorized here.
- The separate Owner exact-operation approval was later obtained for Packet A
  only, as recorded in the Production closure below. Generic `supabase db push`,
  L0b, data movement, deployment, provider/environment changes, cleanup and L1
  were not included.

### Packet A Production ACL apply — catalog verified, smoke waived

- Owner approved the exact targeted operation only. Supabase recorded
  `20260822162710_line_acl_default_privilege_hardening` from apply base
  `main@a061319cc6762fe58243f1e10a40e0737489aa2e`, tree
  `d18a9f466f1ee62021a9d41541cfd0fcbe14b73e`, migration blob
  `3a6e760e183889b72c13df48bd72b10a9655c69f`, SHA-256
  `554c2cc12d970795439d5ba41ed96ef15eae176737cdd6862c7e2b7cb77c2d3a`.
- Ledger gained exactly that one migration. L0b and no other migration were
  applied. No data DML, import/backfill, deployment or provider change occurred.
- Post-apply table/default/function/column ACLs matched the reviewed
  least-privilege matrix. Five target tables remained RLS-enabled; ten policies
  and row counts `1/5/1/17/1` were unchanged.
- L0b remained `0/9`. The unrelated `aicc_*` v2 canary remained
  `848e24b1452c3c4e5ff6b7b9ce308044` / 218 parts. The new LINE v2
  fingerprint was stable twice at `f939987598538c846c82d85942a37037` /
  61 parts.
- No rollback was required. Security advisors added no finding.
- Owner directed that authenticated snapshot/save, LINE `menu`, and Edit ->
  Cancel be skipped and assumed successful. Evidence status is **OWNER-WAIVED /
  NOT EXECUTED**, not PASS. Residual `PACKET-A-R1` is accepted and reopens on
  any related permission symptom or before the next LINE/Auth/ACL change.
- Packet A is management-closed with a `CONDITIONAL PASS`. Browser + Google
  Drive remains authoritative; L0b, deployment, provider/Auth changes, cleanup,
  PR #79/#83 merge and L1 remain outside scope. The exact staged L0b gates are
  recorded in `docs/L0B_PRODUCTION_READINESS.md`.

### L0b Production schema-only apply — catalog verified, importer disabled

- Owner confirmed custody of refreshed encrypted backup artifact `9479566992`
  and separately approved the exact targeted operation for Production project
  `qjaywadzvwvcspdsjxth`, base
  `main@1ece60919d0a4ecdeafcfa4c05b509fc9543492a`, migration SHA-256
  `75d0794155cfcc4a3575868f92a16a5d670f6660787c30611e3955a98fe04e8c`.
- Targeted `apply_migration` ran exactly once with name `l0b_data_foundation`;
  Supabase recorded `20260823055451_l0b_data_foundation`. No generic
  `supabase db push`, import, backfill, planner-content read, deploy, provider
  configuration change, cleanup, or L1 action occurred.
- Post-apply catalog verification passed: tables/owners/RLS/policies `9/9`,
  reviewed RPCs `6/6`, triggers `5/5`, reviewed indexes `8/8`, unvalidated
  constraints `0`, owner-orphans `0`, ACL differences `0`, `PUBLIC` RPC grants
  `0`, and sequence API-role grants `0`. All nine L0b tables contain zero rows.
- LINE and unrelated `aicc_*` aggregate catalog/ACL/policy/function/count
  canaries were identical before and after apply. Full/Mobile import controls
  remain fail-closed with `UI_ENABLED=false`; browser + Google Drive remain
  authoritative.
- Supabase advisors added six
  `authenticated_security_definer_function_executable` WARNs for the six
  reviewed authenticated importer RPCs. This is the intended execution model;
  exact ACLs, `auth.uid()` owner binding, empty `search_path`, RLS and fencing
  remain verified. Treat any drift as a reopened blocker. The pre-existing
  leaked-password-protection WARN and default-deny `mtp_line_events` INFO remain.
- Gates 0-3 are complete. Gate 4 manual enablement/import and final functional
  acceptance remain separately Owner-gated; this documentation closure is not
  import acceptance or L0b/L1 source-of-truth cutover.

### L0a webhook reliability Production release

- PR #70 merged the exact reviewed L0a source; PR #69 was closed unmerged as
  superseded. PR #73 merged the deployment runbook.
- LINE Developers Console was Owner-verified with `Use webhook = Enabled` and
  `Webhook redelivery = Enabled` before migration/deployment.
- Encrypted logical backup `20260818T145008Z` passed export, decryption and
  SHA-256 integrity checks. Owner accepted the single-copy Personal-PC risk.
- Production migration verification confirmed RLS enabled, no client ledger
  access, service-role-only RPC access, authenticated mutation updates limited
  to `status`, `error_code`, `applied_at`, and `updated_at`, and no change to
  the 17 pre-existing mutation rows.
- Runtime rollback remains captured Edge Function v21, bundle
  `a32064244b6faf3d419f9cc5c6b9d9fea981159b3cecd8f5d838aaef53629bc7`.
  The additive ledger schema may remain in place during runtime rollback.
- Evidence-only PRs #71 (isolated replay/timeout), #72 (encrypted backup), and
  #74 (post-deploy public endpoint smoke) are intentionally closed unmerged
  after this closure record is committed.
- No Netlify code/configuration, LINE Rich Menu, provider secret, retention
  cleanup, Todo source-of-truth cutover, L0b, or L1 change is part of L0a.
- Current Todo source of truth remains browser + Google Drive. The approved
  future sequence remains `L0a -> L0b normalized Supabase data -> L1 direct
  Supabase Todo`; only after L1 is Production-verified does Drive become
  backup/export/archive only.

## LINE Official read-only bot activation

Feature branch: `feature/line-official-readonly-bot` (merged)

Status on 2026-07-29:

- Logical Supabase backup accepted; migration
  `20260728155436_line_official_readonly_bot.sql` applied.
- LINE Function Secrets configured, `line-todo-webhook` deployed, and the LINE
  console returned **Success** for webhook verification.
- Production owner acceptance found a client auth-storage incident before any
  link code or snapshot row was created. The hotfix was subsequently verified,
  merged to `main`, deployed, and the initial linked reply completed.

- The feature stays in this repository because it is an integration module of
  the same Todo Planner product, not a separate product.
- Full and Mobile publish a privacy-minimised task snapshot to Supabase only
  after Google Drive sync succeeds. LINE failure never fails Drive.
- `line-sync.js` is public browser code using the existing authenticated
  Supabase publishable client and RLS. It contains no provider/backend secret.
- `line-todo-webhook` verifies LINE HMAC on the raw body, resolves the one-time
  owner link, reads the snapshot, and returns deterministic English or Thai
  replies.
- Supported command groups: today, this week, next 4 weeks, overdue, high
  priority, no due date, search, status, menu, and help, with English and Thai
  aliases.
- After a successful link, the bot sends an English Flex command menu. `menu`
  opens English and `เมนู` opens Thai. Linked text replies carry nine mobile
  Quick Reply actions; the Flex menu remains usable in LINE for PC.
- `next 4 weeks` means today through day 28 inclusive in `Asia/Bangkok` and
  excludes overdue/completed tasks. `high priority` includes active High or
  Urgent tasks regardless of due date.
- No AI or MCP runtime is used. Date logic is fixed to `Asia/Bangkok`.
- Snapshot v2 always allows only type, title, status, due date,
  category/project, and priority. The owner may separately opt in to sanitised
  Subtask text/done state and HTTPS attachment-link metadata. Raw IDs, notes,
  descriptions, local/base64 file data, configuration, OAuth tokens, and API
  keys remain excluded.
- One-time link codes are CSPRNG-generated, stored as SHA-256 only, single-use,
  and expire after 10 minutes.

Release/runbook files:

- `supabase/migrations/20260728155436_line_official_readonly_bot.sql`
- `supabase/functions/line-todo-webhook/`
- `docs/LINE_OFFICIAL_SETUP.md`
- `docs/SECURITY_6D_AUDIT.md`
- `docs/PROJECT_PERFORMANCE_KPI.md`
- `docs/assets/line/` — Rich Menu configuration, specification and recreation
  commands

Production order is backup → migration → Function Secrets → Edge Function →
LINE webhook verify → app deploy → Full/Mobile acceptance. The first five are
complete, and the auth-storage hotfix has since shipped. Never merge, migrate,
or deploy a later release candidate without separate explicit approval.

### LINE activation incident: Supabase session tokens erased

Observed symptom: the signed-in UI showed the Google account, but **Create LINE
link code** returned `Please sign in to My Todo Planner again.`

Evidence:

- Supabase Auth logs showed successful Google OAuth and `/auth/v1/user` HTTP
  200.
- No `/rest/v1/mtp_line_*` request followed the button click.
- `mtp_line_snapshots`, `mtp_line_link_codes`, and `mtp_line_accounts` each had
  zero rows.
- A jsdom reproduction proved the security bootstrap rewrote the Supabase
  localStorage session with blank access/refresh tokens.

Root cause: the document-wide storage guard redacted any JSON property named
`access_token` or `refresh_token`, including the legitimate Supabase Auth
session stored at `sb-qjaywadzvwvcspdsjxth-auth-token`.

Fix: Full and Mobile bypass redaction for that one exact storage key only.
Ordinary and lookalike keys remain protected. Regression coverage lives in
`build/auth-storage-security.test.mjs`.

Recovery after the auth hotfix: sign in once, save to cloud if a fresh snapshot
is needed, create a new link code, send it to LINE, then run the command
acceptance set. No database rollback or data restore is required.

### LINE bilingual command-menu production release

Branch: `feature/line-command-menu` (merged)

- Edge Function source only; no database migration, snapshot schema, browser
  application, or Google Drive change.
- Cross-platform menu uses Flex Message. Mobile replies also use Quick Reply;
  there are eight static message actions, below LINE's limit of 13.
- English is the default after linking. Language choice is carried by the
  command tapped or typed and is intentionally not stored in the database.
- Production is included in `line-todo-webhook` version 2. Rollback is
  redeploying the previous reviewed function commit.

### LINE task-detail card production release

Branch: `feature/line-task-details` (merged)

- Snapshot schema v2 adds two independent owner opt-ins:
  `lineShareSubtasks` and `lineShareAttachmentLinks`. Both default to `false`.
- Subtasks are reduced to text/done state. Attachments are reduced to a label,
  detected kind, and validated HTTPS URL; HTTP, URLs with embedded
  username/password credentials, local files, base64 data, raw IDs, notes, and
  descriptions are never published.
- LINE list commands return deterministic Flex task cards. Each card shows at
  most five Subtasks and three attachment buttons; a carousel has at most 12
  cards and stays below LINE's 50 KiB Flex JSON limit.
- Compatibility migration
  `20260730031026_line_task_details_snapshot_v2.sql` allows snapshot schema v1
  and v2 without rewriting existing rows.
- **The repository filename and the applied database version do not match.**
  The repo file is `20260730031026_…`; Supabase records the applied migration as
  version `20260730041511`, name `line_task_details_snapshot_v2`. Same
  migration, different timestamp — production is correct, but a `db push` or
  diff will treat the repo file as unapplied and may try to re-run it. The
  migration is additive and re-runnable (`drop constraint if exists` → `add` →
  `validate`), so a re-run is not destructive, but do not assume the two
  identifiers refer to different things. Renaming the repo file is **not** the
  fix — that would break anything already pinned to the current name; record the
  mapping here instead and check it before any migration tooling runs.
- The compatibility migration, Edge Function version 2, and Full/Mobile app
  release are in production. Owner live-data acceptance passed on
  `2026-07-30`, including the two exclusion cases that matter most: an HTTP
  link and a local/base64 attachment were both absent from LINE output. GitHub is the primary source for code and migrations; Drive remains
  supplementary recovery only.
- Rollback the application and Edge Function to the prior release if needed.
  Keep the additive v1/v2 database constraint because it remains compatible
  with both old and new clients.

### LINE search snapshot truncation fix (pending release)

- Large snapshots previously sorted every task by due date before enforcing the
  500-task/240 KiB cap. A newly-added task with a later due date (reported with
  `Buy AIA`, due 1 Dec 2026) could therefore be absent from the snapshot and
  impossible for `search buy` to find even after a successful cloud save.
- Snapshot selection now prioritises source `createdAt` (with source position as
  a deterministic fallback), then restores the established due-date ordering
  for the selected tasks. `createdAt` is selection-only and is not published to
  LINE or Supabase.

### LINE Search-button production release

Branch: `feature/line-search-button` (merged in PR #43)

- Adds one `Search` / `ค้นหา` action to both the Flex command menu and mobile
  Quick Replies, bringing each language to nine actions (below LINE's limit of
  thirteen).
- The action is a fixed LINE postback with `inputOption: openKeyboard` and a
  fixed `fillInText` value of `search ` or `ค้นหา `. Mobile users type only the
  keyword; LINE PC receives a short typed-command fallback instruction.
- Bare `search` / `ค้นหา` also opens the same deterministic prompt. Existing
  `search <text>` / `ค้นหา <คำ>` behavior is unchanged.
- Only exact `action=search_prompt&lang=en|th` postbacks are accepted; arbitrary
  postback data is ignored. No task data is placed in the postback payload.
- Function-only change: no database migration, snapshot resave, new secret,
  AI/MCP runtime, browser app change, or Google Drive change.
- Production is `line-todo-webhook` version 3. Source parity with merged `main`
  passed; direct smoke checks returned expected GET 405 and unsigned POST 401
  on version 3. Rollback is redeploying version 2.

Targeted 6D audit:

| Audit date | Commit SHA | Environment | Identity & access | Secrets & data | Input safety | Browser/network | Supply chain/deploy | Operations/recovery | Decision | Report |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-30 | `bf47521` / merge `ad3067f` | Supabase Production v3 | Pass | Pass | Pass | Pass | Pass | Pass | PASS | `docs/SECURITY_6D_AUDIT.md` |
| 2026-07-30 | merge `e7ea377` (PRs #45 and #46) | Docs, assets and CI only — no runtime change | Pass | Pass | Pass | Pass | Pass | Pass | PASS | `docs/SECURITY_6D_AUDIT.md` |
| 2026-08-19 | source `3cafa19` / Production v22 | Supabase Production L0a webhook reliability | Pass | Pass | Pass | Pass | Conditional | Conditional | CONDITIONAL PASS | `docs/SECURITY_6D_AUDIT.md` |

The second row covers Rich Menu asset versioning, the project-context
corrections, and the scheduled health check. `index.html` and
`BUILD-MANIFEST.json` regenerate byte-for-byte, so the merge changed nothing
GitHub Pages serves — its only effect was activating the scheduled workflow.
Operations reached `Pass` once `line-health` run 1 returned `PASS (3/3)` against
production; before that it was `Conditional`, because a control that has never
executed is a control on paper. One accepted Medium residual remains (LINE-5).

Delivery note worth keeping: PR #45 merged at `372c3ee`, one commit short of the
cadence fix, which left `main` briefly carrying a keepalive that could allow the
very pause it exists to prevent. PR #46 closed it. **Verify what actually landed
on `main` after a merge — do not infer it from the branch you pushed.**

### LINE persistent Rich Menu

Created manually through LINE Official Account Manager, not through the
Messaging API. **It changes no code**: it sends the text `menu`, which
`parseIntent()` already matches (`/^(?:เมนู|menu)$/u`) and answers with the
English Flex command menu containing `Search`.

- Canvas 2500 × 843, one full-width clickable area, label and chat bar text
  `Menu`, action type Text/Message, exact text `menu`, default display Show.
- Configuration, full specification and recreation commands are versioned in
  `docs/assets/line/`. **The deployment image
  `line-rich-menu-menu-v1.png` is still uncommitted** — the menu is currently
  recoverable in configuration only, not in appearance. See LINE-3 below.
- A Manager-created Rich Menu may not be returned by the Messaging API Rich Menu
  list endpoint. An empty list is **not** evidence the menu is missing; verify in
  the LINE app.
- Because no code, function version, migration, secret or snapshot changes,
  there is nothing to roll back on the server side. Reverting means deleting or
  hiding the menu in Manager; function version 3 stays ACTIVE either way and
  typed `menu` / `เมนู` keeps working.
- Owner acceptance (7 steps, mobile and PC) is in `docs/LINE_OFFICIAL_SETUP.md`
  → "Rich Menu" and is still outstanding.

## Source of truth (restored in 3.77.0)

Versions 3.65–3.76.1 were produced by patching the minified bundle directly;
3.77.0 ported those changes back into source. From now on, **all changes go
through the pipeline** — never edit `index.html` by hand:

```
src/App.jsx  ── vite build ──►  dist bundle
                                   │
build/*.js|css|html (wrapper) ─────┤
                                   ▼
        node build/package.mjs <bundle> index.html <version>
        (assembles wrapper + bundle, computes all 6 CSP hashes from shipped bytes)
```

| Piece | Path |
|---|---|
| React source (edit this) | `src/App.jsx` |
| Wrapper: head/meta/PWA identity | `build/head.html` |
| Wrapper: base + pro-UI CSS | `build/base.css`, `build/pro-ui-layer.css` |
| Wrapper: security bootstrap (JSON/innerHTML/fetch guards, secret redaction) | `build/security-bootstrap.js` |
| Wrapper: theme prepaint, storage shim, runtime banners, credential-field lock | `build/prepaint.js`, `build/storage-shim.js`, `build/runtime-layer.js`, `build/security-ui.js` |
| Packager (assembles + CSP hashes + self-verifies) | `build/package.mjs` |
| Render harness (jsdom, frozen clock; healthy = LEN 25129 / NODES 141, no THROW) | `build/check4.mjs` |
| Six-dimension audit + pre-build checklist | `build/audit.py` |

Build cycle (run every time, in order):
`vite build` → esbuild IIFE test bundle → `node build/check4.mjs` →
`python3 build/audit.py src/App.jsx` (0 blockers required) →
`node build/package.mjs <bundle> index.html <version>` → update
`BUILD-MANIFEST.json` + `CHANGELOG.md`.

### Toolchain (pinned)

`package.json` and `package-lock.json` are committed with exact versions, so the
whole pipeline is one command:

```
npm ci          # exact versions from the lockfile
npm run verify  # build -> harness -> audit -> package, in order
```

Individual steps: `npm run build`, `npm run harness`, `npm run audit`,
`npm run package`. `npm run package` goes through `build/pipeline.mjs`, which finds
the content-hashed bundle in `dist/assets`, calls the packager, and refreshes
`BUILD-MANIFEST.json` — the filename changes every build so it cannot be hard-coded.

LEN is an `innerHTML` character count and NODES a DOM element count, so **both move
with the jsdom version**. That is exactly why the lockfile matters: before it, a
mismatch against the numbers below meant "different environment" at least as often
as "regression", and there was no way to tell which.

| Tool | Version used for LEN 25129 / NODES 141 |
|---|---|
| jsdom | 25.0.1 |
| react / react-dom | 18.3.1 |
| vite | 5.4.21 (`@vitejs/plugin-react` 4.x) |
| esbuild | 0.24.2 |

The previous baseline in this table (LEN 22572 / NODES 118) was recorded in the
first 3.77.0 commit and never refreshed; it does not reproduce on any source
state in this branch's history, including the untouched `src/App.jsx` snapshot
from `main`. It was replaced rather than investigated further because the
toolchain that produced it was never recorded.

`build/check4.mjs` reads `./test-bundle.js`; `npm run test-bundle` builds it (and
`npm run harness` chains the two). The command is:

```
npx esbuild src/main.jsx --bundle --format=iife --loader:.jsx=jsx \
  --jsx=automatic --target=es2019 \
  --define:process.env.NODE_ENV='"production"' --outfile=test-bundle.js
```

`vite build` must not take the repo's `index.html` as its entry — that file is the
generated artifact. The committed `vite.config.js` points
`build.rollupOptions.input` at `build/vite-entry.html` instead.

## Working agreement

- **Consult before building.** "note ไว้ก่อน" / "อย่าพึ่งทำ" = backlog only. Build on "ทำเลย" / "ทำต่อ".
- Thai primary, concise replies. Screenshots with red circles = bug reports.
- Deploy discipline: แก้ → test → verify → สะสมเป็นชุด → deploy รอบเดียวเมื่อพร้อม. Dedicated branch + PR; no merge without explicit approval.
- No personal names in the app (allowed: contact email champbanyat@gmail.com, "Lotus Bakeries", "Lotus General").
- Batch changes into one build + audit + package cycle. Report audit results honestly.

## "Do I need to push?" is answered by lastPushedStamp (3.77.x)

```js
const localChanged = !!dataLastUpdated && dataLastUpdated !== gsync.lastPushedStamp;
```

`lastPushedStamp` is the `dataLastUpdated` value that was last **successfully uploaded**.
Both sides of the comparison come from this device's own clock, so there is no drift
against Google's `modifiedTime` and no tolerance window to tune. A failed upload leaves
it unchanged, so the push retries until it lands.

**Do not go back to comparing `dataLastUpdated` against `lastSyncAt`.** That asks "did
the data change since we last *checked*", which is a different question, and the "nothing
changed" branch re-stamps `lastSyncAt` on every check. Once `lastSyncAt` got ahead of
`dataLastUpdated` the pending edit was invisible forever and each further check pushed
`lastSyncAt` further out — a self-reinforcing trap. A device sat showing
`This device 08:00 PM / Cloud file 07:57 PM / Already up to date — nothing to upload`
with newer data that could never leave it.

Two invariants that keep it honest:

- **Every path that uploads must record `lastPushedStamp`** from the payload it actually
  sent (`payload.dataLastUpdated`), not from `dataLastUpdated` read again afterwards.
- **Every path that receives data must set `dataLastUpdated` from the payload**, never
  to `Date.now()`, and record the same value as `lastPushedStamp`. A stamp of "now" on a
  copy that just came down makes it look newer than its own source and bounces it back
  up; that bounce is what the old 1500ms tolerance existed to hide.

A record predating the field has no `lastPushedStamp`, which counts as needing a push —
that is deliberate, and it is what recovers an install already stranded. Safe, because a
cloud that also moved makes `cloudChanged` true and the conflict dialog asks first.

`build/sync-push-stranded.test.mjs` reproduces the stranded state and asserts an upload
happens; it fails against the commit before the fix.

## "Save to Cloud" is a save, not a sync (3.77.x)

`gsyncSaveNow` backs the button; `gsyncNow` backs auto-sync, focus and visibility checks.
**Do not point the button back at `gsyncNow`.** That function is a two-way reconciler and
is entitled to answer "nothing to upload" — correct for a background check, wrong for a
button a person deliberately pressed. Reported as: *"when I click Save to Cloud it means
I ask to save whatever shows on the screen to the Google Drive file, but now it is not
working like that."*

`gsyncSaveNow` refuses exactly one thing: a cloud file that has moved since this device
last looked **while this device also holds unsaved edits**, because then one copy has to
lose. That raises the direction dialog, where "keep this device and overwrite the cloud"
completes the save. Nothing else refuses — least of all "nothing changed locally".

A cloud that moved while this device changed nothing is **not** that case: the other
device's save comes down, the two sides then agree, and that is what pressing save was
for. See the auto-apply section below.

`gsyncPush` is not the answer either: it uploads with **no** cloud check at all.

## A save commits the screen, and stamps that moment (3.77.x)

`pushPayload()` is the single place a save's timestamp is decided:

```js
const stamp = new Date().toISOString();
return { stamp, payload: { ...buildSavePayload(), dataLastUpdated: stamp } };
```

That one value goes to **three** places on every successful upload — the payload field,
`dataLastUpdated` (via `setDataLastUpdated`), and `gsync.lastPushedStamp`. They cannot
drift apart, and the verdict line is green the instant the save lands.

**`dataLastUpdated` means "when this browser last saved", not "when the data changed".**
It was the latter, which is technically defensible and made the screen lie: pressing Save
to Cloud left the browser row reading `19 hr ago` beside a Drive row reading `3 min ago`,
which is indistinguishable from a save that failed. The user's rule, and the one to keep:
*pressing save commits what is on screen at that moment, so both times become that
moment.*

Consequences worth knowing:

- Both rows use the **same verb** — "saved" — because they are meant to match. A browser
  time ahead of the Drive time means unsaved changes, and the panel says so.
- Do not re-derive the verdict by comparing those two times. It is
  `dataLastUpdated === lastPushedStamp` — one clock, exact.
- The file on disk is a **manual backup only**. Nothing depends on it, Auto-sync never
  touches it, and it may simply not exist. Say that where it is shown.

## There are THREE places data lives — name all three (3.77.x)

| # | place | held in | truth about it |
|---|---|---|---|
| 1 | ☁️ **Google Drive** | `gsync.fileId` / `fileName` | the shared copy; the only one Auto-sync keeps current |
| 2 | 💾 **This browser** | `window.storage` → localStorage | **the live data the app actually reads and writes**; not a file; dies with site data or the home-screen icon |
| 3 | 📄 **File on disk** | `fileHandle` / `lastFileName` / `lastSavedTime` | a one-off snapshot; never updates itself; Auto-sync never touches it |

Use **exactly these three names on every surface** — panel, desktop File menu, chip
tooltip. Two labels for one place is the confusion this exists to remove: the panel
said "📱 This device" in one box and "💾 This browser" in the next, for the same value.

What was wrong before, and must not come back:

- The panel showed **two** boxes, and the second was headed `💻 This device (local)` with
  a **filename** under it — a filename that was pure fiction, mirrored from the Drive
  name, while its own caption admitted "Data lives in this browser". 📄 plus a name reads
  as "there is a file on my disk". Browser storage has no filename; do not invent one.
- Location 3 was **absent from the panel entirely**, even though the app can read and
  write one. Leaving it out is what lets a stale snapshot be mistaken for a live copy.
- Locations 2 and 3 render **above** the signed-in gate. They have nothing to do with
  Google, and "where is my data?" is asked most often by someone who is not connected.

`gsyncRelink` and `CloudSyncModal`'s `onLinkFile` clear `lastSyncAt`, `lastCloudModified`
and `lastPushedStamp` on purpose — pointing at a file you have never compared must raise
a conflict, not silently overwrite it — and then **trigger a reconcile**, because nothing
used to, so the panel sat on "Cloud file: never / Last checked: never" indefinitely with
no way out but to guess.

## Another device's save applies itself; only a collision asks (3.78)

The rule, in the user's words: *"if another device saved, changes apply automatically to
the local storage of the web browser. No need to ask immediately."*

`cloudChanged && !localChanged` → **download and apply, no dialog.** Both the auto-sync
reconciler (`gsyncNow`, which also runs on focus and `visibilitychange`) and the explicit
Save press (`gsyncSaveNow`) take this path. The toast reads "Updated from cloud — another
device saved"; the Auto-sync caption says it brings a save in, so the behaviour is
discoverable rather than surprising.

`cloudChanged && localChanged` → **still asks.** Nothing else may. That ordering is the
whole safety argument: 3.75 and earlier applied *any* cloud change silently, including one
that landed on top of unsaved local edits, which is what the dialog was added to stop. The
dialog was then applied to both cases, and the safe one did not need it.

Consequences that are easy to get wrong:

- The dialog's own first line used to read *"This device has no unsaved edits, so updating
  is safe"* — a dialog that argues for the button it is asking you to press. If a prompt
  can explain why the answer is obvious, do not show the prompt.
- Reaching that dialog now means taking the cloud copy **discards this device's unsaved
  changes**, so "Update now" lost its green. Both directional answers lose something;
  only "Later" loses nothing. Do not restore a reassuring colour to either.
- It is titled **"Save needs a decision"**, deliberately not "Both copies changed" —
  that is `gsyncConflict`'s title, which the auto-sync path raises for the same
  situation. Two dialogs, one situation, reached from different buttons.
- A test that asserted the modal passed for the **wrong reason** after this change: the
  new toast contains "another device saved", which matched the old
  `/Another device saved/i` probe. Assert on dialog chrome, never on wording a status
  message can also contain.
- Assert "was it applied?" against **browser storage**, not the DOM. With the Sync
  Manager open the task list is not rendered either way, so a DOM probe passes whether
  or not the download landed.

## Sync time has to be visible, and absolute (3.77.x)

Three separate facts, and the answer to "is my copy the same as the cloud's?" needs all
three side by side. `syncStamp()` is the single formatter for every one of them:

| line | source | means |
|---|---|---|
| 💾 This browser | `dataLastUpdated` | when this browser last **saved** — see the section above; it was "when the data changed", and that made the screen lie |
| ☁️ Google Drive | `gsync.lastCloudModified` | the Drive `modifiedTime` at the last check |
| 🔄 Last checked | `gsync.lastSyncAt` | when the two were last compared |

Rules learned from getting each of these wrong:

- **Always print the wall-clock time, not only a relative age.** Every surface used to
  say "5 min ago" and nothing else, degrading to a bare `toLocaleDateString()` past 24
  hours — which drops the clock entirely. "What time did it sync?" had no answer.
- **The stamps render above the signed-in gate.** They are local history and need no
  Google session; that question gets asked precisely when you are *not* connected and
  something looks wrong.
- **Any age on screen needs its own ticker.** An age computed once per render with
  nothing to re-trigger it freezes at whatever it said when the surface opened. `SyncChip`
  owns its interval rather than ticking `App`, which would re-render the whole tree.
- **Anything in the desktop header must be checked against the compact one.** The sync
  status, like the version chip before it, existed only in the desktop File menu — which
  is not rendered below 1024px.
- `savedAt` in a saved file is when the file was *written*; `dataLastUpdated` is when
  its contents last changed. Both are written now. Opening a file seeds
  `dataLastUpdated` from `parsed.dataLastUpdated || parsed.savedAt` — without that a
  profile opened from Drive came up with a blank stamp, and a file opened *from* Drive
  marked "now" would look newer than its own source and push straight back up.

## Writing a harness fixture: two keys are stored RAW

`lifeplanner-active-profile` and `lifeplanner-data-updated-v1` hold bare strings and are
read with no `JSON.parse`. Seeding them stringified gives a profile id that literally
contains quote characters, so `pk()` builds `"test-profile"::key` and every
profile-scoped row silently fails to match. The older harnesses never noticed because
they seed no profile-scoped data at all. Everything else is JSON.

## The onboarding gate is an early return (N104)

`if (!activeProfileId || profileList.length===0) return <OnboardingScreen…>` sits near
the top of `App`, **above every modal and panel in the component**. Nothing rendered
further down exists on that path, so a gate action can never be completed by flipping a
state flag that some panel reads — `setGsyncPanel(true)` from the gate switched on a
panel that is not mounted, which is exactly how "Open from Google Drive" spent several
versions connecting to Google and then doing nothing at all, visibly indistinguishable
from a failure. **Anything the gate offers, the gate must render itself**, including its
own errors: `gsyncError` is only read by `SyncPanel` and `CloudSyncModal`.

The gate is also the one place where `activeProfileId` is `null`, so `pk()` there
returns the **bare, unscoped key** and `patchConfig()` merges over `DEFAULT_CONFIG`
rather than over the file being opened. Anything a first-run open needs to persist goes
through `applyOpenedFile`'s `wPre()` writes, which happen *before* `setActiveProfileId`
— the same ordering that function already depends on for the data itself, and the only
point that cannot lose a race against the `[activeProfileId]` load effect.

`build/drive-gate.test.mjs` covers the whole path with a stubbed GIS + Drive REST layer.

## Google Drive file-list recovery (N104)

Both `SyncPanel` and `CloudSyncModal` display file-list errors locally and
offer a reconnect action which reloads the list after successful explicit
sign-in. Each GIS attempt has a `GIS_LOAD_TIMEOUT_MS` (7-second) timeout and there are
two attempts, so an unreachable Google costs ~14s before the user is told; a stale or failed script is
removed and retried once. Drive REST helpers never initiate interactive OAuth,
because the original Safari user activation may already be gone. A Drive 401
clears all in-memory token state, offline requests get a specific message, and
cancelled reconnects clear busy state without hiding the error. Empty lists
explicitly describe the least-privilege `drive.file` visibility rule rather
than implying that every JSON file in the user's Drive should appear.

## Unified sync conflict workflow (3.75, re-implemented in source in 3.77.0)

One `DirectionDialog` component backs both conflict cases (opened local file vs
Drive; both-sides-changed sync). It compares Drive `modifiedTime` with local
`savedAt`/`dataLastUpdated`, marks the newer copy with a NEWER badge, recommends
that direction, always offers **Local → Cloud** and **Cloud → Local**, and a
second confirmation step states the exact counts about to be discarded. Cloud
metadata is checked during manual sync, auto-sync (~15 s debounce after edits),
browser focus and visibility change, and — since 3.80 — a 10 s metadata poll while
auto-sync is on and the tab is visible.

## Save to Cloud is in the header, and it asks (3.81)

The one action that stops work being stranded on a single device was three taps deep —
⋯ More → Sync Manager → scroll. On a phone that meant no visible answer to "is my work
safe yet?".

- **In the header row, not the corner column.** That column of floating controls already
  collided with itself once (3.77.x); a fifth member is not the way. It sits beside the
  chip that reports the state it changes.
- **Amber when this screen holds something Drive does not, green when it does not.** The
  colour is the feature: the header answers whether the button needs pressing *before*
  it is pressed. It reads `localUnsynced()`, so it is the data talking, not a clock.
- **It carries the word "Save" even on a phone.** An amber square with a cloud in it is
  visible but not self-explanatory, and being clearly visible was the point. Measured at
  390px in Chromium: the header still does not scroll sideways with the label in.
- **Both Save to Cloud buttons — header and panel — go through the same confirm.** One
  label doing two different things depending on where it was pressed is a trap for the
  user and for anyone reading the tests. The panel's button therefore also asks now, and
  the test helpers answer the confirm as part of "pressing save".
- The confirm says which of the two situations you are in, and that a save may **stop and
  ask** rather than overwrite — otherwise "Yes" reads as "yes, overwrite whatever is
  there", which is not what `gsyncSaveNow` does.

Known and NOT fixed here: with both top banners showing, **"Back up now" overlaps
"💾 Save Now"**. Reproduced identically on the pre-change build, so it is excluded from
the header-overlap check by name rather than allowed to mask a new overlap.

## "Matched" means the data, not the clocks (3.80)

Every other answer in the sync layer came from stamps:
`dataLastUpdated === lastPushedStamp` means *"this device uploaded its own latest
edit"*. It cannot see that **another** device saved, so a device could sit on a green
"✓ Google Drive has what is on screen" while the cloud held work it had never heard
of. Nothing had asked the cloud.

`dataFingerprint(payload)` + `gsyncCheckNow()` answer the real question by
downloading the file and comparing content.

- **Exact string equality of `canonicalJSON`, not a hash.** Both payloads are already
  in memory when the question is asked, so there is no reason to accept even a
  negligible collision rate. Object key order is normalised away; **array order is
  not** — the order of tasks is something the user arranged.
- **`COMPARED_KEYS` is a deliberate subset.** Excluded: `savedAt` and
  `dataLastUpdated` (clocks), `appVersion` (two devices on different builds are not
  out of sync), `fileName`, `profile` (ids are minted per device even for the same
  synced file), `tabReads` (what *this* device has looked at) and `activity` (an
  append-only log each device writes its own entries to). Include any of them and
  "matched" becomes unreachable — a permanent false alarm is worse than no readout.
- **Content equality cannot say which WAY a difference points**, so direction still
  comes from the stamps. When the content differs and both stamps insist nothing
  moved, the stamps are what is wrong: that case raises the conflict dialog, because
  picking a direction there means guessing whose work to destroy. No code path had
  been able to detect that state before — they all believed the stamps and reported
  "already up to date".
- **A check never writes on its own account.** Matched heals the stamps and stops;
  one-sided differences sync in that direction (3.78 for incoming); two-sided goes to
  the dialog with its conflicted copy (3.79).
- **The round-trip test is the load-bearing one.** `build/sync-content-check.test.mjs`
  saves, serves the uploaded bytes back as the cloud file, and checks. A hand-built
  "matching" fixture would not catch `savedAt` leaking into the comparison; only a
  real save/download cycle does.
- **`✓ Matched` with the tick is what assertions look for.** The button reads "Check
  now — matched or not?", so it is on screen the whole time and a bare `/matched/i`
  passes before any check has run.

### The 10 s poll, and what turns it off

The app's first fixed-interval poll, deliberately the cheap half: `getMeta` only, with
the download reserved for when the metadata says the file moved. Before it, another
device's save was noticed on focus/`visibilitychange` or 15 s after a local edit — so a
device left open on a desk noticed nothing at all.

It stops when **auto-sync is off** (that switch means "manual only", and a poll would
make it a lie), when the **tab is hidden** (a phone in a pocket polling Drive spends
battery on an answer nobody is reading, and focus re-checks on return), and while a
**decision dialog is open**, so the question cannot change under the user.

## A date field's tap target is the date input itself (3.79.1)

`DateInput` backs all 16 date fields, so it is a single point of failure for "can the
user enter a date at all". Its native `<input type="date">` used to be `20×20` with
`pointerEvents: "none"`, reachable only via `showPicker()` from a ~20px 📅 button
flush against a full-height text input. Apple's minimum is 44px; that target was
890px², 46% of it. On a phone a near miss focuses the text field and iOS opens the
numeric keypad — which is how the bug was reported.

- **The date input is the target now**: 44px wide, full field height, `pointerEvents`
  live. Tapping it opens the picker through ordinary tap handling on every iOS
  version, with no dependency on `showPicker()` (late in Safari, and it throws on
  inputs it considers unrendered). `showPicker()` is still called on click because
  desktop Chrome opens the picker only from its own calendar glyph, which is
  invisible here.
- **The 📅 is a `pointerEvents: "none"` span, not a button.** Exactly one
  hit-testable layer in that 44px — two is what produced the miss.
- The text input reserves `paddingRight: 46`, which must stay ≥ the overlay width or
  typed text slides underneath it. `build/date-picker-target.test.mjs` asserts that
  relationship rather than the constant.
- That test also asserts **date fields were found at all**. An empty query would make
  every other assertion pass by having nothing to check — the same vacuous-pass trap
  the browser check hit while measuring the sync dialogs.

## The copy that loses a conflict is kept, not deleted (3.79)

Answering a sync conflict used to destroy the other side outright, and the confirm
step said so: *"This cannot be undone from here. Cancel and use Backup to Local
Drive first if you are unsure."* That advice only reaches someone who read it
before the collision existed.

`saveConflictCopy(contentText, whose)` now uploads the losing side to Drive as
`<master> (conflicted copy from <whose> YYYY-MM-DD HH-MM).json`, in the master
file's own folder (`getParentFolder`, so a copy is where the user will look for
it). This is the Dropbox contract — `file (conflicted copy).ext` — and the same
answer OneDrive gives with **Keep both** and Joplin with a conflict note.

All four destructive answers call it: `gsyncAcceptCloud`, `gsyncAcceptLocal`,
`cloudAheadUpdate`, `cloudAheadKeepMine`.

- **It runs BEFORE the destructive write, and a throw abandons that write.** This
  ordering *is* the feature. A copy written afterwards is absent from exactly the
  run where writing it is what failed — the run that loses data. And a user told
  the loser is kept answers the dialog more freely, so the promise has to be true
  before anything is destroyed. `build/sync-push-stranded.test.mjs` asserts this
  with a 500 on the multipart create: nothing may be applied, nothing uploaded,
  and the error must surface. Swapping the two lines makes that block fail.
- **`keepsLoser` is a `DirectionDialog` prop, not a constant.** The Drive conflict
  paths keep the loser; the disk-import path (`ImportDirectionDialog`) does not.
  It defaults to `false`, so a caller that forgets it understates its own safety
  rather than overstating it.
- **The confirm panel turns amber and reads "This leaves the screen:"** instead of
  red and "This will be discarded:". A red danger box that is not dangerous
  teaches the user to click through red boxes.
- Filenames are built from `getFullYear/getMonth/getDate/getHours/getMinutes`, not
  from `toLocaleString`. Drive rejects `/` in a name and locale-formatted dates
  are full of them.
- The `uploads` / `creates` split in the test harness is deliberate: a conflict
  copy is a new file, an upload overwrites the master. Pooling them would make
  "did it overwrite the master?" unanswerable.

## A dialog must outrank the panel that raises it (3.79)

The `gsyncCloudAhead` dialog ("Save needs a decision") sat at `zIndex: 6000`
while `SyncPanel` — the Sync Manager, where **Save to Cloud** is pressed — sits at
`9700`. So the only ask in the entire sync flow rendered *underneath* the thing
that raised it. Chromium at 390×844 reported all three of its buttons covered by
the panel's own content: present in the DOM, unanswerable on screen. Now `9850`.

The sibling `DirectionDialog` was already `9800`, above the panel, which is why
this never showed there.

- **jsdom cannot paint, but the numbers are the bug.** The regression test reads
  both elements' inline `zIndex` and asserts dialog > panel. No layout engine
  needed.
- **Bounds checks would not have caught it.** Every button was inside the
  viewport. `document.elementFromPoint` at each button's centre is the question
  that matters, and it is now part of the browser check.
- Known and NOT fixed here: the ⛶ Full screen control (`src/App.jsx:13835`) is
  `zIndex: 9999`, above every modal, and paints over dialog prose. It covers text,
  not buttons. It predates this work and affects every modal, so correcting it
  means sweeping them all — its own change, not a rider on this one.

## Task attachment previews (3.76.x, re-implemented in source in 3.77.0)

`taskImages(task)` is the single definition of "images this task owns":
attachments of that exact task, `detectAttachType === "image"`, and a source
that survives `safeImageSrc()` (which delegates to the wrapper's
`__MTP_SECURITY__.safeURL`). Every image badge, preview, thumbnail and count
asks it first; tasks without valid images get no image UI at all. Preview
controls are keyboard-activatable with aria-labels.

## Event places are per time window (N97 family, 3.77.x)

`windowLoc(ev, w)` is the single definition of "the place for this time window":
the window's own `loc` first, the legacy event-level `location` as a fallback that
is read but never written again. A trip that happens twice can therefore sit in two
different places under one event.

Everywhere a place is drawn it is drawn **outside** the bar, never inside. Timeline
and Gantt bars are `overflow:hidden` and can be a handful of pixels wide at a wide
zoom, so a pin inside them disappears exactly when the user most needs it. Each
label is a sibling of its bar, flips to the other side within ~18% of the right
edge so it cannot run off the chart, and carries `pointerEvents:none` with the pin
link re-enabled — otherwise it covers the resize handles and the drag surface.

## The bottom-right corner is one column (3.77.x)

Four independent floating controls live there: ＋ quick-add task, 📌 quick note, 🗓
quick event, ⛶ presentation mode. Each is rendered under its own condition, so any of
them can be absent. `fabSlot(offset, size)` in `src/App.jsx` is the only place their
position is decided — **do not add a new corner control with its own `bottom:` value.**
Three of them once did exactly that and all three occupied the same square; the only
reason it looked like a single button was `z-index`.

Two rules the helper encodes:

- Slots are fixed, never packed. A button must not move because another one appeared.
- On compact layouts every offset adds `env(safe-area-inset-bottom)`, because the
  bottom nav it sits above (`~59px` phone / `~67px` tablet plus its own inset) does the
  same. A bare pixel value puts the lowest slot underneath the nav on a notched phone.

On wide screens there is no nav, but `auth.css` pins the sign-out pill at
`right:14px/bottom:14px`, so the column starts at 64px rather than at the bottom edge.

`auth.js` finds its mount point with `document.querySelector('.toprow')` — that class is
on the compact top bar and must stay there, or sign-out falls back to a fixed full-width
pill across this corner at `z-index:2147482000`. The fallback is styled to be harmless
(no label, bottom-left) because the auth callback can fire before React mounts.

`build/fab-stack.test.mjs` asserts all of this at three viewport widths.

## Security model

- CSP with 6 inline-script SHA-256 hashes — **always generated by
  `build/package.mjs`**, never edited by hand.
- `build/security-bootstrap.js` runs before the app: JSON.parse size/prototype
  guards, secret redaction on storage writes, document-wide innerHTML
  sanitizer, fetch allow-list, external-link hardening, paste/drop cleaning.
- Credential inputs (Anthropic/Google API keys, OAuth client ID, MS app ID) are
  **not rendered** since 3.77.0; `build/security-ui.js` remains as a second
  line of defence that hides/disables any such field it ever sees.
- Note HTML passes through `sanitizeNoteHTML()` before entering print/export
  popup documents (the document-wide guard cannot reach windows the app opens).
- Google Drive uses least-privilege `drive.file`; Supabase auth bootstrap,
  URL sanitization, file limits unchanged.
- **No credential belongs in this repo at all.** A Google API key was committed
  twice in one week — the second time through the GitHub web editor — and the repo is
  public, so both had to be rotated. Nothing in the app reads an API key: Drive works
  on an OAuth token from GIS, so the answer is always to delete the constant, never to
  paste a new value in. Two independent guards now exist:
  - GitHub **push protection**, which blocks the push (including web-editor commits).
    It is an account setting and can be switched off.
  - `build/secret-scan.mjs`, run by CI and by `npm run scan-secrets`. It lives in the
    repo, so it also covers a commit that is never pushed. Patterns are **narrow on
    purpose** — the Google OAuth **client ID** in `src/App.jsx`/`auth.js` is a public
    identifier, not a secret, and a broad scanner would flag it and leave CI red until
    someone deleted the check. `--selftest` asserts both directions: that each pattern
    still catches a credential, and that the client ID, `sha512-` integrity hashes and
    the Supabase project URL are still ignored.
  - A revoked key in git history is not an incident. Rotating is the fix; rewriting
    history is not, and for an unreachable commit it cannot work at all — only GitHub
    Support can remove one.

## Known hazards (learned the hard way — do not regress)

- TDZ crash = blank screen; only the render harness catches it, not the build.
- `build.target: ['es2019','safari13']` is mandatory; after packaging verify `??` = 0 and `?.[` = 0 or older iOS Safari renders nothing.
- Every persist path must stamp `dataLastUpdated` (N106) and every storage write must scope via `pk()`/`pkG()` — a raw-key write in the Gantt recurring-done flow shipped for months before the audit caught it in 3.77.0.
- Empty arrays are truthy: guard imports with `Array.isArray(x) && x.length > 0` or `version >= 7`.
- The harness clock is frozen; if you change the fixture data, update the expected LEN/NODES in this file.
- Splice edits: verify anchor uniqueness first, and never let an assert abort half-applied multi-replacements — apply independently and re-verify with grep.

## Prevented Recurrence Register

| ID | Incident / trigger | Root cause | Permanent prevention | Verification / release gate |
|---|---|---|---|---|
| LINE-AUTH-1 | Signed-in UI but LINE link-code creation says to sign in again | Generic localStorage secret redaction erased Supabase Auth access/refresh tokens | Exact allow-list for `sb-qjaywadzvwvcspdsjxth-auth-token` in Full and Mobile; all other keys still redact secrets | `build/auth-storage-security.test.mjs`; `npm test`; `npm run verify`; post-deploy sign-in + link-code DB row + LINE acceptance |
| LINE-WEBHOOK-1 | LINE redelivery or partial batch failure could duplicate drafts and reprocess completed events | No persistent webhook event identity/state, batch-level failure handling, and an 8-second gateway timeout | Service-role-only `mtp_line_events` ledger, atomic claim/finalize RPCs, per-event isolation, 30-second lease, `source_event_id` mutation idempotency, and provider redelivery enabled | Final review PASS at `73ad8b6`; CI #104/#116; isolated replay/timeout PASS; migration `20260818154406`; v22 live smoke: 5 processed, 0 failed/processing, max attempt 1, no new mutation |
| PACKET-A-B2-1 | Pinned logical backup failed in the data phase on the disposable CLI target | Supabase CLI `2.111.0` bootstrapped Storage through migration 60 while the Production-shaped dump expected migration-62 columns; zero-row COPY headers still resolve every named column | Fail-closed network-isolated compatibility bridge pins reviewed upstream migrations 61-62, exact pre/post catalog state and immutable source hashes; it never edits the dump or records false Storage migration history | PR #79 exact head `796b42a`; source-safety and restore run `32577304437` PASS; no output artifact or Production connection |
| PACKET-A-B2-2 | Post-Packet-A restore reached catalog verification but failed closed before publishing raw diagnostics | Restoring into a fresh target did not reproduce the source database's reviewed `postgres` default-ACL precondition; deleted private logs prevented overstating a unique first failing assertion | Reconstruct only the frozen Packet A default-ACL precondition inside the disposable transaction, restore schema as `postgres`, reset before data, and publish only nonce-bound allowlisted assertion group + SQLSTATE; raw logs remain private and cleanup-scoped | PR #83 exact remote head `48aaa796`; verify/source run `32616039132`/`32616039104` PASS; restore run `32618003121`, jobs `97141728425`/`97141748031` PASS; zero output artifacts and no Production write |
| PACKET-A-ACL-1 | Broad existing LINE grants and `postgres` future defaults exposed privileges beyond the reviewed contract | Historical Supabase defaults plus explicit existing object grants were broader than RLS alone controls | Exact hash-pinned targeted ACL migration; never use `db push`; freeze before/after ledger, count, ACL/RLS and unrelated canaries | Migration `20260822162710`; catalog/default/RLS/count/canary PASS; functional smoke Owner-waived / NOT EXECUTED |

## Open backlog

| ID | Item | Notes |
|---|---|---|
| N103 | iPhone vs iPad welcome screens differ | Root cause found in 3.77.0: home-screen name/manifest said "Dashboard" and version display was stale — re-add to Home Screen after deploying 3.77.0, then compare version numbers (now meaningful). |
| N104 | Cannot pick a Drive file on iOS | Root cause found in 3.77.x and it was not Safari: on the welcome screen the button connected and then opened a panel that the onboarding early-return never mounts, so nothing happened and no error showed. Fixed; still needs confirming on the device that the user's file is visible to `drive.file` scope at all. |
| N105 | Connection drops on a device that already connected | iOS standalone vs Safari-tab are separate storage contexts; confirm mode first. |
| — | OneDrive sync | Not started; needs Azure App Registration client ID. |
| — | Mobile/Full code sharing | `mobile/index.html` is a separate vanilla app; every shared fix must be made twice. Long-term: fold mobile into the React app or extract shared modules. |
| — | CI | **Done, not "not started".** `.github/workflows/verify.yml` runs on every PR and every push to `main`: secret scan (+ selftest), `npm run verify` (build → harness → audit → package), `npm test`, a check that `index.html`/`BUILD-MANIFEST.json` reproduce byte-for-byte from source, and an es2019 guard rejecting `??` / `?.[` in the shipped bundle. Remaining gap is monitoring, not CI — see LINE-4. |
| — | Staging | Netlify deploy previews planned (deferred until source is stable — now unblocked). Needs new JS origin + redirect URI in Google Console, new redirect URL in Supabase Auth, and the Netlify domain added to CSP `connect-src`/`form-action` as applicable. |
| L0b | Normalized Supabase projection — Production activation | **Schema gate complete; import gate next.** Source/reviews/CI, qualifying backup custody, targeted 6D, exact schema-only apply, and catalog verification are closed. Production has `9/9` tables and `6/6` reviewed RPCs with zero rows; importer remains disabled. Follow `docs/L0B_PRODUCTION_READINESS.md` for separately approved enablement, first manual import, reconciliation, and acceptance. |
| L1 | Direct Supabase Todo / Drive export-only cutover | Unstarted and blocked on L0b Production verification plus schema completion for operational fields, opaque LINE reference design, full-owner reconciliation, and a separate cutover/rollback approval. |
| LINE-1 | ~~LINE Official read-only bot production activation~~ | **Closed 2026-07-30.** Backup, migrations, Function Secrets, function v3, webhook verification, auth hotfix, menu and task cards are active, and owner live-data acceptance passed — including the exclusion cases that carry the privacy risk: an HTTP link, a local file attachment and base64 data were all absent from LINE output, and turning each opt-in off removed only its own data from the next reply. |
| LINE-2 | ~~Search button owner acceptance~~ | **Closed 2026-07-30.** Keyboard prefill verified on LINE mobile for both `search ` and `ค้นหา `, typed-command fallback verified on LINE for PC, and bare `search` / `ค้นหา` both return the same prompt. |
| LINE-3 | ~~Rich Menu backup and owner acceptance~~ | **Closed 2026-07-30.** `docs/assets/line/` holds the configuration, the specification, the recreation commands and the deployment image — verified at 2500 × 843, 418,567 bytes, SHA-256 `221784dd…836ed8a4`, no `tEXt`/`iTXt`/`eXIf` metadata. The 7-step owner acceptance passed on LINE mobile and LINE for PC: the menu appears, sends `menu`, and the bot returns the English Flex menu containing `Search`. Still absent and still optional: `line-rich-menu-background-v1.png`, needed only to re-typeset the label over the same artwork. |
| LINE-4 | ~~No runtime monitoring~~ | **Closed 2026-07-30.** `.github/workflows/line-health.yml` runs `build/line-health-check.mjs` daily: function GET → 405, unsigned POST → 401, anonymous snapshot read → denied. The third doubles as the keepalive for the free-tier 7-day pause and is the only automated guard on the `anon` revoke, so it replaces the separate keepalive cron in Infrastructure notes. Needs no repository secret. Verified live: run 1 against `main` at `2b54e02` returned `PASS (3/3)`, with the anonymous read denied by **401** — PostgREST answers 401 rather than 403, which is why the check accepts either. What it does **not** prove is bounded by LINE-5. |
| LINE-5 | Health check cannot see an invalid credential | `index.ts` guards credentials by emptiness only, then answers 401 on the missing signature before it calls LINE or touches the database. A **deleted** secret therefore returns 500 and fails the check, but an **expired or rotated** LINE channel access token still returns 401 and LINE-4 stays green while every real event fails and the owner gets no reply. Closing it means storing a LINE channel access token in repository secrets so a check can call `GET /v2/bot/info` — a token able to post as the Official Account would then live in CI, reachable by any workflow and anyone with write access. **Owner decided on 2026-07-30 not to store the token — risk accepted, not open.** The workflow, the checker's SCOPE comment and the 6D audit all state the same limit: green means "deployed and configured", never "working". Compensating controls: a LINE channel access token is long-lived and does not lapse on its own, so this failure requires a deliberate rotation the owner performs knowingly and can re-test immediately (`docs/LINE_OFFICIAL_SETUP.md` → Rollback already lists rotation as an incident step); and with a single owner-user, a dead bot surfaces on first use rather than sitting unnoticed. **Revisit if** a second user is onboarded, or if a token ever does expire unexpectedly — either breaks a compensating control. Raised by automated review on PR #45. |
| — | ~~LINE confirmed mutations: rejected/expired mutations fail silently~~ | **Closed 2026-08-11.** `prepareMutations()` in `line-sync.js` now returns a `rejected` list (including a proper `expired` reason, previously invisible since expired rows were excluded from the query entirely) instead of discarding it. Full and Mobile surface it as an amber "Saved to cloud — N LINE change(s) could not be applied (reason)" note/toast instead of nothing. Merged in PR #56, deployed with `line-todo-webhook` v5/v6. |
| — | ~~LINE \`add\`: relative date phrases~~ | **Closed 2026-08-11.** `today`, `beginning/middle/end of this/next month/year`, and `mid of next N months` (day 15 of the month N months from now — owner-defined 2026-08-11, resolving the one initially-ambiguous phrase), all computed deterministically from `bangkokToday()` (tested incl. month/year rollover and leap-year month length). Merged in PR #56 and a same-day follow-up, deployed. |
| — | ~~LINE bot replies: "Open Planner" link~~ | **Closed 2026-08-11.** Added to both the mutation-confirmation reply and the persistent command menu/Quick Reply row (English "Open Planner" / Thai "เปิด Planner"), 10 actions total, still below LINE's 13-item limit. Merged in PR #56 and #57, deployed. Auto-save was requested too and explicitly declined — would require the backend to permanently hold a Google Drive credential it does not have today. |
| — | ~~LINE \`edit\`: shorter syntax~~ | **Closed 2026-08-11.** `edit <title>, DD-MM-YYYY` now works when only the date changes, alongside the existing `edit <old title>, <new title>, DD-MM-YYYY` form. Merged in PR #56, deployed. |
| — | ~~\`BUILD-MANIFEST.json\` mobile hash is stale~~ | **Closed 2026-08-11.** `build/pipeline.mjs` now recalculates `mobile.sha256`/`mobile.bytes` on every package run, alongside the existing `full.*` fields, so the two can no longer drift apart. Merged in PR #56. |
| — | Desktop Save to Cloud button — owner acceptance | Added in PR #59 (2026-08-11): a header-level Save to Cloud button for desktop (≥1024px), mirroring the existing mobile/tablet one — the action was previously three clicks deep in the Profile+Sync dropdown on desktop. `npm run verify` passed and it was checked in a headless browser, but the owner has not yet eyeballed it on a real signed-in session with Drive linked. |
| — | `importUseCloud` can still skip a pending LINE mutation | Same class of bug fixed 2026-08-11 across 8 sync entry points (see the confirmed-mutations release record above), but deliberately not fixed there too: `importUseCloud` is part of the rare "open a conflicting local file from disk, keep the cloud copy" flow, not the core Drive sync loop. Low priority — needs both a disk-file import *and* a pending LINE mutation at the same time. |

Unbuilt idea list: bulk actions in List, duplicate a saved view, export
Timeline/Gantt as PNG, `.ics` export, dependency arrows, workload heatmap,
search highlighting.

## Infrastructure notes

- GitHub Pages serves one branch per repo; a second URL needs its own Google
  Console redirect URI (hence the Netlify staging plan).
- Supabase free tier pauses after 7 days inactivity (data retained, manual
  restore); if this becomes a problem, add a GitHub Actions cron keepalive
  (`.github/workflows/keepalive.yml`, every ~3 days).
- **The `qjaywadzvwvcspdsjxth` project also hosts an unrelated app**: an
  `aicc-agent-gateway` Edge Function and eight `aicc_*` tables (agents,
  sessions, tasks, messages, projects, and related), applied by 11 migrations
  dated `2026-07-25` (versions `20260725072800` through `20260725073139`,
  named `*_ai_command_center_*`) that do not exist anywhere in this repo. This
  is a separate product sharing the same Supabase project, not a mistake or
  leftover. Discovered `2026-08-11` when `supabase db push --dry-run` first
  failed with `LegacyDbPushMissingLocalError` over these 11 versions plus the
  already-documented `20260730031026`/`20260730041511` drift described
  earlier in this file (LINE task-detail card production release).
  - Their migration-history status is deliberately `reverted` — that word is
    Supabase CLI's sentinel for "not tracked by this repo," **not** a claim
    that their SQL was rolled back (their tables are live and in active use).
    `applied` requires a local file to exist at that exact version; `reverted`
    does not, which is what keeps `db push`/`migration list` from expecting
    this repo to own them.
  - Do not repair these to `applied` without also adding matching local
    migration files, and do not delete or modify the `aicc_*` tables/function
    from this repo's tooling — they belong to a different codebase.

## LINE temporal search release (production)

- Released and owner-verified on 2026-08-02: the Edge Function deployment and
  health check passed, the live browser publishes `SNAPSHOT_SCHEMA = 3`, and a
  Drive save successfully published the v3 snapshot. The owner also confirmed
  that the December 2026 task and event records are present in the live
  snapshot after republishing it.

- Snapshot schema v3 adds privacy-minimised calendar events: type, sanitised
  title, start date, end date, and category only. Event IDs, descriptions,
  locations, notes, attachments, configuration, and credentials remain excluded.
- Deterministic LINE search accepts a year, named or numbered month, or ISO week
  with a year, optionally combined with a keyword and `task`/`งาน` or
  `event`/`กิจกรรม`. Examples: `search buy December 2026`,
  `ค้นหา งาน เดือน 12 ปี 2026`, and `search events week 49 2026`.
- Multi-day events match every period they overlap. Existing today/week/status
  commands remain task-only. Full and Mobile use the same `line-sync.js`
  projection, and the snapshot is still published only after Drive succeeds.
- Events with multiple date windows publish one privacy-minimised occurrence per
  window so searches do not miss later windows or falsely match gaps between
  them; window descriptions remain excluded.

## Confirmed LINE mutations (production release)

Branch: `codex/troubleshoot-search-results-in-line-krwxqs`, merged via PR #51
(conflicts resolved by PR #52, merged as `a6f5d2f`).

- `add <title>, DD-MM-YYYY` defaults to Personal / General / Medium; `add work`
  and `add event` select the other record types. Edit/Delete use exact titles and
  reject missing or duplicate matches.
- Every mutation requires a Confirm/Cancel postback. Confirmed operations remain
  separate from the read-only snapshot and are applied by Full/Mobile only when
  the next Google Drive save succeeds.
- Mobile prepares queued operations only after resolving cloud-ahead state and
  commits their payload to browser storage only after Drive accepts the upload.
  This prevents an unuploaded LINE change from appearing locally or forcing a
  false conflict dialog.
- `search week36 2026` now covers ISO week 36 only, Monday through
  Sunday. L0a corrected the former 69-day end-date defect to a 7-day
  inclusive range and added exact week 1/week 53 boundary tests.

Production activation, `2026-08-11` (Claude Code handover, taken over after the
owner could not complete the Supabase backup manually):

- Fresh logical backup (roles + schema + data) of `qjaywadzvwvcspdsjxth`
  created via `supabase db dump`, restore-verified against a local Supabase
  stack (Postgres + Auth), GPG-encrypted, and moved to the owner's own durable
  storage outside the Codespace.
- Migration `20260802090000_line_confirmed_mutations.sql` applied (creates
  `public.mtp_line_mutations`, RLS-scoped to `auth.uid() = owner_id`,
  SELECT/UPDATE only for `authenticated`; INSERT is intentionally reserved for
  `service_role` — the client never inserts a mutation row directly, only the
  Edge Function does, after Confirm). `20260801090000_line_snapshot_v3_events.sql`
  was re-applied in the same push as a no-op (its effect — the `(1,2,3)`
  schema_version check — was already live); this closed a migration-history
  tracking gap for that version without changing behaviour.
- `line-todo-webhook` redeployed (now ACTIVE version 5, bundle SHA-256
  `ac2d0a7ed2f7c9c6b742a9fc13da825d0d6cef2d407f1061c2f445cc476c66ce`).
  `npm run health-check` PASS (3/3): GET→405, unsigned POST→401, anonymous
  snapshot read denied.
- Full/Mobile web deploy required no separate action: this repo's GitHub Pages
  is legacy "serve from branch" on `main`, so it already matched the merged
  build — confirmed by fetching the live `index.html` and `mobile/index.html`
  and checksumming them against the local build (byte-identical).
- Owner live-data acceptance, LINE + real Drive round trip: Add (with
  Personal/General/Medium/Pending defaults) applied correctly on the next Save
  to Cloud; Edit (exact-title match) applied correctly; Delete against a
  non-existent title was correctly rejected server-side
  (`mtp_line_mutations.status='rejected'`, `error_code='not_found'`, verified
  by direct query) with nothing deleted; single-use enforcement confirmed (no
  mutation rows left in `status='confirmed'` after use); confirmed mutations
  apply only on a deliberate Drive save, never before; temporal-search
  regression (`search buy December 2026`) still correct. Duplicate-title
  rejection was not live-tested but shares the exact same code path
  (`applyMutation` in `line-sync.js`) just verified for the not-found case.
  Drive-outage/retry behaviour was not live-tested but is covered by the
  passing automated Drive-conflict suite in `npm test`.
- **Gap found here, closed same day:** a rejected (`not_found` /
  `duplicate_title`) or expired (10-minute TTL) confirmed mutation used to
  fail silently. Fixed in PR #56 (2026-08-11) — see Open backlog below.

### Interactive mutation menu, task-card actions, and status updates (2026-08-11)

Owner request: menu shortcuts for Add/Edit/"Set Status" that prompt for the
missing piece rather than requiring the exact one-line syntax, and clickable
Edit/Delete/Status buttons directly on task cards.

- Menu/Quick Reply grew from 10 to **13 actions — exactly LINE's limit, no
  headroom left for a future addition without removing one.** New entries:
  "Add" / "Edit" / "Set Status" (English), "เพิ่มงาน" / "แก้ไข" / "ตั้งสถานะ"
  (Thai) — distinct from the pre-existing "Status" button, which still shows
  the read-only pending/done/overdue counts. Each new entry is a
  keyboard-prefill postback (`action=mutation_prompt&kind=…&lang=…`), same
  mechanism the Search button already used: fills `add `/`edit `/`status `
  into the input and separately replies with a short instructional message.
  The typed command itself stays English-only regardless of menu language,
  same as every other mutation command.
- **New mutation type: `status`.** Personal tasks keep the app's existing
  Pending/Done toggle; **work tasks get the app's full four-state workflow —
  To Do, In Progress, Review, Done** (owner chose full parity over a
  simplified Done/Pending-only toggle when asked, since the app itself
  already has four states for work tasks). Events have no status concept and
  are never offered it, at the parser, the picker, or the card-button level.
  `status <title>, <value>` for the full command; `status <title>` alone
  offers a picker (2 buttons for personal, 4 for work).
- **`edit <title>` alone now also offers a date picker** — the exact same
  shortcut set as `add`, reusing the machinery from PR #56's "add without a
  date" feature. Its commands reconstruct the *short* edit form
  (`edit <title>, <date>`), so the title is never touched. Consequence found
  while wiring this up: **`edit`'s date field never supported the relative
  phrases from PR #56 at all — only literal `DD-MM-YYYY`.** Fixed as part of
  this change (both edit forms now go through the same `resolveMutationDate`
  as add); a picker button generating `edit X, today` would otherwise have
  silently failed to parse.
- **Task cards (every Flex bubble, in every reply — today/week/search/etc.)
  now carry Edit/Delete buttons, and Status too unless the task is an
  event.** Each button just sends a fully-formed bare command
  (`edit <type><title>` / `delete <type><title>` / `status <type><title>`)
  as if the owner had typed it — no server-side session state, no task ID
  ever exposed (the exact title was already on the card). Confirm/Cancel
  before anything executes was already true for every mutation before this
  change; nothing new was needed there.
- The carousel byte-budget (`MAX_FLEX_CAROUSEL_BYTES`, 50 KiB) already
  degrades gracefully by dropping the last card and rebuilding until it
  fits — confirmed this still holds with the added button overhead using the
  existing fixture-based byte-size test; no code change was needed for it,
  but it means a very long task list may now show fewer cards per carousel
  than before, since each card is a little larger.

**Picker prompt wording fix (PR #64, same day):** the add/edit date pickers
and the status picker said "or type a date/value as …", implying a bare typed
reply alone would be understood. It would not — there is deliberately no
server-side memory of which task a picker was for; only the Quick Reply
button `text` carries the full reconstructed command. Found live when the
owner typed a bare date and got the generic "I don't understand that
question yet" reply. Fixed: all three prompts now show the exact full command
to type (e.g. `edit send Kerry today, DD-MM-YYYY`), reusing the same
command-builder already used for the buttons.

**Search status filter (`search <text> <status>`), owner request:** e.g.
`search ภาษี pending` / `search Fortuner done`. An optional trailing status
word narrows results to that status; omitted, search covers every status
exactly as before. Vocabulary matches the `status` mutation's own: universal
`pending`/`done` (`ค้าง`/`เสร็จแล้ว`) map to `!isDone`/`isDone` so they work
across personal *and* work tasks regardless of the work-specific state name;
the three work-only words `todo`/`in progress`(`inprogress`)/`review`
(`ต้องทำ`/`กำลังทำ`/`ตรวจสอบ`) match a work task's exact status field, so they
never match a personal task. **Events are always excluded once a status
filter is present** — events have no status concept at all, same rule as the
`status` mutation's own picker and card button. Parsed by extending
`parseTemporalSearch` (it already stripped a trailing scope word for
`events`/`tasks`; the status word is stripped the same way, longest phrase
first so `to do`/`in progress` are never shadowed by a shorter single word)
— composes with the existing temporal search unchanged
(`search tax done December 2026` works). Same accepted trade-off as the
pre-existing scope-word stripping: a bare status word is always treated as a
filter, never as a literal search term (e.g. `search done` searches every
"done" task, not a task titled "done") — consistent with how `search tasks`
already behaved before this change.

**Two production incidents found and fixed the same day, live with the
owner:**

1. **LINE Flex footer `separator` schema error.** `separator: true` was
   placed directly on the footer *box* — LINE's schema doesn't recognise
   that field there at all; it only exists as bubble-level
   `styles.footer.separator`. This bug predates tonight (the attachment-links
   footer had it too) but never surfaced because this account's attachment
   sharing has always been off, so that footer was never actually populated
   and sent — the new unconditional Edit/Delete/Status footer hit LINE's
   strict validation for the first time. LINE's reply API returned
   `400 unknown field`, silently swallowed by the top-level catch (by
   design — it never logs request content), so it surfaced only as task-list
   replies going silent with no error visible anywhere. Root-caused live via
   Supabase's Invocations/Logs dashboard and temporary, narrowly-scoped
   diagnostic logging (owner-approved, fully reverted in the fix commit).
   Fixed: moved to `styles.footer.separator`. Regression test added.
2. **Confirmed LINE mutations silently skipped by 8 of the app's sync
   entry points.** Only `gsyncPush` and one branch of `gsyncSaveNow`
   correctly called `prepareLineMutations()` before finalising a payload —
   pre-existing since the mutation feature shipped, not something this
   session introduced. Every other path that adopts a Drive/cloud copy or
   pushes local without going through that exact call skipped pending
   mutations entirely, leaving them stuck forever as
   `status='confirmed'`, `applied_at=null`, with **no error or warning
   anywhere** — found live when the owner's confirmed `delete` never took
   effect after Save to Cloud. Fixed in `gsyncNow` (its cloud-adopt,
   local-push, *and* "nothing changed" branches — the last one matters most
   for an owner who only ever mutates via LINE, since `localChanged` is
   never true on that device), `gsyncSaveNow`'s cloud-adopt branch,
   `gsyncCheckNow` (all three of its own equivalent branches: matched,
   cloud-moved, local-moved), `gsyncAcceptCloud`, `gsyncAcceptLocal`, and
   `gsyncPull`. Each adopt-style fix conditionally re-uploads the
   mutation-merged payload instead of just adopting the raw cloud copy
   silently. New regression test reproduces the exact incident (cloud moved,
   nothing else locally unsaved, a LINE mutation pending) via a mocked
   `window.__MTP_LINE__.prepareMutations`, previously untested by any
   existing sync test. **Known remaining gap, deliberately not fixed
   tonight:** `importUseCloud` (the rare "open a conflicting local file from
   disk" flow) has the same class of gap; scoped out as a much rarer path
   than the core Drive sync loop, to keep this fix bounded.
