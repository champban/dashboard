# Security 6D Audit — LINE Official Read-only Bot

Latest audit: `2026-07-30T20:48:00+07:00` (`Asia/Bangkok`)

Scope: branch `claude/todo-planner-line-handover-yrm2ei`, pull request #45
(Rich Menu asset versioning including the deployment image, project-context
corrections, scheduled LINE health check). Auditor: Claude Opus 5 via Claude
Code. The one binary added is an image asset, never executed and never served
by the application — it is inert in the repository and read only by a human or
by a manual `curl` upload to LINE.

Decision: **CONDITIONAL PASS**. No Critical or High findings. The condition is
that the new health check has never executed against production — see
Residual risks — so it must not be treated as an active control until a real
run passes.

## Latest targeted findings — Rich Menu assets and health check

Change class: documentation, versioned assets, and one new CI workflow. **No
runtime change.** No source, Edge Function, migration, RLS policy, Function
Secret, snapshot, or browser-bundle modification.

| Dimension | Result | Evidence / control | Open item |
|---|---|---|---|
| Identity and access | PASS | Nothing touches auth, the LINE HMAC gate, account mapping, link codes, or any RLS policy. The health check authenticates as nobody — it sends only the publishable key and asserts it is refused | None |
| Secrets and data | PASS | Workflow needs **zero repository secrets**; the project URL and publishable key it uses already ship to every browser in `auth.js:3-4`. Rich Menu recreation commands read `$LINE_CHANNEL_ACCESS_TOKEN` from the shell environment and the README states the token must not reach chat, commit, log, or repo. `npm run scan-secrets` PASS over 70 tracked files. Check output is restricted to status codes — no task data, LINE user id, or token can appear | Publishable key now duplicated in two files (Low, see residuals) |
| Input and content safety | PASS | The checker consumes **no** response body — it branches on `res.status` only, so a hostile or malformed response cannot reach a parser. Rich Menu JSON is static, validated against the specification (2500×843, one area, `text: "menu"`, `chatBarText: "Menu"`), and is never executed | None |
| Browser and network controls | PASS | `index.html` and `BUILD-MANIFEST.json` regenerate **byte-for-byte** from source, so merging changes nothing GitHub Pages serves. No new origin, endpoint, CORS rule, or CSP hash. Outbound requests originate from GitHub runners to already-public Supabase endpoints, never from a user's browser | None |
| Supply chain and deployment | PASS | New workflow declares `permissions: contents: read` (least privilege) and runs **no `npm ci`** — it imports nothing and uses only built-in `fetch`, so it adds no dependency surface and cannot be broken by a compromised package. Actions pinned to the same major tags as the existing `verify.yml` (`actions/checkout@v5`, `actions/setup-node@v5`). Lockfile unchanged; `npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities | None |
| Operations and recovery | **CONDITIONAL** | This change exists to close a monitoring gap and it does add the control, but the control is unproven. `--selftest` (7 cases, offline, in `npm test`) proves the logic catches a dead function, a bypassed HMAC gate, a paused project, a grant regression, and a network failure. The live path has never run | Live verification required before LINE-4 closes |

Checks performed:

- `npm test` — PASS, including the new offline `--selftest`.
- `npm run verify` — PASS; static audit `0 blockers`, CSP hashes `6/6`.
- `git diff -- index.html BUILD-MANIFEST.json` after `verify` — **empty**;
  the shipped artifact is provably unchanged by this branch.
- `npm run scan-secrets` — PASS (selftest + 70 tracked files).
- `npm audit --omit=dev --audit-level=high` — `0 vulnerabilities`.
- Rich Menu JSON asserted field-by-field against the recorded specification.
- Migration drift confirmed against the live project: repo filename
  `20260730031026_…` vs applied version `20260730041511`, same migration.
- Production Edge Function re-confirmed: version 3 ACTIVE, `verify_jwt=false`,
  bundle SHA-256 `d4ed04cad2935502009ca61275062bd3130752780179f0f099d76ed2a3ab51f6`
  matching the recorded value; deployed source matches merged `main`.

Defect found and corrected during this audit:

- The health check initially asserted that an anonymous snapshot read returns
  `200` with an empty array. The activation migration revokes all privileges on
  `mtp_line_snapshots` from `anon`, so that assertion could never pass and the
  job would have failed on every run — the reliable way to get a check ignored
  and then deleted. Corrected at `fb8692f` to assert **denial** (401 or 403),
  which is the stronger property: a `200` now means the revoke was undone and
  anonymous callers can reach owner snapshots. Nothing else in this repository
  watches for that.

Backup and rollback readiness:

- No backup required: no migration, no destructive operation, no production
  data touched.
- Rollback is `git revert` of the branch. Reverting the workflow file stops the
  schedule; nothing else has to be undone, because nothing else was changed.
- Supabase, Google Drive, and the deployed application are all untouched.
- Function version 2 remains the Edge Function rollback point, unchanged.

Residual risks:

| Risk | Severity | Owner | Status |
|---|---|---|---|
| Health check never executed against production; the sandbox egress policy refuses `CONNECT` to `supabase.co`, and `workflow_dispatch` is not available until the workflow reaches `main` | Medium | Owner runs `npm run health-check` locally, or first post-merge run | Open — LINE-4 stays open until a real run passes |
| ~~`line-rich-menu-menu-v1.png` uncommitted~~ | ~~Medium~~ | Owner | **Closed** — uploaded at `6b25938` and verified: 2500 × 843, 418,567 bytes, PNG 8-bit indexed, SHA-256 `221784dd4655b9153e89492939591b2a2bceb015d7eb3fc5248b01b3836ed8a4`. Chunk walk found `IHDR cHRM PLTE bKGD tIME IDAT IEND` and **no `tEXt`, `iTXt`, or `eXIf`**, so the file carries no author name, software string, or GPS data into a public repository. Hash recorded in `docs/assets/line/README.md` so a future re-encode is detectable. Rich Menu is now recoverable in appearance as well as configuration; only the 7-step owner acceptance remains |
| Publishable key and project URL now appear in both `auth.js` and `build/line-health-check.mjs`. Not a disclosure risk — both are public by design — but the two can drift if the project is ever migrated | Low | Next maintainer | Accepted; `line-health-check.mjs` names `auth.js` as the source of truth and supports `MTP_SUPABASE_URL` / `MTP_SUPABASE_PUBLISHABLE_KEY` overrides |
| Scheduled workflows are disabled by GitHub after 60 days of repository inactivity, which would silently stop the monitoring | Low | Next maintainer | Accepted and documented in the workflow file |

Deployment note: merging this branch to `main` republishes GitHub Pages, but the
served bytes are identical, so there is no user-visible release. The real effect
of the merge is **activating the scheduled workflow**. That is the only thing
to watch after merge.

## Historical targeted findings — Search button

| Dimension | Result | Evidence / control | Open item |
|---|---|---|---|
| Identity and access | PASS | Existing raw-body LINE HMAC gate and account mapping are unchanged; postback handling occurs only after HMAC verification | None |
| Secrets and data | PASS | No new secret, task field, log field, database access, migration, or browser bundle; postback contains only fixed action/language | None |
| Input and content safety | PASS | Exact allow-list `action=search_prompt&lang=en\|th`; extra/unknown postback data is ignored; typed query retains existing normalization and 120-character cap | None |
| Browser and network controls | PASS | Uses LINE-native postback, `openKeyboard`, and fixed `fillInText`; no new origin, endpoint, CORS rule, URI action, or CSP change | Owner mobile/PC acceptance |
| Supply chain and deployment | PASS | Dependencies and lockfile unchanged; exact audited source anchor is `bf47521`, merged as `ad3067f`; targeted tests, full regression suite, TypeScript transform, production build, harness, audit and CSP verification pass | None |
| Operations and recovery | PASS | Function v3 is ACTIVE; all three deployed files exactly match merged `main`; direct GET 405 and unsigned POST 401 are recorded in v3 logs; version 2 remains the rollback point | Owner functional acceptance |

Checks performed:

- Exact English/Thai Search postback and keyboard-prefill assertions.
- Bare `search` / `ค้นหา`, desktop fallback, and unknown-postback regression
  coverage.
- Clean install from the committed lockfile — PASS using an isolated writable
  npm cache.
- `npm test` — PASS.
- `npm run verify` — PASS; harness `LEN 25129 / NODES 141`, static audit
  `0 blockers`, CSP hashes `6/6`.
- Runtime dependency audit — `0 vulnerabilities`.
- `npm run scan-secrets` — PASS immediately before commit/push.
- PR #43 merged to `main` as `ad3067f`.
- Production Function version 3 source parity — PASS; bundle SHA-256
  `d4ed04cad2935502009ca61275062bd3130752780179f0f099d76ed2a3ab51f6`.
- Version 3 smoke/security checks — GET 405 and unsigned POST 401; PASS.

Backup and rollback readiness:

- Supabase remains the production Data/Auth source of truth and is unchanged;
  no new backup is required for this non-destructive function-only release.
- GitHub branch/commit is the primary source and rollback audit trail.
- Google Drive remains supplementary planner recovery and is unchanged.
- Roll back by redeploying ACTIVE `line-todo-webhook` version 2.

Residual risk: LINE client support for automatic keyboard opening varies by
client/version. The deterministic instruction reply is the compensating
fallback and exposes no planner data.

## Historical full-integration audit

Historical audit date: 2026-07-30

Historical scope: LINE production activation, auth hotfix, bilingual command
menu, and `feature/line-task-details`

Historical decision at that gate: **CONDITIONAL** pending the then-unfinished
task-details production activation.

## 1. Functional correctness and data integrity — PASS for release candidate

- Full and Mobile publish only after a successful Drive upload, download, or
  content-confirmed reconciliation.
- LINE publication errors are contained and cannot reverse a successful Drive
  operation.
- Date commands use `Asia/Bangkok`; week boundaries are Monday–Sunday.
- The next-four-weeks filter uses an inclusive today/day-28 boundary and
  excludes overdue and completed tasks; High priority excludes completed tasks.
- Deterministic command, filtering, sort, cap, HMAC, and privacy tests pass.
- Snapshot v2 keeps the 240 KiB browser budget by truncating at task
  boundaries; PostgreSQL retains the 256 KiB hard limit.
- Task Flex cards cap visible Subtasks at five, attachment actions at three,
  tasks at twelve, and carousel JSON at 50 KiB.
- Google Drive remains independent of the webhook; the function cannot mutate
  planner tasks.
- Activation diagnostics prove the failed link attempt stopped in the browser:
  OAuth user lookup returned 200, no LINE PostgREST request was emitted, and all
  three LINE tables remained empty.
- The 3.77.1 regression test proves existing and refreshed Supabase sessions
  retain both required tokens in Full and Mobile.

Production gate: complete Full/Mobile Drive → Supabase → LINE round trips with
owner data.

## 2. UI, usability, and accessibility — PASS with live-device gate

- Full Sync Manager and Mobile Sync show link state, snapshot time, one-time
  code, copy action, refresh, busy state, and errors.
- The default English Flex menu works in LINE PC and mobile; linked mobile
  replies additionally carry nine Quick Reply actions. A static Thai/English
  switch does not require storing a language preference.
- The UI states that LINE is read-only and names fields excluded from the
  snapshot.
- Full and Mobile expose separate Subtask and HTTPS attachment-link opt-ins;
  both default to off and state that another Save to Cloud is required.
- Existing touch/button styling and focus behavior are reused.
- A visible signed-in profile is no longer accepted as sufficient auth evidence
  in testing; link-code acceptance must also produce a database row.

Production gate: verify code copy, expiry text, and error layout on the owner’s
iPhone and desktop browser.

## 3. Lean architecture and performance — PASS

- No AI, MCP server, vector database, cron, or new browser polling loop.
- A LINE query is one account lookup, one snapshot lookup, and one reply call.
  Task lists use one Flex bubble/carousel; status/help/empty results use text;
  successful linking contains two messages, below LINE's five-message limit.
- Snapshot is capped at 500 tasks / 240 KiB browser-side and 256 KiB in
  PostgreSQL; replies are capped at 12 tasks, 50 KiB per Flex carousel, or
  4,800 characters for text fallback.
- Supabase JS is version-pinned for the Edge Function.

Production gate: measure webhook p95 and reply success after activation.

## 4. Security and privacy — PASS with disclosed residuals

Controls:

- `x-line-signature` is verified with HMAC-SHA256 against the untouched raw body
  before JSON parsing.
- The public webhook has Supabase JWT verification disabled by design; invalid
  LINE signatures receive HTTP 401.
- Browser writes use the signed-in publishable client plus RLS
  (`auth.uid() = owner_id`).
- Storage redaction exempts only the exact Supabase Auth session key required by
  the SDK. Lookalike and ordinary keys still redact token/secret fields.
- One-time link codes use CSPRNG, store SHA-256 only, expire in 10 minutes, and
  are claimed atomically in a locked transaction.
- The claim function is `SECURITY DEFINER` with an empty `search_path`; execution
  is revoked from public/anon/authenticated and granted only to `service_role`.
- LINE and Supabase backend keys exist only in Function Secrets.
- Snapshot regression tests prove that profile/task/Subtask/attachment IDs,
  notes, descriptions, local files, base64 data, config, HTTP URLs, URLs with
  embedded username/password, and API-key fields are excluded. Only explicitly
  enabled, sanitised Subtask text/done state and HTTPS attachment-link metadata
  are allowed.
- Function errors do not log request bodies, LINE user IDs, task data, or
  secrets.
- All menu buttons are fixed message actions that resolve to the deterministic
  parser; they cannot inject a query, URL, user ID, or task field.

Residuals:

- Task title, status, due date, category, and priority are copied to Supabase and
  may be delivered into LINE chat history. Users must not treat either location
  as suitable for highly sensitive information.
- When enabled, Subtask text and HTTPS attachment URLs also enter Supabase and
  LINE chat history. A URI button opens user-provided content in LINE's in-app
  browser; the app validates HTTPS and rejects embedded credentials but cannot
  certify third-party content.
- The MVP does not persist LINE `webhookEventId`; a provider retry can attempt
  the same one-time reply twice. LINE reply tokens are single-use, so the second
  attempt should fail rather than duplicate a state change, but operational
  metrics should watch this.
- Account unlink is performed by re-linking to another LINE user or operational
  support; a self-service unlink control is not in this release candidate.

## 5. Reliability and recovery — PASS with provider gate

- Google Drive is not read from the webhook and stays available when LINE is
  down.
- Supabase snapshot publishing is secondary and fails visibly without failing
  Drive.
- Linking can recover from a stolen/incorrect code by creating a new code and
  re-linking the owner; the mapping remains one owner ↔ one LINE user.
- Database migration, function source, tests, and runbook are versioned in
  GitHub.
- Snapshot v2 migration is additive and accepts both v1/v2; it rewrites no
  planner rows. Rollback is the previous app/function commit while retaining
  the compatibility constraint.
- The failed activation wrote no LINE rows and changed no task/Drive data, so
  recovery needs a client redeploy and fresh login rather than a database
  restore.

Production gate: induce a Supabase snapshot error and a LINE reply error, then
confirm recovery and retry behavior.

## 6. Connectivity and operations — CONDITIONAL / partially activated

- Local build/package CSP passes, static audit reports 0 blockers, and all
  existing plus LINE regression tests pass.
- `supabase/config.toml` pins the project and declares the public webhook
  verification mode.
- Deployment order and rollback are documented in
  `docs/LINE_OFFICIAL_SETUP.md`.
- Completed in production: logical backup acceptance, migration, Function
  Secrets, Edge Function deployment, and successful LINE webhook verification.
- The activation stop was detected during owner acceptance before a link code
  or snapshot entered Supabase.

Remaining production items:

1. Create and verify a fresh logical Supabase backup.
2. Apply and verify migration `20260730031026_line_task_details_snapshot_v2.sql`.
3. Review and merge the stacked pull requests only after explicit owner
   approval.
4. Redeploy `line-todo-webhook` and the Full/Mobile app only after separate
   explicit deploy approval.
5. Verify the English Flex menu in LINE PC and the Quick Replies in LINE
   iOS/Android; switch to and from Thai.
6. Verify Subtask display, all three HTTPS attachment kinds, opt-out behavior,
   and local-file exclusion with owner data.
7. Complete the expanded command and day-0/day-28 boundary acceptance set.
8. Exercise an invalid-signature request and induced provider failures.
9. Re-run this audit with live evidence and change the decision explicitly.

## Verification evidence

- `npm test` — existing Drive/UI regressions plus:
  - `build/line-bot.test.mjs`
  - `build/line-sync-browser.test.mjs`
  - `build/auth-storage-security.test.mjs`
  - `build/line-contract.test.mjs`
- `npm run verify` — Vite build, jsdom harness, six-dimension static audit,
  generated package, and 6/6 CSP hash verification.
- `npm run scan-secrets` — required again immediately before commit/push.
