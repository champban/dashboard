# Changelog

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
