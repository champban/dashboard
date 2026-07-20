# Project Context

## Current release

- Version: `3.74.0-task-cloud-workflow`
- Full application: `index.html` (unchanged by the mobile long-title update)
- Mobile application: `mobile/index.html`

## Mobile long task titles

The mobile task editor uses an auto-growing title textarea for both Add Task and Edit Task. It starts at 64px, grows with wrapped Thai or English content to 180px, and then enables internal vertical scrolling. Mobile task cards wrap and display at most three title lines.

## Preserved integrations and security

The v3.74 task and Google Drive workflows, Supabase authentication integration, security bootstrap, and Content Security Policy remain enabled. Any change to an inline script in `mobile/index.html` must be followed by recalculating its SHA-256 CSP source expression and updating `BUILD-MANIFEST.json`.
