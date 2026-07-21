# Project Context

## Current release

- Version: `3.75.0-unified-sync-conflicts`
- Full application: `index.html`
- Mobile application: `mobile/index.html`

## Unified sync conflict workflow

Both applications use the same bidirectional conflict vocabulary and decision flow. When both Google Drive and the current device changed after the prior sync, the dialog compares the Drive `modifiedTime` with the local profile `savedAt`, marks the newer copy, recommends that direction, and always offers **Cloud → Local** and **Local → Cloud**. Selecting either direction opens a second confirmation step before any overwrite.

Cloud metadata is checked during manual sync, automatic sync, browser focus, and visibility changes. Thus a cloud update made by the Full/PC app is discovered by Mobile, and a cloud update made by Mobile is discovered by the Full/PC app. Existing version 7 profile JSON and sync metadata remain compatible.

Storage actions use explicit names: **Save to Cloud**, **Open Local File**, **Backup to Local Drive**, and **Restore from Local File**. Timeline task cards show a compact, lazy-loaded thumbnail for image attachments; unsafe image URL schemes remain rejected.

## Mobile long task titles

The mobile task editor uses an auto-growing title textarea for both Add Task and Edit Task. It starts at 64px, grows with wrapped Thai or English content to 180px, and then enables internal vertical scrolling. Mobile task cards wrap and display at most three title lines.

## Preserved integrations and security

Google Drive uses the least-privilege `drive.file` scope. Supabase authentication, OAuth, security bootstrap, external-link hardening, import compatibility, URL sanitization, file limits, and Content Security Policy remain enabled. Inline-script SHA-256 CSP sources and `BUILD-MANIFEST.json` must be recalculated whenever either application changes.

## Reusable Codex skills

Repository-scoped reusable workflows are stored under `.codex/skills/`:

- `github-codex-safe-patch-deploy` — safe branch, patch, test, PR, merge-approval, and deployment-verification workflow.
- `webapp-security-6d-audit` — six-dimension security audit for browser-based applications.
- `github-pages-release-verification` — GitHub Pages path, branch, build, URL, cache, and smoke-test verification.

## Deploy discipline

For every significant change: edit → test → verify → group related fixes → deploy once. Use a dedicated branch and Pull Request. Do not merge or perform irreversible actions without explicit approval. Pages deployment verification is blocked until the Pull Request is reviewed and merged.

## Open backlog

1. Add automated CI checks for HTML/JavaScript syntax, CSP hashes, and manifest integrity.
2. Add an authenticated end-to-end Google Drive test account for automated PC ↔ Mobile sync testing.
3. Keep reusable skills synchronized with lessons learned from future deployments.
