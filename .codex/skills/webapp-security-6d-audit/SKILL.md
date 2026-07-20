# Web App Security 6D Audit

## Purpose
Audit a browser-based web application before deployment and document residual risk.

## Six dimensions
1. **Identity and access** — OAuth configuration, scopes, consent, session handling, role boundaries.
2. **Secrets and data** — API keys, tokens, localStorage, exported JSON, attachments, privacy classification.
3. **Input and content safety** — XSS, HTML sanitization, URL validation, file type and size limits, prototype pollution.
4. **Browser and network controls** — CSP, framing, referrer policy, HTTPS, allowed endpoints, external links.
5. **Supply chain and deployment** — dependencies, third-party scripts, repository exposure, build integrity, environment separation.
6. **Operations and recovery** — logging, backups, rollback, incident response, deployment verification, open risks.

## Workflow
1. Inventory entry points, integrations, stored data, and trust boundaries.
2. Search source and repository history for secrets and dangerous patterns.
3. Review OAuth scopes and ensure secrets are never shipped to the browser.
4. Test untrusted text, imported JSON, HTML, URLs, and attachments.
5. Validate CSP and recalculate hashes after inline-script changes.
6. Verify production configuration, HTTPS, repository visibility, and rollback path.
7. Classify findings by severity and status: fixed, accepted, blocked, or follow-up.
8. Produce an audit report and deployment gate decision.

## Mandatory checks
- No client secrets, access tokens, refresh tokens, service-role keys, or private API keys in source
- OAuth access tokens stored in memory where practical
- Least-privilege OAuth scopes
- HTML and URL sanitization
- File size and type limits
- No unsafe dynamic evaluation
- External links use `noopener noreferrer`
- CSP matches actual inline scripts and required endpoints
- Public repository contains no sensitive data
- Backup and rollback procedure exists

## Required output
- Executive summary
- Six-dimension findings table
- Severity and evidence
- Remediation status
- Deployment decision
- Residual risks and owner
