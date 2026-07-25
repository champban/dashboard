# Changelog

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
