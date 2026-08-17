# Security 6D Audit — L0a LINE Webhook Reliability Hardening

Audit date: `2026-08-17` (`Asia/Bangkok`)

Repository: `champban/dashboard`

Scope:

- Draft PR `#70`
- Branch `fix/l0a-line-webhook-reliability`
- Base `576513707f4567e6707e956e3e3b5ada75d42897`
- Verified remediation code head `154c944eab5e28de0e46c8aed268fd024122f510`
- Migration `20260817150000_line_webhook_event_reliability.sql`
- `line-todo-webhook` reliability runtime and tests

Production impact at this audit: **NONE**. PR remains Draft; migration is not
applied; Edge Function v21 remains active; Netlify, LINE Console, Rich Menu,
secrets and Production data are unchanged.

## Decision

**CONDITIONAL PASS FOR DRAFT RELEASE CANDIDATE / PRODUCTION BLOCKED**

No unresolved Critical or High code finding remains in the reviewed L0a scope.
Production promotion is blocked until the provider and data gates listed below
are independently verified and separately approved.

## Six-dimension decision table

| Dimension | Result | Evidence / control | Open gate / residual |
|---|---|---|---|
| 1. Identity and access | PASS | `mtp_line_events` has RLS enabled; `anon` and `authenticated` have no table privileges and cannot execute claim/finalize/cleanup RPCs. `service_role` alone receives required access. The pre-L0a table-level authenticated mutation `UPDATE` is revoked and replaced with column-level access to `status`, `error_code`, `applied_at`, `updated_at`. Real PostgreSQL tests prove protected columns cannot be changed by the owner client. Existing owner RLS policies remain unchanged. | Production migration remains unapplied. Re-run the same permission matrix after application. |
| 2. Secrets and data | PASS WITH LOW RESIDUAL | No raw webhook body, raw LINE user ID, reply token, planner content or secret is stored in the ledger or logged. Error persistence is a bounded code only. Missing `webhookEventId` uses a deterministic SHA-256 digest over canonical event fields; volatile reply fields are excluded. Secret scan passed over 84 tracked text files. | The fallback hash is pseudonymous, not anonymous: a low-entropy event could be guessed offline if the service-role-only ledger were exposed. Treat the digest and owner UUID as sensitive operational metadata. |
| 3. Input and content safety | PASS | Raw-body HMAC verification remains before JSON parsing. Event IDs and error codes have explicit length/format bounds. Event processing is isolated per event. ISO-week parsing now asserts Monday/Sunday boundaries and exact week 1/week 53 dates. Mutation postbacks preserve legacy syntax while allowing only `lang=en|th`. No AI, free-form SQL or provider-generated code is introduced. | Signed replay through an isolated Netlify → Supabase path remains outstanding. |
| 4. Browser and network controls | CONDITIONAL | No browser source or CSP changes. Netlify remains proxy-only with an 8-second timeout; Supabase remains sole processor/replier. The event lease is reduced to 30 seconds so a gateway timeout leaves at most roughly 22 additional seconds before stale reclaim. The outer handler returns sanitized errors and never logs provider payloads. | HTTP 503 retry safety requires LINE webhook redelivery to be enabled. With redelivery disabled and no internal retry worker, failed/busy events are lost. Provider setting and actual retry behavior are not yet verified. A redelivered reply token must not be relied upon for user-visible recovery. |
| 5. Supply chain and deployment | CONDITIONAL PASS | No dependency or `package-lock.json` change. GitHub Actions uses pinned major action versions and adds a PostgreSQL 16 service-only SQL gate. Build, package/CSP `6/6`, generated-artifact parity and ES2019 guard passed. Exact code head and workflow evidence are recorded. | `npm ci` reports three pre-existing development dependency advisories: `1 moderate`, `2 high`. Accepted temporarily by Owner `champban`; expiry is **before any Production promotion or 2026-09-17, whichever occurs first**. Reassess package reachability and remediation before expiry; do not use `npm audit fix --force` without separate approval. |
| 6. Operations and recovery | CONDITIONAL | Persistent lifecycle/attempt state, atomic claim, stale lease, old-attempt rejection, mutation `source_event_id` uniqueness, per-event batch isolation and terminal-row cleanup exist. Real PostgreSQL lifecycle/RLS/cleanup tests passed. Genuine two-session concurrency returned exactly `claimed=1, busy=1`. Production rollback remains Edge Function v21; migration is additive and nullable. | Verify recoverable Supabase backup, migration against an isolated Supabase environment or approved equivalent, LINE redelivery enabled, signed duplicate replay through Netlify, active v21 rollback evidence, and post-deploy smoke. No retention schedule is approved yet. |

