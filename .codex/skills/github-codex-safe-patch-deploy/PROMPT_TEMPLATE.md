# Prompt Template

Use this template for Codex tasks that modify an existing GitHub application.

```text
Repository: <owner/repo>
Base branch: <branch>
Target files: <paths>
Protected files: <paths that must not change>

Requested behavior:
<describe the smallest required change>

Preserve:
- Existing features and data compatibility
- OAuth and Google Drive behavior
- Supabase integration
- CSP and security hardening
- Current production URLs

Required checks:
- Read PROJECT_CONTEXT.md and BUILD-MANIFEST.json
- Fetch the latest base branch
- Apply the smallest safe patch
- Recalculate CSP hashes if inline scripts change
- Run syntax checks and git diff --check
- Verify protected files are unchanged
- Update PROJECT_CONTEXT.md and manifests when applicable

Delivery:
- Commit message: <message>
- Push a dedicated branch
- Open a pull request targeting <base branch>
- Report branch, changed files, tests, commit SHA, PR URL, and limitations
- Do not merge without explicit approval
```
