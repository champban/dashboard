# My Todo Planner — Execution Skills & Human Handoff

This guide separates work that an AI coding agent can execute from work that the project owner must complete in authenticated consoles.

## Ownership legend

- **AI** — inspect, edit, validate, commit, deploy, or report using connected tools.
- **HUMAN** — sign in, grant consent, enter secrets, or change settings in an owner-only console.
- **VERIFY TOGETHER** — AI verifies public/configurable outputs; the owner completes the real account consent flow.

## Recommended reusable skills

| Skill | Purpose | Owner |
|---|---|---|
| `todo-planner-release` | Run checks, regenerate CSP hashes, update manifests, commit, deploy, and verify GitHub Pages. | AI |
| `todo-planner-github` | Repository orientation, safe file updates, commits, Pages status, CI and rollback guidance. | AI |
| `todo-planner-supabase-auth` | Review Supabase client auth, protected routes, redirect URLs, session handling, and security boundaries. | AI + HUMAN |
| `todo-planner-google-oauth-drive` | Validate OAuth code and produce exact Console steps for origins, redirect URI, Drive API and `drive.file`. | AI + HUMAN |
| `todo-planner-6d-audit` | Audit correctness, UX, architecture, mobile/accessibility, security/privacy, and operability. | AI |

### Existing execution skills to reuse

- GitHub: `github:github`, `github:yeet`, `github:gh-fix-ci`, `github:gh-address-comments`.
- Supabase: `supabase:supabase`, `supabase:supabase-postgres-best-practices`.
- Google Cloud: no dedicated installed skill is available; create `todo-planner-google-oauth-drive` from the workflow below and require official Google documentation checks before giving Console instructions.

## End-to-end execution

### Step 1 — Inspect and prepare the release

**AI**

1. Read the repository status and preserve unrelated user changes.
2. Inspect Full and Mobile auth, Drive sync, CSP, local backup and protected-route behavior.
3. Make scoped source changes.
4. Run syntax, CSP hash, secret scan and responsive-layout checks.

**HUMAN**

- No action unless the AI reports an ambiguous product decision.

### Step 2 — GitHub and GitHub Pages

**AI**

1. Update only intended files.
2. Commit with a focused message and push to the configured branch.
3. Verify the public Pages URL serves the new commit.
4. Report commit SHA, validation results and rollback point.

**HUMAN — first-time setup only**

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main**, folder **/(root)**, then press **Save**.
5. Keep the repository public only if all client-side source values are approved for public disclosure.

### Step 3 — Google Cloud OAuth and Drive

**AI**

1. Confirm the app requests only `https://www.googleapis.com/auth/drive.file`.
2. Confirm no client secret, refresh token or access token is committed.
3. Confirm authorized origins/redirect values required by the deployed URLs.
4. Validate Drive errors and consent-flow handling in code.

**HUMAN — required**

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select the same project used by the OAuth Client ID.
3. Open **APIs & Services → Library**, search **Google Drive API**, and press **Enable**.
4. Open **Google Auth Platform → Data Access → Add or remove scopes**.
5. Add `https://www.googleapis.com/auth/drive.file`, press **Update**, then **Save**.
6. Open **Clients → Web client** and add JavaScript origin `https://champban.github.io`.
7. Add redirect URI `https://qjaywadzvwvcspdsjxth.supabase.co/auth/v1/callback`.
8. If publishing status is **Testing**, open **Audience → Test users** and add every Gmail account that will test the app.
9. Never paste the Google Client Secret into HTML, GitHub issues, commits, or chat screenshots.

### Step 4 — Supabase Auth

**AI**

1. Review the browser client for a publishable/anon key only; reject any `service_role` or secret key.
2. Check session restoration, OAuth callback handling, sign-out behavior and protected UI states.
3. Check redirect paths against Full and Mobile deployments.
4. If database tables are added, require RLS with per-user ownership policies.

**HUMAN — required**

1. Open the Supabase project Dashboard.
2. Go to **Authentication → URL Configuration**.
3. Set **Site URL** to `https://champban.github.io/dashboard/`.
4. Add redirect URLs:
   - `https://champban.github.io/dashboard/`
   - `https://champban.github.io/dashboard/mobile/`
5. Go to **Authentication → Providers → Google**.
6. Enable Google, paste the OAuth Client ID and Client Secret from the matching Google Cloud Web client, then press **Save**.
7. Do not share the Client Secret with the frontend or commit it to GitHub.

### Step 5 — Acceptance test

**HUMAN**

1. Open Full and Mobile in a private browser tab.
2. Press **Continue with Google** and approve the requested access.
3. Confirm the app opens after sign-in and Sign out does not cover navigation.
4. Open **Sync**, connect Drive, create or select a planner JSON file, and press **Sync now**.
5. Add one harmless test task, press **Undo**, confirm it disappears, then press **Redo** and confirm it returns.
6. Tap the task card outside its checkbox, edit it, save, and verify the change.
7. Tap an Upcoming Event, edit its title/date/location, save, then verify Undo restores the previous event.
8. Sync and verify the test task appears on the other device.
9. Export a local JSON backup before testing conflict resolution.
10. Open **Sync → Storage manager** and confirm Planner data, Browser storage, Undo/Redo memory, and stored-item counts appear.
11. Press **Refresh usage**, then **Clear Undo/Redo** and confirm history memory decreases; export a backup before testing **Archive completed > 1 year**.

**AI**

- Diagnose any error using the exact message/screenshot, then patch and repeat only the affected checks.

## Stop conditions

- Stop if an OAuth Client Secret, Supabase `service_role`, access token or refresh token appears in client code.
- Stop if Google consent requests broader Drive access than `drive.file` without an explicit product requirement.
- Stop commercial rollout while planner data remains unencrypted browser-local storage without backend per-user authorization.
