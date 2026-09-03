# Changelog

## Unreleased — Stage 5A no-migration cloud conflict safety — 2026-09-02

- Full local-file conflict → **Keep what is on Drive** now revalidates the
  selected Drive revision/content, uses an ETag write precondition, and reopens
  the conflict rather than overwriting a newer cloud save.
- After Drive accepts a merged LINE mutation, Full retains the exact payload and
  IDs as a completion checkpoint; an ambiguous completion response retries only
  the idempotent queue update and never falls back to stale cloud bytes.
- Mobile persists a temporary post-upload checkpoint containing the exact
  payload/IDs/rejections. Reload or retry completes those IDs without preparing
  or applying the mutation a second time, then adopts the exact uploaded payload.
- Mobile preserves the downloaded cloud profile language, and Full/Mobile report
  earlier rejected mutations even when upload or completion later fails.
- Added stale-Drive, completion-response-loss, completion-only retry, language,
  rejection, success and failure coverage plus Full/Mobile static contracts.
- Closed the `importUseCloud` backlog gap and strengthened the
  `LINE-CLOUD-ADOPT-1` recurrence-prevention rule.
- Source-only candidate: no Database, migration, Storage, Auth, RLS, provider,
  secret, backup, deployment, merge, activation, reconciliation or Production
  operation is included.

## Unreleased — L0b normalized data foundation — 2026-08-20

- Added an unapplied nine-table Supabase migration with owner-composite foreign
  keys, SELECT-only RLS, explicit default-privilege revocation, stable source
  identity, lease/generation fencing, exact-byte chunk idempotency, server-side
  reconciliation, and tombstone/reactivation semantics.
- Added one explicit manual import control to Full and Mobile. It is isolated
  from Save to Cloud, Auto-sync, LINE snapshots, and mutation handling; Google
  Drive remains authoritative.
- Added throwaway PostgreSQL 17 lifecycle/security tests, static SQL scope
  checks, and browser exact-byte/projection tests.
- No migration, backfill, data copy, merge, deployment, dependency, lockfile,
  provider, secret, LINE, Netlify, or Google Drive change is authorized by this
  source increment.

## Unreleased — confirmed LINE changes and 10-week search — 2026-08-02

- Added Confirm/Cancel guarded Add/Edit/Delete commands queued separately from
  the read-only LINE snapshot. `add <title>, DD-MM-YYYY` defaults to Personal,
  General, and Medium; Work and Event use explicit prefixes.
- Full and Mobile apply confirmed commands only during a successful Google
  Drive save, then mark each queued command applied.
- Mobile keeps queued commands out of its live/local state until the Drive
  upload succeeds; a conflict, pull, or failed upload leaves the queue pending.
- Mobile resolves cloud-ahead state before preparing queued operations, so a
  pending LINE change does not appear locally or trigger a false conflict dialog.
- Changed ISO week search to include the requested week plus nine following
  weeks; results include both Tasks and Events unless explicitly scoped.

## Unreleased — 3.77.2 LINE task details — 2026-07-30

### Added

- LINE task results are Flex cards with title, due date, project/category,
  priority, status, and optional Subtasks.
- Each card shows up to five Subtasks with done state and a remaining-count
  indicator.
- Up to three user-approved HTTPS attachment links per task are rendered as
  URI buttons for links, pictures, and videos. LINE for PC receives the same
  desktop URI.
- Full and Mobile settings now provide separate opt-in controls for Subtasks
  and HTTPS attachment links. Both are off by default.

### Privacy and compatibility

- Snapshot schema v2 includes only sanitised Subtask text/done state and
  HTTPS-link metadata. Raw task/Subtask/attachment IDs, notes, descriptions,
  local files, base64 data, URLs with embedded username/password, HTTP links,
  and secrets stay out.
- Snapshot size is capped at 240 KiB by truncating at task boundaries instead
  of failing a successful Google Drive save.
- Migration `20260730031026_line_task_details_snapshot_v2.sql` accepts both
  schema v1 and v2 during staged rollout and does not rewrite existing rows.
- The Edge Function reads both versions. Results fall back to text if a Flex
  payload cannot remain under LINE's 50 KiB carousel limit.

### Deployment

- Required order: fresh Supabase logical backup → apply migration → redeploy
  `line-todo-webhook` → deploy Full/Mobile app → owner acceptance.
- No production migration, merge, function deploy, or app deploy is performed
  by this branch without explicit approval.

## Unreleased — LINE bilingual command menu — 2026-07-30

### Added

- An English-first Flex Message command menu that works in LINE for PC and
  mobile. It is sent automatically after a successful account link and can be
  opened again with `menu`.
- A Thai menu opened with `เมนู`, plus an English/Thai switch action in both
  menus.
- Eight mobile Quick Reply actions on linked task replies, within LINE's
  13-action limit.
- Deterministic `next 4 weeks` / `4 สัปดาห์ข้างหน้า` and `high priority` /
  `งานสำคัญ` filters. The four-week range includes today through day 28 and
  excludes overdue and completed tasks.

### Safety and deployment

- No database schema, planner snapshot, Google Drive, AI, MCP, or push-message
  behavior changed. The update is limited to the existing read-only Edge
  Function.
- Boundary, language, Flex/Quick Reply action, message-limit, HMAC, privacy, and
  existing command regressions are covered before handoff.
- Production requires a reviewed redeploy of `line-todo-webhook`; this branch is
  not deployed by the pull request itself.

## Unreleased — 3.77.1 Supabase auth storage hotfix — 2026-07-29

### Fixed

- The security bootstrap no longer erases `access_token` and `refresh_token`
  from the exact Supabase Auth session storage entry. That erasure left the
  visible Google profile intact while making `auth.getClaims()` fail, so
  creating a LINE link code incorrectly asked the owner to sign in again.
- Full and Mobile now preserve only
  `sb-qjaywadzvwvcspdsjxth-auth-token`. All other storage entries, including
  lookalike keys, continue to redact token- and secret-shaped JSON fields.
- Full and Mobile CSP hashes and build metadata were refreshed for the changed
  shipped scripts.

### Verified

- `build/auth-storage-security.test.mjs` covers sessions already present at
  bootstrap, later token refreshes, ordinary storage redaction, nested secret
  fields, and exact-key bypass resistance in both builds.
- `npm test`, `npm run verify`, the packaged CSP self-check, and
  `npm run scan-secrets` pass.

### Deployment

- Merged to `main` in `5d5b50c`; owner acceptance subsequently produced a
  linked LINE reply. The LINE command-menu update above remains a separate Edge
  Function release.

## Unreleased — LINE Official read-only bot — 2026-07-28

### Added

- LINE Official account linking with a hashed, single-use 10-minute code.
- Deterministic Thai task commands backed by a Supabase Edge Function; no AI or
  MCP runtime.
