# Safe Patch & Deploy Checklist

## Before editing
- [ ] Confirm repository, base branch, and deployment target
- [ ] Read `PROJECT_CONTEXT.md`
- [ ] Fetch latest base branch
- [ ] Confirm target files and protected files
- [ ] Confirm no secrets are present in planned changes

## During implementation
- [ ] Create a dedicated branch
- [ ] Apply the smallest possible patch
- [ ] Preserve existing integrations and security controls
- [ ] Update CSP hashes when inline scripts change
- [ ] Keep unrelated files unchanged

## Testing
- [ ] Run language or JavaScript syntax checks
- [ ] Run `git diff --check`
- [ ] Verify protected files are unchanged
- [ ] Validate manifest hashes and byte sizes when applicable
- [ ] Test Add/Edit/Save/Sync flows affected by the patch
- [ ] Record tests that could not run and why

## Delivery
- [ ] Update `PROJECT_CONTEXT.md`
- [ ] Update `BUILD-MANIFEST.json` when artifacts change
- [ ] Commit with an explicit message
- [ ] Push branch
- [ ] Open PR against the correct base branch
- [ ] Report changed files, tests, SHA, and PR URL
- [ ] Merge only with explicit authorization
- [ ] Verify the production URL after merge
