# GitHub Codex Safe Patch & Deploy

## Purpose
Safely modify an existing GitHub-hosted application with Codex while preserving newer features, integrations, security controls, and deployability.

## Required inputs
- Repository and base branch
- Target files and requested behavior
- Files that must not change
- Required tests
- Commit message
- Deployment target

## Workflow
1. Read `PROJECT_CONTEXT.md`, `BUILD-MANIFEST.json`, and relevant documentation.
2. Fetch the latest base branch; never rely on an older local artifact.
3. Create a dedicated working branch.
4. Inspect the exact target code and identify the smallest safe patch.
5. Apply only approved changes.
6. Preserve OAuth, CSP, Supabase, Google Drive, storage, and security behavior.
7. Recalculate CSP hashes when inline scripts change.
8. Run syntax, integrity, regression, and protected-file checks.
9. Update `PROJECT_CONTEXT.md`, manifests, and changelog when applicable.
10. Commit with a descriptive message.
11. Push the branch and open a Pull Request to the base branch.
12. Report changed files, tests, commit SHA, PR URL, and known limitations.
13. Do not merge unless explicitly authorized.
14. After merge, verify the production deployment and critical user flow.

## Mandatory safety rules
- Never overwrite a newer repository file with an older copy.
- Never modify files outside the approved scope.
- Never expose secrets, API keys, access tokens, refresh tokens, or client secrets.
- OAuth Client IDs may be public, but production values should be deployment-controlled.
- Preserve CSP and recalculate hashes for changed inline scripts.
- Run `git diff --check` and confirm protected files are unchanged.
- Stop and ask the user when authentication, approval, billing, or irreversible action is required.
- Prefer Pull Requests over direct writes to `main`.

## Required output
- Status and percentage
- Branch name
- Changed files
- Tests performed and results
- Commit SHA
- Pull Request URL
- Deployment verification result
- Remaining risks or manual actions
