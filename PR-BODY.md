## Summary

Restores the React source (`src/App.jsx`) as the single source of truth and ships v3.77.0 from a full rebuild. Versions 3.65–3.76.1 patched the minified bundle directly; the live `index.html` on main is still the old 3.64.0 bundle. This branch replaces it and adds `src/` + `build/` in the correct locations.

## Changes

Restored to source: unified storage labels; `DirectionDialog` two-way sync conflict; task image scoping (`taskImages`/`safeImageSrc`); keyboard + aria on attachment previews; note HTML sanitization before print/export; no credential fields in JSX; app identity unified to 3.77.0 across title/home-screen/manifest.

Fixed: profile-scoped storage bug in Gantt recurring-done flow (N106 family) — 2 writes now use `pkG(KEY)`; iOS app-name mismatch (N103).

Pipeline: vite + esbuild + jsdom harness (frozen clock, LEN 22572/NODES 118) + audit.py (0 blockers) + package.mjs (6 CSP hashes). Adds BUILD-MANIFEST.json and shared PROJECT_CONTEXT.md.

## Test before merge

- [ ] About shows 3.77.0
- [ ] Settings: CREDENTIALS card, no API-key inputs
- [ ] Sync conflict shows both sides, NEWER badge, 2-way, confirms with counts
- [ ] Gantt: complete recurring task, refresh, still done
- [ ] iOS: re-add to home screen, name "My Todo Planner", versions match across devices

## Closes
N103 (app identity), N106 (Gantt storage scope, partial)

## Note
The three loose root files from PR #10 (`My-Todo-Planner-v3.77.0.html`, `banyat_dashboard_v3.77.0.jsx`, `tp-v3.77.0-upload.zip`) are superseded by proper tracked files here and can be deleted after merge.
