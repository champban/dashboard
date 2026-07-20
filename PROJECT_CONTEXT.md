# Project Context

## Current release

- Version: `3.74.0-task-cloud-workflow`
- Full application: `index.html` (unchanged by the mobile long-title update)
- Mobile application: `mobile/index.html`

## Mobile long task titles

The mobile task editor uses an auto-growing title textarea for both Add Task and Edit Task. It starts at 64px, grows with wrapped Thai or English content to 180px, and then enables internal vertical scrolling. Mobile task cards wrap and display at most three title lines.

## Preserved integrations and security

The v3.74 task and Google Drive workflows, Supabase authentication integration, security bootstrap, and Content Security Policy remain enabled. Any change to an inline script in `mobile/index.html` must be followed by recalculating its SHA-256 CSP source expression and updating `BUILD-MANIFEST.json`.

## Reusable Codex skills

Repository-scoped reusable workflows are stored under `.codex/skills/`:

- `github-codex-safe-patch-deploy` — safe branch, patch, test, PR, merge-approval, and deployment-verification workflow.
- `webapp-security-6d-audit` — six-dimension security audit for browser-based applications.
- `github-pages-release-verification` — GitHub Pages path, branch, build, URL, cache, and smoke-test verification.

These skills must be used together with the current repository context and must never replace the latest repository files with older local artifacts.

## Deploy discipline

For every significant change: edit → test → verify → group related fixes → deploy once. Prefer a dedicated branch and Pull Request. Do not merge or perform irreversible actions without explicit approval. After merge, verify the production URL and critical user flow.

## Open backlog

1. Add automated CI checks for HTML/JavaScript syntax, CSP hashes, and manifest integrity.
2. Add a release checklist for Google OAuth origin and Drive sync smoke tests.
3. Keep reusable skills synchronized with lessons learned from future deployments.
