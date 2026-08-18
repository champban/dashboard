# Production Netlify gateway fixture

These two files are byte-for-byte copies used only by the isolated L0a pre-Production gate.

Upstream repository and exact Production source:

- repository: `champban/Line-app`
- commit: `86522956f9b05d18e716e81ed90549d3d9556a3b`
- `lib/lineWebhookForwarder.js` upstream blob: `bec7691b2118fd4e23e42182cb67cabde494d896`
- `lib/line.js` upstream blob: `51bf6d31155e404a42543f36bfac09068090ff52`

Reason for vendoring in the test branch: the repository-scoped GitHub Actions token for `champban/dashboard` cannot clone the separate private `champban/Line-app` repository. The fixture removes that CI-permission dependency while preserving exact-source provenance.

This directory is test evidence only. It must not be imported by Production code and PR #71 must not be merged without a separate Owner decision.
