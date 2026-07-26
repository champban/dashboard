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

## Google Drive file-list recovery (N104)

Both `SyncPanel` and `CloudSyncModal` display file-list errors locally and
offer a reconnect action which reloads the list after successful explicit
sign-in. Each GIS attempt has a 12-second timeout; a stale or failed script is
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
| N104 | Cannot pick a Drive file on iOS | Reproduce and capture the error; `listFiles()` may fail silently in mobile Safari. |
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
