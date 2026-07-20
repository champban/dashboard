# My Todo Planner v3.70.0 — Release Audit 6D

Build date: 2026-07-20

## Executive decision

The Google OAuth **Client ID is a public application identifier, not a client secret**. It must exist in browser code for Google Identity Services. The production build nevertheless removes the editable/displayed Client ID field to prevent confusion and accidental OAuth-project switching. No OAuth client secret is included.

## 1. Functional Correctness & Data Integrity — PASS with controls

- Profile schema remains version 7 compatible between Full and Mobile.
- JSON parsing rejects prototype-pollution keys (`__proto__`, `prototype`, `constructor`).
- Oversized file/JSON guards: Full 50 MB; Mobile 15 MB.
- Existing Drive conflict logic is retained.
- Rich-note HTML is sanitized before display, paste, blur and print.

## 2. UI/UX & Engineering Usability — PASS

- OAuth Client ID is no longer editable or displayed in normal Settings.
- API-secret fields are hidden and disabled in the Full app.
- A security notice explains that OAuth is deployment-managed and API secrets require a backend.
- Mobile Sign out is now a compact, accessible header action; it no longer floats over tasks or bottom navigation.
- The signed-in email remains available through the button's accessible label and tooltip without consuming mobile layout space.
- Mobile provides visible Undo/Redo controls with disabled states, bilingual labels and a bounded 40-step in-session history.
- Entire Mobile task cards now open the task editor; Upcoming Event rows open a dedicated event editor for title, dates, location, details and deletion.
- No preview is generated as part of this release package.

## 3. Lean Architecture & Performance — PASS with residual dependency

- Mobile remains framework-free and lightweight.
- Full app remains a single compiled bundle to avoid regression.
- Security sanitization is scoped to note editors rather than globally rewriting normal UI.
- Residual: Excel import/export dynamically loads pinned SheetJS `0.18.5` from cdnjs. It is restricted by CSP, `crossOrigin=anonymous`, and no-referrer, but should be vendored or upgraded in the next architecture release.

## 4. Mobile, Accessibility & Readability — PASS

- Existing focus, safe-area, touch-target and reduced-motion controls are retained.
- Sign out has a 42 × 42 px header touch target, keyboard focus styling, accessible name, disabled/busy feedback and no bottom-nav collision.
- Undo/Redo use 40 px controls beneath the sticky header, remain clear of bottom navigation and expose button state to assistive technology.
- Task cards support touch plus Enter/Space keyboard activation; completion remains a separate control and event rows are semantic buttons.
- Credential configuration is removed from the mobile user workflow.
- External `_blank` links are forced to `noopener noreferrer`.

## 5. Security & Privacy — PASS for static personal deployment; CONDITIONAL for commercial use

Closed findings:

- **Stored XSS:** imported/pasted note HTML is allow-list sanitized; event attributes, scripts, iframes, dangerous URLs and unsupported tags are removed.
- **Secret persistence:** Anthropic/Google API keys and token-like fields are redacted from localStorage writes and existing storage.
- **Direct AI secret usage:** browser calls to `api.anthropic.com` are blocked; AI requires a secured backend proxy.
- **CSP:** hash-based inline-script policy added; no `unsafe-eval`; inline event handlers blocked; Google and Drive endpoints narrowly allowed.
- **Token storage:** OAuth access tokens remain memory-only; `drive.file` scope remains.
- **Tabnabbing:** external links hardened.

Residual limitations:

- User tasks/notes stored in localStorage are not encrypted. Anyone with local OS/browser-profile access, a malicious extension, or a future same-origin XSS could read them. Do not store highly sensitive corporate or personal data in the GitHub Pages version.
- GitHub Pages does not provide project-specific custom security headers such as `frame-ancestors`, COOP, HSTS tuning, or Permissions-Policy. The meta CSP covers most script/content controls but cannot fully replace response headers.
- A commercial multi-user version requires authenticated backend storage, server-side authorization, audit logging and a backend AI proxy.

## 6. Connectivity, Reliability & Operability — PASS with owner acceptance test

- OAuth uses the fixed deployment Client ID and HTTPS origin.
- Allowed JavaScript origin must include `https://champban.github.io`.
- Drive scope remains `https://www.googleapis.com/auth/drive.file`.
- Access tokens are not persisted.
- Undo/Redo snapshots remain memory-only for the current tab session; restoring a snapshot marks local data dirty so automatic Drive sync can reconcile it normally.
- Supabase sign-in and Drive synchronization are separate OAuth grants with narrow responsibilities.
- Live sign-out, Google consent and Drive round-trip must be tested after deployment because they depend on the owner's browser and Google Cloud configuration.

## Release files

- `index.html` — Full app v3.64.0 security build
- `mobile/index.html` — Mobile app v3.64.0 security build
- `AUDIT-6D-SECURITY-REPORT.md` — this report
- `DEPLOYMENT-CHECKLIST.md` — controlled GitHub Pages deployment steps
- `EXECUTION-SKILLS-GUIDE.md` — reusable AI/HUMAN execution and handoff workflow

## Verification performed

- JavaScript syntax: all inline scripts passed `node --check`.
- Headless Chromium render: Full and Mobile loaded without page errors or console errors using an isolated document test.
- XSS regression: malicious note HTML containing `<script>`, `onerror`, and `javascript:` was sanitized; no payload executed.
- AI egress regression: direct requests to `api.anthropic.com` were blocked by the security layer.
- Mobile Settings regression: `#clientIdInput` count = 0 after render.
- CSP regression: both apps executed under their generated hash-based meta CSP without violations during the isolated render test.
- Mobile auth layout regression: Sign out is placed in `.toprow`, while Full app retains the existing floating action.
- Mobile history regression: add, edit, delete, complete/reopen, profile/settings, JSON import, Drive pull and cloud-file load all create undo checkpoints; a new edit clears redo history.
- Mobile editor regression: card-area task taps preserve the editing target through re-render; event edits/deletes create undo checkpoints and retain unedited event fields.

Live navigation to a local HTTP server was blocked by the execution environment's administrator policy, so actual Google OAuth consent and Drive round-trip remain post-deployment acceptance tests.
