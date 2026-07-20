# GitHub Pages Release Verification

## Purpose
Verify that a GitHub Pages release is published from the intended branch and path, serves the expected files, and has no obvious deployment regression.

## Required inputs
- Repository
- Publishing branch and folder
- Expected production URLs
- Expected entry files
- Release or merge commit SHA

## Workflow
1. Confirm repository visibility and Pages configuration.
2. Confirm the release commit exists on the publishing branch.
3. Verify required paths such as `index.html` and `mobile/index.html` exist with exact casing.
4. Confirm protected application files and manifests match the approved change.
5. Check Pages build or deployment status when available.
6. Request the production URL and distinguish deployment delay from a missing path.
7. Validate critical routes, static assets, CSP behavior, OAuth origin, and one core user flow.
8. Record cache-clearing instructions only when the deployed artifact is confirmed newer than the browser copy.
9. Report pass, fail, or blocked with evidence and rollback guidance.

## Common 404 diagnosis
- Missing `index.html`
- Wrong branch or publishing folder
- Wrong path casing
- File exists only on an unmerged branch
- Pages build has not completed
- Incorrect project-site URL prefix

## Required output
- Publishing source
- Release commit SHA
- Verified files and URLs
- Deployment status
- Functional smoke-test results
- Cache status
- Defects and corrective action
- Final release decision