## L0a findings and closures

### L0A-01 — irreversible link claim ordering

**Status: CLOSED IN DRAFT**

`mtp_claim_line_link` consumes a one-time code. The runtime now sends the linked
reply before attaching `owner_id` to the event ledger. A behavioral test proves a
synthetic ledger-owner failure occurs only after linked messages were delivered.
The code remains hashed, single-use and ten-minute limited.

Residual: if reply delivery itself fails after the claim, the code remains
consumed. Recovery is generating a new link code; making codes reusable would
violate the established security invariant.

### L0A-02 — authenticated idempotency-key squatting

**Status: CLOSED IN DRAFT**

Authenticated clients can no longer update every mutation column. Real SQL/RLS
tests prove the allowed four queue-completion fields work while
`source_event_id`, `operation`, `owner_id` and `expires_at` are denied.

### L0A-03 — real SQL and concurrency evidence

**Status: CLOSED FOR POSTGRESQL 16 / SUPABASE-SPECIFIC GATE REMAINS**

Workflow run `32043846970`, job `LINE event ledger SQL / RLS / concurrency`:

- migration execution: PASS;
- lifecycle including `claimed_stale` and `claimed_retry`: PASS;
- old attempt cannot finish new lease: PASS;
- anon/authenticated table and RPC denial: PASS;
- authenticated column-level mutation privileges: PASS;
- terminal-only cleanup: PASS;
- two concurrent sessions: `claimed=1, busy=1`.

The first SQL attempt exposed a test-environment mismatch: a plain PostgreSQL
`service_role` did not carry Supabase's `BYPASSRLS` behavior, so the stale-test
setup update was silently filtered. The throwaway role was corrected to mirror
Supabase and the complete gate passed. This was test-harness remediation, not a
Production change.

### L0A-04 — retry and reply guarantee

**Status: DOCUMENTED / PROVIDER GATE OPEN**

The system guarantees persistent deduplication of completed database work and
retryable event processing. It does not guarantee exact-once external replies.

Two residual directions remain:

1. reply accepted, final ledger write fails — redelivery may repair state but the
   original reply token is consumed and user-visible delivery cannot be
   guaranteed;
2. marking processed before reply would suppress a failed reply permanently, so
   the runtime deliberately does not take that ordering.

A durable outbound reply outbox/worker would be required for a stronger delivery
guarantee and is outside L0a.

### L0A-05 — current 6D scope

**Status: THIS AUDIT**

The prior audit stated “No runtime change” and did not cover L0a. This targeted
audit supersedes that decision only for PR #70. Historical release audits remain
available in Git history at base `576513707f4567e6707e956e3e3b5ada75d42897`
and in `AUDIT-6D-SECURITY-REPORT.md`; they are not evidence for this Draft.

### L0A-06 / L0A-07 — ISO-week correctness and prevention commentary

**Status: CLOSED IN DRAFT**

Tests now assert exact cross-year boundaries and Monday/Sunday weekdays. The
explanatory test comments removed by the first implementation were restored. The
Flex footer comment now accurately records that a schema rejection becomes
`line_reply_failed -> failed -> HTTP 503`, rather than being silently swallowed.

### L0A-08 — mutation decision testability

**Status: CLOSED IN DRAFT**

Mutation repository wiring and decision semantics were extracted from
`index.ts` into dependency-free `event-processing.js`. Behavioral tests cover
retried confirm, conflicting cancel, expired draft and missing draft.

## Verification evidence

Exact code head: `154c944eab5e28de0e46c8aed268fd024122f510`

GitHub Actions run: `32043846970` / run #102

### Main job — PASS

