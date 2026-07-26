# Project Context

Shared context for whichever assistant (Claude / ChatGPT / Codex) picks up this
project. Update this file whenever architecture, decisions, or open bugs change.

## Current release

- Version: `3.77.0-n104-ios-drive-file-list` (`APP_VERSION` in `src/App.jsx` is the single source; it flows into the UI, filenames and `BUILD-MANIFEST.json`)
- Full application: `index.html` — **generated, do not edit directly**
- Mobile application: `mobile/index.html` (separate hand-written vanilla-JS app, v3.75.0)
- Live: https://champban.github.io/dashboard/

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

## Sync time has to be visible, and absolute (3.77.x)

Three separate facts, and the answer to "is my copy the same as the cloud's?" needs all
three side by side. `syncStamp()` is the single formatter for every one of them:

| line | source | means |
|---|---|---|
| 📱 This device | `dataLastUpdated` | when the data here last changed |
| ☁️ Cloud file | `gsync.lastCloudModified` | the Drive `modifiedTime` at the last check |
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
browser focus and visibility change — no fixed-interval polling.

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

Unbuilt idea list: bulk actions in List, duplicate a saved view, export
Timeline/Gantt as PNG, `.ics` export, dependency arrows, workload heatmap,
search highlighting.

## Infrastructure notes

- GitHub Pages serves one branch per repo; a second URL needs its own Google
  Console redirect URI (hence the Netlify staging plan).
- Supabase free tier pauses after 7 days inactivity (data retained, manual
  restore); if this becomes a problem, add a GitHub Actions cron keepalive
  (`.github/workflows/keepalive.yml`, every ~3 days).