- Privacy-minimised Supabase snapshots after successful Google Drive sync in
  both Full and Mobile.
- RLS migration, raw-body LINE HMAC verification, release runbook, KPI, 6D audit,
  and regression tests.

### Security

- LINE channel/access secrets and Supabase backend keys remain Function Secrets;
  browser code uses only the existing publishable Supabase client.
- Snapshots exclude notes, descriptions, attachments, config, tokens, API keys,
  and local profile/task IDs.
- The logical backup, migration, Function Secrets, Edge Function deployment,
  and LINE webhook verification are complete. Client owner acceptance is
  blocked on the 3.77.1 auth-storage hotfix above.

## 3.81.0 — Save to Cloud, in the header, with a confirm — 2026-07-26

`APP_VERSION` unchanged. Asked for as: *"move the Save to Cloud button out onto the top
menu so it is more clearly visible, and it needs a yes/no confirm so the user is sure
first."*

### Added

- **Save to Cloud in the header row.** It was three taps deep — ⋯ More → Sync Manager →
  scroll — for the one action that stops work being stranded on one device. Not a fifth
  floating corner button: that column already collided with itself once. It sits beside
  the sync chip, carries the word "Save" even on a phone, and is **amber when this screen
  holds something Drive does not, green when it does not** — so the header answers whether
  it needs pressing before it is pressed.
- **A yes/no confirm.** It names the file, states which of the two situations you are in,
  and says that a save may **stop and ask** rather than overwrite — otherwise "Yes" reads
  as "yes, overwrite whatever is there", which is not what happens.

### Changed

- **The Sync Manager's Save to Cloud goes through the same confirm.** Two buttons with one
  label behaving differently depending on where they were pressed is a trap for the user
  and for anyone reading the tests; the test helpers now answer the confirm as part of
  "pressing save".

### Verified

- Real Chromium at 390×844: no horizontal page scroll with the button added, the button is
  inside the viewport, ≥40px on both axes, unoccluded, amber with a pending change; the
  confirm fits the screen unclipped with both buttons ≥44px and receiving their own taps;
  **"No" uploads nothing and closes**, "Yes" uploads.
- jsdom, in `npm test`: the header button exists before the panel is ever opened, asking
  uploads nothing, "No" uploads nothing, "Yes" uploads.
- One probe assertion had to be corrected first: `document.body.textContent` includes the
  inline `<script>` bodies, and the bundle contains the literal string `"Save to Cloud?"`,
  so a body-text search finds the confirm whether or not it is rendered. The check now
  asks the DOM for a rendered fixed overlay.

### Known, not fixed here

- With both top banners showing, **"Back up now" overlaps "💾 Save Now"**. Reproduced
  identically on the pre-change build, so it predates this work; it is excluded from the
  header-overlap check by name rather than allowed to mask a new overlap.

## 3.80.0 — Check now: matched or not, by the data — 2026-07-26

`APP_VERSION` unchanged. Asked for as: a refresh button that says whether the screen and
the cloud differ, a re-check every 10 s while they do, on phone and PC alike, and both
sides changed handled by the standard already agreed.

### Added

- **🔄 "Check now — matched or not?"** in the Sync Manager, above Save to Cloud, 44px
  tall. It downloads the cloud file and compares the actual data. Matched says so and
  stops; a one-sided difference is synced in that direction; a two-sided difference goes
  to the existing conflict dialog, which keeps the losing copy as a conflicted copy
  (3.79). **A check never writes on its own account.**
- **A matched/unmatched line that means it.** The line above it —
  `✓ Google Drive has what is on screen` — is stamp bookkeeping: it answers "did *this*
  device upload its own latest edit" and is blind to another device's save. The new line
  appears only once a check has run, so it never claims to know something it has not
  looked at.
- **A 10 s poll** while auto-sync is on and the tab is visible: `getMeta` only, with the
  download reserved for when the metadata says the file moved. Before this, another
  device's save was noticed on focus/`visibilitychange` or 15 s after a local edit, so a
  device left open on a desk noticed nothing at all. It stops when auto-sync is off —
  that switch means "manual only" and a poll would make it a lie — when the tab is
  hidden, and while a decision dialog is open.
- `build/sync-content-check.test.mjs`.

### Fixed

- **A difference no code path could previously see.** When the content differs but both
  stamps say nothing moved, every existing path believed the stamps and reported "already
  up to date". Content comparison finds it; and since content equality cannot say which
  *way* a difference points, that case raises the conflict dialog rather than guessing —
  picking a direction there means guessing whose work to destroy.
- **The stale ⚠ on a device that was genuinely in sync.** If the content matches, the
  check heals `lastPushedStamp` / `lastCloudModified`, so the panel stops insisting a
  synced device is unsynced. Verified to upload nothing while doing it.

### Notes

- `COMPARED_KEYS` is deliberately a subset of the payload. Excluded: `savedAt` and
  `dataLastUpdated` (clocks, not content), `appVersion` (two devices on different builds
  are not out of sync), `fileName`, `profile` (ids are minted per device even for the same
  synced file), `tabReads` and `activity` (per-device). Including any of them would make
  "matched" unreachable, and a permanent false alarm is worse than no readout.
- **3.78 is unchanged**: a cloud change with nothing unsaved here still applies itself
  without asking. The request also described pressing a notification before the screen
  changes, which would undo that; the press is kept for the only case where something can
  be lost, which is the conflict dialog that already exists.

### Verified

- 116 assertions across eight files, up from 93. The load-bearing one is a round trip:
  save, serve the uploaded bytes back as the cloud file, check — matched, with no further
  upload. A hand-built "matching" fixture cannot catch `savedAt` leaking into the
  comparison; only a real save/download cycle can.
- The two poll blocks are each other's control: auto-sync on must reach Drive with nobody
  pressing anything, auto-sync off must not reach it at all.
- Harness `LEN 25129 / NODES 141` unchanged, `audit.py` 0 blockers, packager 6/6 CSP PASS,
  es2019 guard `??` 0 and `?.[` 0.

## 3.79.1 — date fields are pickable on a phone — 2026-07-26

`APP_VERSION` unchanged. Reported from an iPhone as *"cannot pick a date in any field that
needs a date"*, with a screenshot showing the numeric keypad open over a half-typed `9`.

### Fixed