- `npm ci`
- `npm run scan-secrets`: no credentials found
- `npm run verify`
- Vite Production build
- harness `LEN 25129 / NODES 141`
- static audit `0 blockers`, pre-existing warnings `3`
- package/CSP verification `6/6`
- `npm test`
- LINE bot logic: PASS
- Cancel flow: 6/6
- LINE event processing reliability: PASS
- LINE browser snapshot: PASS
- Supabase auth-storage security: PASS
- LINE integration contracts: PASS
- health-check self-test: PASS
- generated artifact byte parity: PASS
- ES2019 guard: PASS

### SQL/RLS/concurrency job — PASS

- PostgreSQL `16.15` service
- repeatable migration/RLS test
- lifecycle and lease test
- permission matrix
- cleanup test
- two-session concurrency test

## Production stop gates

Production remains blocked until all are complete:

1. Independent review/reconciliation of the final PR #70 head.
2. PR #69 closed as superseded so it cannot overwrite the function source.
3. Recoverable Supabase backup/export verified.
4. Exact migration reviewed and applied only under separate approval.
5. LINE Developers Console webhook redelivery verified **enabled**.
6. Signed event replayed twice through Netlify → isolated Supabase; one database
   effect and safe terminal-event skip proven.
7. Netlify 8-second timeout / 30-second lease behavior exercised.
8. Active v21 runtime rollback source/version recorded.
9. Exact reviewed merge SHA deployed to Supabase.
10. Invalid signature, menu, duplicate event, ISO-week search and Thai mutation
    result smoke tests passed.
11. Post-deploy 6D decision updated from Conditional to PASS or explicitly
    BLOCKED.

## Rollback and backup

- Before migration: take and verify a recoverable Supabase backup/export.
- Runtime rollback: redeploy current active `line-todo-webhook` v21.
- Migration is additive; the ledger and nullable `source_event_id` may remain
  unused if runtime rolls back.
- Do not drop ledger/audit rows during incident response unless recovery evidence
  proves that is necessary.
- No task/planner data is changed by this Draft PR.

## Accepted risks register

| ID | Risk | Severity | Owner | Expiry / revisit trigger | Status |
|---|---|---:|---|---|---|
| L0A-R1 | Redelivery disabled would make failed/busy events permanently lost because no internal retry worker exists | High if disabled; controlled gate before deploy | Owner / release manager | Before any Production promotion | OPEN — Production blocker |
| L0A-R2 | Reply accepted but final ledger update fails; retry cannot rely on a usable reply token | Medium | Backend owner | Revisit before multi-user rollout or when an outbound worker is designed | Accepted for owner-only Draft with documented limitation |
| L0A-R3 | Deterministic fallback digest may be guessable for low-entropy events if the ledger is exposed | Low | Backend/security owner | Revisit if ledger access expands beyond service role | Accepted with service-role-only control |
| L0A-R4 | Netlify timeout can leave an event busy for up to roughly 22 additional seconds | Medium | Backend/operations owner | Verify before Production; revisit if forwarder timeout changes | OPEN — Production gate |
| L0A-R5 | Pre-existing dev dependency advisories: 1 moderate, 2 high | Medium | `champban` | Before Production promotion or `2026-09-17`, whichever occurs first | Temporarily accepted; no dependency change in L0a |
| L0A-R6 | Retention RPC exists but no schedule is approved | Low | Operations owner | Before ledger exceeds agreed retention/volume threshold | Deferred; cleanup remains outside request path |

## Historical audit index

The previous `2026-07-30` audit covered Rich Menu assets, health monitoring,
Search-button activation and the earlier read-only LINE integration. Its final
Decision was PASS for that historical scope and included accepted residual
`LINE-5` for credential-health monitoring. It explicitly did **not** cover this
runtime/migration change.

Authoritative historical evidence remains available through Git history at:

- base commit `576513707f4567e6707e956e3e3b5ada75d42897`;
- `AUDIT-6D-SECURITY-REPORT.md`;
- `docs/PROJECT_PERFORMANCE_KPI.md`;
- prior workflow and release records referenced by `PROJECT_CONTEXT.md`.
