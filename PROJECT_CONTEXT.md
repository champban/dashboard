# Project Context

Shared context for whichever assistant (Claude / ChatGPT / Codex) picks up this
project. Update this file whenever architecture, decisions, or open bugs change.

## Current release

- Production branch `main` is `ad3067f`; it includes the LINE/auth hotfix,
  bilingual command menu, task-detail cards, and Search button.
- Supabase `line-todo-webhook` version 3 is ACTIVE. Its three deployed source
  files exactly match merged `main`; bundle SHA-256 is
  `d4ed04cad2935502009ca61275062bd3130752780179f0f099d76ed2a3ab51f6`.
- Search-button release merged in PR #43 and deployed at
  `2026-07-30T12:05:31+07:00`. Owner LINE mobile/PC acceptance remains.
- `APP_VERSION` in `src/App.jsx` is the Full version source; it flows into the
  UI and filenames. `BUILD-MANIFEST.json` records the packaged Full/Mobile
  artifacts.
- Full application: `index.html` — **generated, do not edit directly**
- Mobile application: `mobile/index.html` (separate hand-written vanilla-JS
  app, task-details candidate v3.75.2)
- Live: https://champban.github.io/dashboard/

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
- The compatibility migration, Edge Function version 2, and Full/Mobile app
  release are in production. Owner live-data acceptance remains an operational
  check. GitHub is the primary source for code and migrations; Drive remains
  supplementary recovery only.
- Rollback the application and Edge Function to the prior release if needed.
  Keep the additive v1/v2 database constraint because it remains compatible
  with both old and new clients.

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

## Open backlog

| ID | Item | Notes |
|---|---|---|
| N103 | iPhone vs iPad welcome screens differ | Root cause found in 3.77.0: home-screen name/manifest said "Dashboard" and version display was stale — re-add to Home Screen after deploying 3.77.0, then compare version numbers (now meaningful). |
| N104 | Cannot pick a Drive file on iOS | Root cause found in 3.77.x and it was not Safari: on the welcome screen the button connected and then opened a panel that the onboarding early-return never mounts, so nothing happened and no error showed. Fixed; still needs confirming on the device that the user's file is visible to `drive.file` scope at all. |
| N105 | Connection drops on a device that already connected | iOS standalone vs Safari-tab are separate storage contexts; confirm mode first. |
| — | OneDrive sync | Not started; needs Azure App Registration client ID. |
| — | Mobile/Full code sharing | `mobile/index.html` is a separate vanilla app; every shared fix must be made twice. Long-term: fold mobile into the React app or extract shared modules. |
| — | CI | Add automated checks: audit.py, harness, CSP/manifest integrity on every PR. |
| — | Staging | Netlify deploy previews planned (deferred until source is stable — now unblocked). Needs new JS origin + redirect URI in Google Console, new redirect URL in Supabase Auth, and the Netlify domain added to CSP `connect-src`/`form-action` as applicable. |
| LINE-1 | LINE Official read-only bot production activation | Backup, migrations, Function Secrets, function v2, webhook verification, auth hotfix, menu and task cards are active. Owner live-data acceptance remains. |
| LINE-2 | Search button owner acceptance | After Search-button deployment, verify keyboard prefill on LINE iOS/Android and fallback instruction on LINE PC. |

Unbuilt idea list: bulk actions in List, duplicate a saved view, export
Timeline/Gantt as PNG, `.ics` export, dependency arrows, workload heatmap,
search highlighting.

## Infrastructure notes

- GitHub Pages serves one branch per repo; a second URL needs its own Google
  Console redirect URI (hence the Netlify staging plan).
- Supabase free tier pauses after 7 days inactivity (data retained, manual
  restore); if this becomes a problem, add a GitHub Actions cron keepalive
  (`.github/workflows/keepalive.yml`, every ~3 days).