- **The native date picker could not be tapped.** `DateInput` backs all 16 date fields in
  the app, and its `<input type="date">` was `20×20` with `pointerEvents: "none"` — so the
  only route in was `showPicker()`, driven by a 📅 button measuring about 20px wide
  (`fontSize: 13` plus 2px of padding) pressed against a full-height text input. Apple's
  minimum tap target is 44. A near miss lands on the text field, and iOS answers with the
  keypad, which is exactly the reported screenshot.

  Measured in real Chromium at 390×844, before and after:

  | | before | after |
  |---|---|---|
  | `input[type=date]` | 20×44, `pointerEvents: none` | **44×44, `pointerEvents: auto`** |
  | centre of the target hits | the 📅 `BUTTON` | **`INPUT[date]`** |
  | tap area | 890px² — **46% of Apple's minimum** | **1936px²** |
  | typing still works | yes | yes |

  The date input is now the tap target itself, so the picker opens through ordinary tap
  handling on every iOS version rather than depending on `showPicker()`, which Safari came
  to late and which throws on inputs it treats as unrendered. `showPicker()` is still
  called on click, because desktop Chrome opens the picker only from its own calendar
  glyph — invisible here — and not from the text area. The 📅 is now a
  `pointerEvents: "none"` span: exactly one hit-testable layer in that 44px, since two is
  what produced the original miss.

### Added

- `build/date-picker-target.test.mjs` — guards `pointerEvents`, the 44px width, that the
  overlay spans the field, that the 📅 is decoration rather than a second target, and that
  the text input reserves enough right padding that typed text cannot slide underneath.
  Run against the pre-fix bundle it reports 8 failures, so it bites. It also asserts that
  date fields were actually found, because an empty list would make every other assertion
  pass by having nothing to check.

## 3.79.0 — the copy that loses is kept, Dropbox-style — 2026-07-26

`APP_VERSION` unchanged. Asked for as: *"make it like Dropbox, and check iPhone also."*

### Added

- **The side that loses a sync conflict is uploaded to Drive instead of being deleted.**
  `<master> (conflicted copy from this device|Google Drive YYYY-MM-DD HH-MM).json`, filed
  in the master file's own folder. Dropbox writes `file (conflicted copy).ext`, OneDrive
  offers **Keep both**, Joplin creates a conflict note; this app discarded the loser and
  told the user, at the moment of the overwrite, that they should have taken a backup
  first. All four destructive answers now write the copy: taking the cloud copy or
  overwriting the cloud, from either the "Both copies changed" dialog or "Save needs a
  decision".

  **The copy goes up before anything is destroyed, and a failure to write it cancels the
  destruction.** A copy written afterwards would be missing from exactly the run where
  writing it is what failed. Tested with a 500 on the create: nothing applied, nothing
  uploaded, error surfaced.

### Fixed

- **"Save needs a decision" was unanswerable when raised from the Sync Manager.** The
  dialog was `zIndex: 6000`; the Sync Manager panel that hosts the **Save to Cloud**
  button is `9700`. Measured in Chromium at 390×844, all three of the dialog's buttons
  came back covered by the panel's own content — the one ask in the whole sync flow, and
  a tap could not reach it. Now `9850`. The sibling conflict dialog was already `9800`,
  above the panel, which is why this only ever affected this one.

### Changed

- The confirm step no longer says *"This cannot be undone from here."* It names the
  conflicted-copy file and says the copy is kept. Its panel is amber and headed **"This
  leaves the screen:"** rather than red and **"This will be discarded:"** — a red danger
  box that is not dangerous teaches people to click through red boxes. `keepsLoser` is a
  prop defaulting to `false`, so the disk-import dialog (which keeps no copy) still tells
  the truth.
- The footnote on "Save needs a decision" no longer claims *"'Later' is the only one that
  loses nothing"* — it stopped being true once the loser started being kept.

### Verified

- 82 test assertions across six files, up from 65. Sixteen new ones cover the conflict
  copy: its name, that it has no `/` in it, that it holds the work that left the screen,
  that it lands beside the master, that the master is not touched on a pull, that the copy
  precedes the overwrite, and that a failed copy destroys nothing.
- Real Chromium at 390×844 (iPhone 14), against the packaged `index.html`: both conflict
  dialogs and the confirm step reached, no horizontal page scroll, every card inside the
  844px screen and not internally clipped, and every button ≥44px tall **and receiving its
  own tap** via `elementFromPoint` — the check that caught the z-index bug, which bounds
  checks alone had passed.
- Harness `LEN 25129 / NODES 141` unchanged, `audit.py` 0 blockers, packager 6/6 CSP PASS,
  es2019 guard `??` 0 and `?.[` 0.

## 3.78.0 — another device's save applies itself — 2026-07-26

`APP_VERSION` unchanged. Reported as: *"if another device saved, changes will apply
automatically to the local storage file of the web browser. No need to ask immediately,
ask at the next sync — auto-sync can be set as before."*

### Changed

- **A cloud change with nothing unsaved on this device is now applied automatically, with
  no dialog.** It reached a modal whose own first line read *"This device has no unsaved
  edits, so updating is safe — but it is your call."* A prompt that can explain why the
  answer is obvious should not be a prompt. Both paths take this: the auto-sync reconciler
  (which also runs on focus and `visibilitychange`) and an explicit **Save to Cloud**
  press. The toast reads "Updated from cloud — another device saved".

  This is not a return to the pre-3.75 behaviour the dialog was added to stop. Then, *any*
  cloud change was applied silently, including one that overwrote unsaved local edits. The
  collision case is tested first and still asks — that ordering is what makes this safe.

