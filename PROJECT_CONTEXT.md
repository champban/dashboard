# Project Context

## Current release

- Version: `3.76.1-task-image-scope`
- Full application: `index.html`
- Mobile application: `mobile/index.html`

## Unified sync conflict workflow

Both applications use the same bidirectional conflict vocabulary and decision flow. When both Google Drive and the current device changed after the prior sync, the dialog compares the Drive `modifiedTime` with the local profile `savedAt`, marks the newer copy, recommends that direction, and always offers **Cloud → Local** and **Local → Cloud**. Selecting either direction opens a second confirmation step before any overwrite.

Cloud metadata is checked during manual sync, automatic sync, browser focus, and visibility changes. Thus a cloud update made by the Full/PC app is discovered by Mobile, and a cloud update made by Mobile is discovered by the Full/PC app. Existing version 7 profile JSON and sync metadata remain compatible.

Storage actions use explicit names: **Save to Cloud**, **Open Local File**, **Backup to Local Drive**, and **Restore from Local File**. The version 3.75 unified sync-conflict workflow remains unchanged.

## Task attachment previews

Full/PC task surfaces show previews and image indicators only when that exact task has at least one valid image attachment. Mobile task cards and editors likewise render image UI only from valid image attachments owned by the selected `task.id`; tasks without images, including tasks with non-image attachments only, receive no image placeholder, badge, spacing, hover/tap target, or highlighted image-panel treatment. Preview actions resolve the selected attachment again from the same task before opening it, accept only sanitized image sources, and never use a global gallery, cloud list, cache, fallback, demo, or placeholder source. Task attachment data and version 7 import compatibility are unchanged.

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