- **The dialog now only appears for a real collision**, so its wording no longer has to
  hedge: titled **"Save needs a decision"** (not "Both copies changed", which is
  `gsyncConflict`'s title for the same situation on the auto-sync path), and it states
  that this device has changes not on Drive yet.

- **"Update now" is no longer green, and reads "Take the cloud copy".** Green said *safe*,
  and it was, while the dialog also covered the no-local-edits case. Reaching it now means
  discarding this device's unsaved changes, so both directional answers lose something and
  neither gets the reassuring colour. The footnote says exactly what each one discards, and
  that "Later" is the only one that loses nothing.

- **The Auto-sync caption says both halves of what it does** — "Saves to Cloud ~15s after
  each edit, and brings in another device's save". The incoming half used to stop at a
  modal, so leaving it unmentioned was fair; it no longer does. The toggle itself is
  unchanged.

### Tests

`build/sync-push-stranded.test.mjs` grew two blocks and reworked one, 65 assertions across
six files:

- *cloud moved, nothing unsaved here* — no upload, **no dialog**, the cloud copy lands in
  browser storage, and the toast says so.
- *cloud moved AND local has unsaved edits* — no upload, the local task is **still in
  storage**, and the dialog offers both directions.
- *auto-sync, cloud moved, nothing unsaved here* — nobody presses anything: the tab
  regains focus and the other device's save arrives on its own. The Save-press blocks
  cannot cover this, because they go through `gsyncSaveNow` rather than `gsyncNow`.

Two notes on how the old assertions failed to catch this, both recorded in the test file:
the block asserting the modal **passed for the wrong reason** after the change, because
the new toast contains "another device saved" and matched the old `/Another device saved/i`
probe; and a DOM probe for "was it applied?" passes either way, since the task list is not
rendered while the Sync Manager is open — so it now reads browser storage.

Harness **LEN 25129 / NODES 141 unchanged**, `audit.py` 0 blockers / 3 warnings, packager
6/6 CSP PASS, es2019 guard clean, secret scan clean.

## 3.77.0 — a save stamps the moment it saves — 2026-07-26

`APP_VERSION` unchanged. Follow-up correction: *"when I press Save to Cloud = refresh
time for this browser, time of this browser should = updated as of now. Also Google Drive
saved using same data that shows on screen now. But the local file on disk is for backup
purposes only, it could be saved manually anytime."*

### Changed

- **`dataLastUpdated` now means "when this browser last saved", not "when the data
  changed".** The old meaning was technically defensible and made the screen lie: pressing
  Save to Cloud left `💾 This browser  19 hr ago` beside `☁️ Google Drive  3 min ago`,
  which is indistinguishable from a save that failed.

  `pushPayload()` is now the single place a save's timestamp is decided, and that one
  value goes to three places on every successful upload — the payload field,
  `dataLastUpdated`, and `lastPushedStamp`. They cannot drift apart, and the verdict turns
  green the instant the save lands. Applied to all five upload paths.

- **Both rows use the same verb, because they are meant to match.** `saved · <time>` on
  each. A browser time ahead of the Drive time now means one thing only — this screen
  holds changes that are not on Drive — and the footnote says exactly that instead of
  explaining that the two are incomparable.

  | before | after |
  |---|---|
  | 💾 This browser · edited … | 💾 **This browser · saved** … |
  | ☁️ Google Drive · file written … | ☁️ **Google Drive · saved** … |
  | ✓ Google Drive has this version | ✓ **Google Drive has what is on screen** |
  | ⚠ this version is not on Drive yet | ⚠ **not saved to Drive yet** |

- **The file on disk is described as a manual backup and nothing more** — it does not
  update when you edit, Auto-sync never touches it, nothing depends on it, and you can
  save one whenever you want or never.

### Verification

`build/sync-push-stranded.test.mjs` asserts the chain end to end: the upload is stamped
with the moment of the save, `lastPushedStamp` matches it, the browser time is refreshed
to it, and the uploaded file body carries the same value. Two of its earlier assertions
expected the *old* meaning (the upload carrying the older edit stamp) and were inverted,
with the reason recorded in the file.

`build/sync-visibility.test.mjs` now asserts no surface says "edited" at all, and that the
disk box is described as a manual backup.

Harness LEN 25129 / NODES 141 unchanged, `audit.py` 0 blockers, packager 6/6 CSP PASS,
es2019 guard clean, `npm test` 55 assertions across seven files, secret scan clean.

## 3.77.0 — Save to Cloud means save — 2026-07-26

`APP_VERSION` unchanged. Two corrections, both from the same observation: *"the browser
internal mem is the current one showing on the screen, so when I click Save to Cloud it
means I ask to save whatever shows on the screen to the Google Drive file. But now it is
not working like that."*

### Fixed

- **The button labelled "Save to Cloud" was not a save.** It called `gsyncNow`, a two-way
  reconciler that compares both sides and may answer "Already up to date — nothing to
  upload". That is right for auto-sync and for the focus/visibility checks; it is wrong
  for a button a person deliberately pressed, and it answers a question the user did not
  ask. New `gsyncSaveNow` writes what is on screen to Drive **unconditionally**.

  It refuses exactly one thing: a cloud file that moved since this device last looked,
  because uploading over it loses another device's work. That raises the existing
  direction dialog, where *keep this device and overwrite the cloud* completes the save.
  `gsyncPush` was not usable for this — it uploads with no cloud check at all.

  `gsyncNow` still drives auto-sync, focus and visibility, where reconciling is correct.

- **"This browser · edited" claimed something that can be false.** `dataLastUpdated`
  travels *with the data*: opening a file seeds it from the file's own stamp, so a profile
  opened from Drive carries the time whichever *other* device did the editing. The label
  implied you edited it here, and sitting next to Drive's `modifiedTime` it invited a
  comparison between two different kinds of time. Renamed across all three surfaces:

  | before | after |
  |---|---|
  | 💾 This browser · edited … | 💾 **On screen now · data version** … |
  | ☁️ Google Drive · file written … | unchanged, now explicitly `·`-separated |
  | ✓ cloud has this data | ✓ **Google Drive has this version** |
  | ⚠ not uploaded yet | ⚠ **this version is not on Drive yet** |

  The footnote now says the stamp comes from whichever device last edited the data and
  does not move just because you opened the app.

### Verification

`build/sync-push-stranded.test.mjs` asserts the new contract in both directions:

```
--- nothing changed locally: save must still write to Drive ---
  ok   Save to Cloud uploads even with no local change
  ok   and reports a save, not a no-op
  ok   the cloud-file stamp moves forward

--- cloud moved since this device last looked ---
  ok   does NOT silently overwrite a newer cloud copy
  ok   asks which copy to keep instead
```

The second block is the guard: "always upload" must not become "always clobber".

`build/sync-visibility.test.mjs` gains an assertion that no surface claims this browser
did the editing. Harness LEN 25129 / NODES 141 unchanged, `audit.py` 0 blockers, packager
6/6 CSP PASS, es2019 guard clean, `npm test` 50 assertions across seven files.

## 3.77.0 — three data locations, named — 2026-07-26

`APP_VERSION` unchanged. From the question: *"we have 3 data locations — 1. cloud on
Google Drive 2. internal memory of web browser 3. file saved on local drive. Am I
correct? We need to make this clear on UI/UX."* Correct, and the panel showed two.

### Fixed

- **Browser storage was displayed as a file that does not exist.** The second box was
  headed `💻 This device (local)` with `📄 My-Todo-Planner1.json` under it — a name
  mirrored from Drive, for something that has no filename — while its own caption said
  "Data lives in this browser". Two genuinely different places therefore looked like one.
  It is now `💾 This browser — live data`, with no filename, showing when the data last
  changed and stating plainly that it is storage inside the browser which clearing site
  data removes.
- **The file on disk was missing from the panel entirely**, although the app can both
  read and write one. It has its own box now: name, when it was saved, Save a copy /
  Open a file, and the warning that matters — a snapshot does **not** update when you
  edit, and Auto-sync never touches it.
- **One name per location, everywhere.** The stamps block said "📱 This device" while the
  box below said "💾 This browser" for the same value. Panel, desktop File menu and chip
  tooltip now all use ☁️ Google Drive / 💾 This browser / 📄 File on disk.
- **Locations 2 and 3 render above the signed-in gate.** They have nothing to do with
  Google, and "where is my data?" is asked most often by someone who is not connected —
  who previously saw only a Connect button.
- **Linking a file no longer leaves it "never checked" forever.** `gsyncRelink` and
  `onLinkFile` clear `lastSyncAt`/`lastCloudModified`/`lastPushedStamp` deliberately, so
  that pointing at a file you have never compared raises a conflict rather than silently
  overwriting it — but nothing then triggered that comparison. The panel sat on
  `Cloud file: never / Last checked: never` with no way out but to guess and press Save
  to Cloud. Both paths now reconcile immediately after linking. This is the state in the
  reported screenshot.

### Verification

Harness LEN 25129 / NODES 141 unchanged, `audit.py` 0 blockers, packager 6/6 CSP PASS,
es2019 guard clean, `npm test` 39 assertions across seven files, secret scan clean.

`build/sync-visibility.test.mjs` gains assertions that all three locations are named
distinctly, that browser storage is described as storage rather than a file, that the
disk box carries its does-not-update warning, that no mirrored filename reappears under
browser storage, and that the ambiguous "This device" label is gone.

## 3.77.0 — Save to Cloud actually saves — 2026-07-26

`APP_VERSION` unchanged. Found because the sync times added in the previous entry made
it visible: the Sync Manager showed

```
📱 This device    18 hr ago · 08:00 PM
☁️ Cloud file     18 hr ago · 07:57 PM
✓ Already up to date — nothing to upload
```

Local data three minutes newer than the cloud file, and the button refused to upload it.

### Fixed

- **"Save to Cloud" could permanently refuse to upload newer local data.** The push
  decision was `dataLastUpdated > lastSyncAt + 1500` — "did the data change since we last
  *checked*" — which is not the same question as "is this device's data newer than what
  is in the cloud file". The "nothing changed" branch re-stamps `lastSyncAt` on every
  check, so the moment `lastSyncAt` got ahead of `dataLastUpdated` the pending edit became
  invisible, and every further check pushed `lastSyncAt` further out. A self-reinforcing
  trap: the newer data could never leave the device, on any platform, and pressing the
  button only made it worse.

  The decision is now `dataLastUpdated !== lastPushedStamp`, where `lastPushedStamp` is
  the stamp that was last **successfully uploaded**. Both values come from this device's
  own clock, so there is no drift against Google's `modifiedTime` and no tolerance window;
  a failed upload leaves it unchanged, so the push retries until it lands. Recorded at
  every one of the six paths that upload or receive.

  Existing installs carry no `lastPushedStamp`, which counts as "needs a push" — that is
  deliberate, and it is what releases data already stranded. Safe, because a cloud that
  also moved makes `cloudChanged` true and the conflict dialog asks first.

- **Receiving a payload no longer stamps it "now".** `applyPayloadLive` set
  `dataLastUpdated` to the current time, so a copy that had just come down looked newer
  than its own source and the next sync pushed it back up — the bounce the old 1500ms
  tolerance existed to hide. It now takes the stamp from the payload, the same rule the
  file-open path already follows.

### Verification

`build/sync-push-stranded.test.mjs` rebuilds the exact reported state — local 08:00 PM,
cloud 07:57 PM, `lastSyncAt` ahead of both, no `lastPushedStamp` — drives the real UI
(header chip → Connect → Save to Cloud) against a stubbed Drive that records every write,
and asserts an upload happens carrying this device's data and its edit stamp. It also
asserts the opposite case does **not** upload, so a no-op save cannot thrash the cloud
file. **Against the previous commit it fails with "it reported 'Already up to date —
nothing to upload' and sent nothing"** — the reported symptom, reproduced.

Harness LEN 25129 / NODES 141 unchanged, `audit.py` 0 blockers, packager 6/6 CSP PASS,
es2019 guard clean, `npm test` 34 assertions across seven files, secret scan clean.

## 3.77.0 — you can see when it synced — 2026-07-26

`APP_VERSION` unchanged. Reported as: the cloud file's last sync time is nowhere to be
found, and the data in the JSON does not match the session synced on the PC.

Four separate causes, all in how the state was *shown* rather than how it was computed.

### Fixed

- **No surface printed a wall-clock time.** Every one of the three — `SyncPanel`,
  `CloudSyncModal`, the desktop File menu — carried its own copy of a relative-age
  formatter, and the only absolute form was `toLocaleDateString()` past 24 hours, which
  drops the clock. So "what time did it sync?" was literally unanswerable. One
  `syncStamp()` now serves all of them and prints both: `5 min ago · 14:32`.
- **A phone had no sync status at all.** The dot, file name and last-sync line lived
  only in the desktop File menu, which is not rendered below 1024px; the only way in was
  ⋯ More → Sync Manager, two taps deep, and still relative-only. There is now a tappable
  chip in the compact header — the same gap, and the same fix, as the version chip.
  It carries its own interval, because an age with nothing to re-trigger it freezes at
  whatever it said when the surface opened.
- **The three times were never shown together.** "When this device changed", "when the
  cloud file changed" and "when the two were last compared" are different facts, and a
  mismatch between devices is only visible when they sit side by side. `SyncPanel` and
  the File menu now list all three. `lastCloudModified` was already in state, so this
  costs no extra Drive request — and the block renders **above** the signed-in gate,
  since those stamps are local history and the question gets asked precisely when you
  are not connected.
- **Opening a file from Drive threw away its edit stamp.** `applyOpenedFile` wrote
  sixteen keys for a new profile but not `DATA_UPDATED_KEY`, and nothing read
  `parsed.savedAt` back, so a profile opened from Drive came up with a blank "Data
  updated" even though the file states when its contents last changed. It now seeds from
  `parsed.dataLastUpdated || parsed.savedAt` — written raw, since that key holds a bare
  ISO string. A file opened *from* Drive also keeps the file's stamp rather than being
  marked "now", which would make the copy that just came down look newer than its own
  source and push it straight back up.

### Added

- `dataLastUpdated` in the saved payload. `savedAt` records when the file was
  **written**; this records when the data inside it last **changed**. Without it a file
  could not say how old its contents were, only how old the upload was. Additive — the
  format stays version 7 and older readers ignore it.
- `build/sync-visibility.test.mjs`, in `npm test`. Seeds a profile already linked to a
  cloud file with three deliberately different stamps and asserts the chip exists on a
  390px header, shows a clock time *and* an age, names the file, carries all three times
  distinctly, and opens a panel that lists them together.

### Note

Whether two devices hold the same data is a separate question from whether the UI can
show it. If Drive contains more than one backup, a device that picked a different file
from the list is simply linked elsewhere — compare the `📄` file name on both. This
change makes that comparison possible; it does not merge anything.

## 3.77.0 — a secret scanner in the repo — 2026-07-26

`APP_VERSION` unchanged. CI and tooling only — `index.html` is byte-identical.

### Added

- **`build/secret-scan.mjs`**, run by CI on every PR and by `npm run scan-secrets`.
  A Google API key reached this public repo twice in one week, the second time through
  the GitHub web editor. Push protection now blocks that at the door, but it is an
  account setting that can be switched off and it never sees an unpushed commit — this
  check lives in the repo instead.

  Patterns are narrow by design: Google API keys, PEM private-key blocks, AWS access
  key ids, GitHub tokens, Slack tokens, and `sk-`-prefixed keys. Nothing broader,
  because the repo ships a Google OAuth **client ID** on purpose — a public identifier
  for a frontend OAuth flow — and flagging it would leave CI permanently red, which is
  how a check gets deleted.

  `--selftest` asserts both directions and runs before the scan in CI: six patterns
  each catch a synthetic credential, and four intentionally-public strings (the client
  ID, a `sha512-` lockfile hash, the Supabase project URL, and the word "skip") are
  still ignored. Verified against the real incident too — the scanner finds the key in
  commit `7740041`, and a synthetic key added to a tracked file makes the CI step exit 1
  with a `::error file=…,line=…` annotation.

### Changed

- `actions/checkout` and `actions/setup-node` bumped v4 → v5. v4 runs on the Node 20
  action runtime GitHub is retiring, and every run logged a warning saying it was being
  forced onto Node 24 regardless. The app still builds on Node 20 per
  `package.json` engines.

## 3.77.0 — opening a Drive file on first run — 2026-07-25

`APP_VERSION` is unchanged. Reported as "เปิด file json ที่อยู่บน google drive ไม่ได้"
from the welcome screen on an iPhone.

### Fixed

- **"Open from Google Drive" on the welcome screen now actually opens a file.** It was
  a dead end. The onboarding gate is an early `return` near the top of `App`, above
  every modal and panel in the component, and the handler was `connect, then
  setGsyncPanel(true)` — switching on a panel that is not mounted on that path.
  Signing in did not create a profile either, so the gate re-rendered and took the same
  early return. A **successful** Google sign-in was therefore indistinguishable from a
  failed one: the screen did not change by a single character. The gate now lists the
  user's Drive files itself, downloads the one that is picked, creates the profile from
  it, and links it for sync.
- **A failed sign-in says so.** The gate rendered no error, and `gsyncConnect` only ever
  wrote to `gsyncError`, which is read by `SyncPanel` and `CloudSyncModal` — neither of
  which exists on this path. A blocked popup, a cancelled consent screen, a content
  blocker and a timeout all looked identical to nothing happening. The message now
  appears on the gate with a retry button.
- **An empty file list explains itself.** `drive.file` scope means the app can only see
  files it saved itself, so a `.json` uploaded to Drive by hand is invisible to it — the
  single most likely reason for an empty list, and previously indistinguishable from a
  broken app.
- **The Drive link is stored under the right profile.** Linking after
  `applyOpenedFile` would have used `pk()` from a closure where `activeProfileId` is
  still `null`, writing the link — and, via `patchConfig`, a `DEFAULT_CONFIG` blob over
  the file's own settings — to the bare unscoped key. Both are now written with the
  profile's other keys *before* the profile switch, which is the only point where they
  cannot lose a race against the `[activeProfileId]` load effect.

### Verification

Harness LEN 25129 / NODES 141 unchanged (the gate is not on the harness's render path),
`audit.py` 0 blockers, packager 6/6 CSP PASS, es2019 guard clean.

`build/drive-gate.test.mjs` drives the whole first-run path against a stubbed GIS and
Drive REST layer at an iPhone user-agent: tap the button, see the list, pick a file,
land in the app with that file's tasks, with the link and `gsyncConnected` written under
the new profile and nothing written to a bare key. It also covers a failed sign-in and
an empty list. Against the parent commit it fails 3 assertions — including "signing in
also asks Drive for the file list", where the recorded network calls show the app
authenticated and then never listed anything.

**Not verified on a device.** The stub proves the app's half of the exchange; whether
the user's file is visible to `drive.file` scope at all can only be seen on the phone.

## 3.77.0 — the bottom-right corner — 2026-07-25

`APP_VERSION` is unchanged. Reported from a phone screenshot as "ปุ่มบังกัน มองไม่เห็น"
— the buttons cover each other and cannot be seen.

### Fixed

- **The four floating controls in the bottom-right corner no longer sit on top of each
  other.** ＋ quick-add task (`bottom:76`), 📌 quick note (`bottom:84`) and ⛶
  presentation mode (`bottom:88`) each carried their own hardcoded offset and all three
  landed inside the same 50-pixel square, so only the one with the highest `z-index`
  was visible at all — ⛶, at `z-index:9999` and 55% opacity, drawn over the top of the
  other two. 📌 overlapped ⛶ on the desktop layout as well. They are now four fixed
  slots in one column, measured up from the top edge of the bottom nav.
- **The column clears the home indicator.** Every offset was a bare pixel value, while
  the bottom nav sizes itself as `~59px + env(safe-area-inset-bottom)`. On a notched
  phone the nav is roughly 93px tall, so the first slot at 76px was underneath it. The
  column adds the same `env()` the nav does. The toast had the same defect at
  `bottom:80` and is fixed with it.
- **Sign out renders in the header it was written for.** `auth.js` places the control
  with `document.querySelector('.toprow')` and falls back to `document.body` when that
  misses. Nothing in the app carried the class, so it always missed, and the fallback is
  a fixed full-width pill at `bottom:78px` with `z-index:2147482000` — the thing burying
  the corner in the screenshot. The compact top bar now carries `toprow`, which
  `auth.css` already styles as a 42px circle in the row.
  - The fallback is still reachable: `auth.js` builds the button from a Supabase
    auth-state callback that can fire before React has mounted the header. So the
    small-screen fallback is now harmless rather than merely relocated — it drops the
    email label and moves to the bottom **left**, where it cannot cover anything.
  - One consequence worth knowing: in presentation mode `.lp-app-chrome` is
    `display:none`, so the in-header sign-out button is hidden along with the rest of
    the chrome. Exiting with 👁 brings it back.

### Verification

Harness LEN 25129 / NODES 141 (was 25127 — the two characters are the changed inline
style values; NODES is unchanged), no THROW, zero captured errors. `audit.py` 0
blockers. Packager 6/6 CSP hashes verify. es2019 guard clean (`??` 0, `?.[` 0).

`build/fab-stack.test.mjs` renders the app at phone, tablet and desktop widths and
asserts every pair of the four buttons is disjoint, that each offset carries the
safe-area inset on compact layouts, that the column clears the nav, and that the top
bar carries `toprow`. Against the previous commit it fails 17 assertions; after the
change it passes. `auth.css` is linked, not inlined, so editing it changes no CSP hash
— but it does change `BUILD-MANIFEST.auth.style_sha256`, which `build/pipeline.mjs`
does not refresh and was updated by hand.

**Not verified on a device.** Neither the sign-out control nor `env(safe-area-inset-bottom)`
exists in jsdom, so the two things this change is really about can only be confirmed on
the phone.

## 3.77.0 — sync feedback, per-window places, iOS visibility — 2026-07-25

`APP_VERSION` is unchanged. This batch is nine changes on top of
`3.77.0-n104-ios-drive-file-list`, several of which turned out to have a different
root cause than the one originally reported.

### Fixed

- **Notes and events no longer vanish after a refresh.** `saveNotes`/`saveEvents`
  already stamped `dataLastUpdated`, but the stamp lived only in React state and was
  never persisted. On load it was rebuilt from `tasks.find(t=>t._updated)?._updated`
  — and nothing in the app has ever written an `_updated` field, so the lookup was
  always `undefined` and the stamp was `null` after every reload. `gsyncNow` then read
  "no local change" and pulled the cloud over freshly typed data. The stamp is now
  written to its own profile-scoped key and read back on load.
- **A profile switch no longer leaks one profile's edit time into another.** The
  persist effect listed `activeProfileId` as a dependency, and an effect sees the
  values from the render that scheduled it — so it ran with the new profile's key and
  the previous profile's stamp. Profile B could look locally-edited when it was not,
  which is enough for sync to push stale data or skip a pull it needed.
- **Save to Cloud now says what it did.** Of the four branches `gsyncNow` can take,
  the "nothing changed on either side" branch never stamped `lastSyncAt` — and that
  is the branch a manual save lands in whenever auto-sync already pushed, which is
  most of the time. The panel kept displaying the age of some earlier upload, so a
  successful save was indistinguishable from a no-op and from a silent failure.
  Every path now reports its outcome, and the displayed age ticks instead of freezing
  at whatever it said when the panel opened.
- **A place with no attachment now shows its pin.** On both Timeline bar variants the
  📍 was nested inside the attachments check, so an event with a location but no file
  attached rendered no pin at all.
- **Editing an event's dates from the Gantt grid no longer discards that window's
  description.** Window 0 was rebuilt from `start`/`end` alone, dropping everything
  else the window owned.
- **Hovering a milestone shows its image.** Milestone timeline items are built without
  an `attachments` field, so the image lookup found nothing for exactly the rows most
  likely to carry a photo. It reads through the underlying task or event now.
- **Inline scripts are no longer blocked by CSP.** The packager hashed each script
  body while its template wrapped that body in a leading and trailing newline, so all
  six hashes were off by two bytes and Chromium refused to execute every one of them
  — including the app bundle. The page rendered a working-looking login screen over a
  dead React root. The packager's self-check now re-parses the emitted file, because
  the previous check compared the CSP against the same value it had just used to build
  it and could never fail.

### Added

- **Places belong to a time window.** `windowLoc(ev, w)` is the single definition of
  "the place for this window": the window's own `loc` first, the legacy event-level
  `location` as a fallback that is read but never rewritten. A trip that happens twice
  can sit in two different places under one event. Timeline and Gantt both show 📍 name
  plus the window's date range, and the Gantt hover card shows the full name.
- **Cloud changes ask before applying.** When the cloud moved and this device has no
  local edits, the app used to download and apply immediately. It now offers Update
  now / Later / Keep this device and overwrite the cloud. "Later" deliberately does not
  record the cloud version, so the next sync asks again rather than forgetting.
- **Add an event from the main view.** Event creation lived only inside Calendar, Gantt
  and Timeline, so on a phone there was no way to create one without first navigating
  into a tab. A launcher beside the existing quick-note button opens the same editor.
- **The version is readable on a phone.** It was rendered only in the desktop header,
  gated at ≥1024px, so below that width there was nowhere to read it — on the device
  where it matters most after re-adding a home-screen icon. Added to the mobile and
  tablet headers and to Settings, with a note that a mismatch means a cached copy.
- **A pinned toolchain.** `package.json` with exact versions, `package-lock.json`,
  `vite.config.js` and `npm run verify` for the whole cycle. Nothing pinned it before,
  so a rebuild could differ from what was verified and the harness baseline was not
  comparable across machines.

### Changed

- **The Timeline shows events by default**, matching the Gantt, which always has.
  Hidden behind an off-by-default toggle, event bars — and their place labels — were
  simply absent on a fresh profile.
- **Hovering a Timeline bar shows the attached images and nothing else.** The tooltip
  repeated the title, dates, countdown and chips already visible on the bar. With
  nothing attached, no tooltip appears at all.
- **Attached image previews are three times larger** on task cards, the today list and
  card lead images.
- The header version chip is legible rather than a near-invisible ghost. The faint
  wordmark is left alone: it is discreet on purpose so the app is not obvious to
  onlookers, and a bare version number identifies nothing.

### Security

- The hardcoded Google API key was removed from source and rotated. It was never
  referenced and was already tree-shaken out of the shipped bundle, but it was
  committed to a public repository. The comment that called an API key "safe to ship
  in a frontend" — the standing justification that had put one there twice — was
  corrected.

### Verification

Harness LEN 25127 / NODES 141, no THROW, zero captured errors. `audit.py` 0 blockers.
Packager 6/6 CSP hashes verify. es2019 guard clean (`??` 0, `?.[` 0). `npm run verify`
from a clean tree reproduces `index.html` byte-for-byte.

**None of this batch has been verified on a real device.** The Drive round-trip, the
iOS standalone hint, the on-device version display and every touch interaction still
need a signed-in session on real hardware.

## 3.77.0-n104-ios-drive-file-list — 2026-07-25

### Fixed

- Google Drive file-list failures are now shown inside both sync interfaces
  instead of being silently discarded, with a **Reconnect** action beside the
  error so an expired session can be repaired in place.
- Each Google Identity Services loading attempt now fails with an actionable
  message after 12 seconds rather than leaving iOS users waiting indefinitely.
  A failed or stale script is removed and retried once with a fresh request.
- Expired Drive sessions clear both the cached token and its expiry state. REST
  helpers no longer try to open nested OAuth UI after the initiating tap has
  ended; users reconnect explicitly and the file list reloads after success.
- Offline list requests show an offline-specific recovery message, while a
  cancelled reconnect clears the busy state and leaves a visible error.
- Empty file lists explain the intentionally narrow `drive.file` permission:
  only JSON files created by or previously opened with My Todo Planner are
  visible, while creating a new per-profile sync file remains available.

### Security and compatibility

- The least-privilege Google Drive `drive.file` OAuth scope is unchanged; this
  release adds guidance and recovery without requesting broader Drive access.

## 3.77.0-source-restored — 2026-07-24

### The point of this release

Versions 3.65 → 3.76.1 were produced by patching the *minified* bundle directly,
so the shipped app had drifted away from its React source. This release ports
every shipped change back into `src/App.jsx` and rebuilds from source, so the
repository once again contains an editable source of truth. Behaviour was
re-implemented from the changelog specs and verified feature-by-feature, not
copied byte-for-byte — small visual details may differ.

### Restored from 3.65–3.76.1 (now in source)

- Storage actions renamed to the unified vocabulary: **Save to Cloud**,
  **Open Local File**, **Backup to Local Drive**, **Restore from Local File**.
- Unified two-way sync-conflict dialog (3.75): one `DirectionDialog` component
  now backs both the opened-file-vs-Drive case and the both-sides-changed sync
  conflict. It compares timestamps, marks the newer copy, recommends that
  direction, always offers **Local → Cloud** and **Cloud → Local**, and adds a
  second confirmation that states exactly what will be discarded. Previously
  the sync conflict offered only Cloud → Local.
- Task image scoping (3.76.x): image badges, previews, reserved spacing and
  tap targets appear only when that exact task owns at least one valid image
  attachment (`taskImages()` + `safeImageSrc()`); counts count images, not
  attachments; preview sources are re-resolved and sanitized at click time.
- Attachment preview controls take keyboard focus, respond to Enter/Space, and
  carry accessible labels.
- Note HTML routed through the shared sanitizer (`sanitizeNoteHTML`, backed by
  the wrapper's `__MTP_SECURITY__.sanitizeHTML`) before entering print/export
  windows, which the document-wide innerHTML guard cannot reach.
- The security/UI wrapper (CSP, security bootstrap, pro UI layer, runtime
  banners, credential-field lock, Supabase auth tags) now lives as tracked
  source under `build/` and is assembled by `build/package.mjs`, which computes
  the CSP hashes from the shipped bytes on every build.

### Fixed

- **Profile-scoped storage bug (found by audit, same family as N106):** two
  writes in the Gantt recurring-done flow used a raw storage key instead of
  `pkG(KEY)`. Completing a recurring task from the Gantt page wrote to an
  unscoped key while reads used the profile-scoped one, so the completion
  vanished on refresh and could bleed between profiles. Both writes now scope.
- Credential input fields (Anthropic API key, Google API key, OAuth client ID,
  Microsoft app ID) are no longer rendered at all. The shipped builds hid them
  after first paint from outside the bundle; the wrapper's `mtp-security-ui`
  lock remains as a second line of defence.
- App identity unified: `<title>`, the iOS home-screen name and the PWA
  manifest all say **My Todo Planner** (they previously disagreed —
  "Dashboard" on the home screen — which made N103's version comparison
  impossible), and `APP_VERSION` (3.77.0) is stamped from a single constant.

### Tooling

- `build/check4.mjs` (render harness) now freezes the clock; rendered length is
  deterministic across runs (LEN 22572 / NODES 118) instead of drifting with
  relative dates and being mistaken for a regression.
  <br>*Note added later: that figure never reproduced. It does not match any source
  state in this branch's history, including the untouched `src/App.jsx` snapshot from
  `main`, and the toolchain that produced it was not recorded — there was no
  lockfile at the time. Left as written because this is a historical record. The
  live baseline is in `PROJECT_CONTEXT.md`, alongside the pinned versions it was
  measured on.*
- `build/audit.py`: six-dimension audit + the standing pre-build checklist,
  corrected for nested-template-literal parsing after its first run produced
  13 phantom blockers. Current result: 0 blockers, 4 explained warnings.

### Security and compatibility

- Version 7 profile JSON, Google Drive `drive.file` scope, Supabase auth,
  external-link hardening, CSP controls and `mobile/index.html` (3.75.0)
  unchanged.
- CSP inline-script hashes recalculated (6) and `BUILD-MANIFEST.json`
  refreshed — both now generated by the packager, never edited by hand.

## 3.76.1-task-image-scope — 2026-07-21

### Fixed

- Scoped every Full/PC and Mobile task preview to valid image attachments owned by that exact task.
- Removed image UI, badges, placeholders, reserved spacing, preview targets, and image-panel treatment from tasks with no image attachments, including tasks with non-image attachments only.
- Changed image counts to count valid task images rather than all task attachments.

### Security and compatibility

- Mobile tap previews re-resolve the selected attachment by task type, `task.id`, and attachment index before applying the existing image URL sanitizer.
- Preserved version 7 task data, the version 3.75 unified sync-conflict workflow, Google Drive, Supabase, OAuth, and CSP controls.
- Recalculated inline-script CSP hashes and refreshed the build manifest.

## 3.76.0-task-image-previews — 2026-07-21

### Added

- Added clear attachment-count indicators and larger image previews to Full/PC task surfaces.
- Added Mobile task-card attachment badges, a non-image paperclip fallback, and a lazy-loaded image gallery in the task editor.
- Added keyboard activation and accessible labels to Full/PC attachment preview controls.

### Security and compatibility

- Mobile previews continue to accept only sanitized image URLs and open previews with opener isolation.
- Preserved the version 3.75 unified sync-conflict workflow, Google Drive/Supabase integrations, version 7 profile compatibility, and existing task data.
- Recalculated inline-script CSP hashes and refreshed the build manifest.

## 3.75.0-unified-sync-conflicts — 2026-07-21

### Added

- Unified the Full/PC and Mobile Google Drive conflict workflow.
- Compared Cloud and Local timestamps, marked the newer copy, and recommended the newer-to-older direction.
- Kept both **Cloud → Local** and **Local → Cloud** actions available and added a separate final overwrite confirmation.
- Added image thumbnails to timeline/mobile task cards when an attachment is an image.

### Changed

- Renamed storage actions to **Save to Cloud**, **Open Local File**, **Backup to Local Drive**, and **Restore from Local File**.
- Preserved automatic Drive metadata checks on focus, visibility change, reconnect, and scheduled sync so Full/PC and Mobile detect one another's cloud writes.
- Recalculated inline-script CSP hashes and refreshed the build manifest.

### Security and compatibility

- Preserved the Google Drive `drive.file` OAuth scope, Supabase authentication, CSP restrictions, URL sanitization, security hardening, and version 7 profile compatibility.
- Image thumbnails accept only the existing sanitized image sources and are lazy-loaded.
