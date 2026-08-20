# Security 6D Audit — L0a Closure and L0b Source Gate

Pre-deploy audit: `2026-08-17` (`Asia/Bangkok`)

Post-deploy targeted closure: `2026-08-19` (`Asia/Bangkok`)

Repository: `champban/dashboard`

Production scope:

- Final reviewed implementation head `73ad8b6a9815411364afeae34d9ce52418bd6967`
- Source merge `3cafa19aa56f89c8d640acc717726d0043b3bd2c` (PR #70)
- Applied migration `20260818154406_line_webhook_event_reliability`
- Active `line-todo-webhook` v22, `verify_jwt=false`
- Bundle SHA-256 `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`
- Netlify proxy-only gateway unchanged
- Owner-confirmed LINE webhook and redelivery enabled
- Controlled live LINE smoke and Production ledger verification

## L0b source-only pre-merge addendum

**Decision: PENDING TARGETED REMEDIATION RE-REVIEW — NOT APPROVED FOR MERGE OR
PRODUCTION.**

Review #1 is closed with Owner-approved D-1 `A + A1`. The implementation branch
is limited to an additive, unapplied migration, manual Full/Mobile import source,
throwaway tests, and documentation. It does not apply a migration, copy planner
data, backfill, merge, deploy, or change Drive/LINE/Netlify/provider/secrets.

Final Review #2 returned `REQUIRED CHANGES` at `749af1b4a2deeb7853b4a8aa564503e3b9fd5539`.
The five findings were remediated at source/test commit
`14d67b2d2cea69bb16cf78e1d4d54732ca5d93c0` without applying the migration:
broad Supabase default privileges are now simulated in PostgreSQL 17 CI; table
privilege assertions cover `REFERENCES`, `TRIGGER`, and `MAINTAIN`; rollback,
fencing, heartbeat, stream-incomplete, and reject-classification paths are
exercised; and the only migration edits are the two approved NULL-safe staging
predicates. CI run #124 passed. A targeted re-review remains required, so this
decision stays `PENDING`.

| Dimension | Current source control | Remaining gate |
|---|---|---|
| 1. Identity and access | Stable source IDs for tasks/subtasks/events/attachments; no fallback; owner-composite FKs; nine RLS tables; authenticated SELECT-only; six definer RPCs derive `auth.uid()`; no direct service-role grant; broad default privileges simulated and revoked in CI | Targeted exact-head review of the remediation |
| 2. Secrets and data | Publishable authenticated browser client only; attachment binary stripped before transport; staging transient; rejects store metadata only; failure evidence excludes database messages/content | Secret scan and exact-head data-boundary review |
| 3. Input and content safety | 1 MiB/2,000-row chunk limits; exact UTF-8 byte hash before parse; stable-ID quarantine; HTTPS metadata only; D-1 shape anomalies preserved as counts; missing date/parent kind classification tested | Targeted exact-head review of the two NULL-safe predicates and assertions |
| 4. Browser and network controls | Exactly one explicit import control in each client; no timer/config/Drive/LINE call path; failure contained to amber/toast feedback | Generated Full artifact parity and browser regression suite |
| 5. Supply chain and deployment | No dependency/lockfile change; migration source only; Draft PR and CI required | CI green; exact-head SHA recorded; no merge without Owner approval |
| 6. Operations and recovery | Lease/generation fence; server completeness; subtransaction rollback; tombstones; staging purge; rollback/fencing/incomplete-stream tests pass; stopping manual calls leaves Drive/snapshot path intact | Targeted remediation review, then fresh backup and separate migration/backfill/deployment approvals before Production |

Open risks:

- `RISK-L0A-ACL-1`: the existing Production default-privilege/L0a ACL finding
  remains open, outside this migration, and separately gated before the next
  Production database change.
- Legacy subtask `Date.now()` collisions remain whole-batch identity quarantine
  under D-1 A1. A subtask UUID migration is a later L1 prerequisite, not L0b.
- Event windows are positional values and have no stable identity across reorder.
- L0b is a partial projection and is not the planner source of truth.

## L0a Decision

**CONDITIONAL PASS — PRODUCTION VERIFIED**

No unresolved Critical or High finding remains in the L0a scope. The conditional
status records accepted operational residuals rather than a deployment blocker:
Personal-PC-only backup, no scheduled retention cleanup, no exact-once external
LINE reply guarantee, and three pre-existing development dependency advisories.
No provider secret, Netlify, Rich Menu, or Todo source-of-truth change occurred.

## Six-dimension decision table

| Dimension | Result | Production evidence / control | Residual |
|---|---|---|---|
| 1. Identity and access | PASS | Production migration verified RLS on `mtp_line_events`; `anon`/`authenticated` cannot access the table or execute ledger RPCs; `service_role` has required access only; authenticated mutation updates are column-limited and owner RLS remains active. | None blocking. |
| 2. Secrets and data | PASS WITH LOW RESIDUAL | No raw body, LINE user ID, reply token, planner content or secret is persisted/logged; only stable event identity, owner UUID, bounded error code and timestamps are stored. Secret scans passed. | Fallback digest remains pseudonymous and service-role-only. |
| 3. Input and content safety | PASS | Raw-body HMAC at both hops, 1 MiB limits, bounded IDs/error codes, per-event isolation, exact ISO-week boundary tests, strict postback parsing and no AI/free-form SQL. Public invalid-signature tests returned 401. | None blocking. |
| 4. Browser and network controls | PASS WITH ACCEPTED RESIDUAL | Netlify stayed proxy-only with 8-second timeout; 30-second lease and redelivery were tested; Owner verified provider redelivery enabled; live valid POSTs returned 200. | External LINE replies are not mathematically exact-once; a consumed reply token cannot be replayed after a rare reply/finalization crash window. |
| 5. Supply chain and deployment | CONDITIONAL PASS | Final exact-head review passed; CI #104/#116, build, tests, secret scan, generated-artifact parity and real PostgreSQL gate passed; exact five-file package and bundle were recorded. No dependency/lockfile change. | Pre-existing `1 moderate` and `2 high` development advisories are accepted by Owner as a bounded follow-up through `2026-09-17`; no `npm audit fix --force`. |
| 6. Operations and recovery | CONDITIONAL PASS | Encrypted backup integrity passed; v21 rollback source/hash retained; migration/RLS verified; v22 ACTIVE; live smoke produced 5 processed, 0 failed/processing, max attempt 1, and no mutation change. | Backup has one Owner-approved copy on Personal PC; retention RPC is not scheduled. |

## L0a findings and closures

### L0A-01 — irreversible link claim ordering

**Status: CLOSED IN PRODUCTION**

`mtp_claim_line_link` consumes a one-time code. The runtime now sends the linked
reply before attaching `owner_id` to the event ledger. A behavioral test proves a
synthetic ledger-owner failure occurs only after linked messages were delivered.
The code remains hashed, single-use and ten-minute limited.

Residual: if reply delivery itself fails after the claim, the code remains
consumed. Recovery is generating a new link code; making codes reusable would
violate the established security invariant.

### L0A-02 — authenticated idempotency-key squatting

**Status: CLOSED IN PRODUCTION**

Authenticated clients can no longer update every mutation column. Real SQL/RLS
tests prove the allowed four queue-completion fields work while
`source_event_id`, `operation`, `owner_id` and `expires_at` are denied.

### L0A-03 — real SQL and concurrency evidence

**Status: CLOSED IN PRODUCTION**

Real PostgreSQL lifecycle/RLS/concurrency testing passed before deployment,
including `claimed -> busy -> claimed_stale -> claimed_retry ->
duplicate_processed`, old-attempt rejection, terminal-only cleanup and genuine
two-session `claimed=1, busy=1` behavior.

Production migration `20260818154406_line_webhook_event_reliability` then passed
catalog verification: required columns/indexes/constraints exist, RLS is enabled,
client roles are denied, service-role RPC access is present, mutation column
privileges are restricted, and the 17 pre-existing mutation rows were unchanged.

### L0A-04 — retry and reply guarantee

**Status: CLOSED FOR L0a / RESIDUAL ACCEPTED**

Persistent deduplication, per-event retry state and mutation-draft idempotency
are Production verified. Owner confirmed LINE webhook redelivery enabled, and the
8-second gateway timeout/30-second lease behavior passed isolated testing.

The system truthfully does not claim exact-once external replies. If LINE accepts
a reply and final ledger completion then fails, state can be repaired but a
consumed reply token generally cannot reproduce the original user-visible reply.
A durable outbound outbox/worker would be required for a stronger guarantee and
is outside L0a.

### L0A-05 — current 6D scope

**Status: POST-DEPLOY TARGETED AUDIT COMPLETE**

This report now covers implementation review, the exact Production migration,
v22 deployment, public endpoint checks, controlled live smoke, ledger/mutation
verification, backup and rollback readiness. Historical audits remain available
for their original scopes but are not used as substitute evidence for L0a.

### L0A-06 / L0A-07 — ISO-week correctness and prevention commentary

**Status: CLOSED IN PRODUCTION**

Tests now assert exact cross-year boundaries and Monday/Sunday weekdays. The
explanatory test comments removed by the first implementation were restored. The
Flex footer comment now accurately records that a schema rejection becomes
`line_reply_failed -> failed -> HTTP 503`, rather than being silently swallowed.

### L0A-08 — mutation decision testability

**Status: CLOSED IN PRODUCTION**

Mutation repository wiring and decision semantics were extracted from
`index.ts` into dependency-free `event-processing.js`. Behavioral tests cover
retried confirm, conflicting cancel, expired draft and missing draft.

## Verification evidence

- Final Claude read-only review: `PASS` at `73ad8b6a9815411364afeae34d9ce52418bd6967`.
- GitHub Actions #104: exact-head standard verification plus real PostgreSQL
  SQL/RLS/concurrency — PASS.
- Evidence PR #71: signed duplicate replay and timeout/lease tests — PASS.
- Evidence PR #72: encrypted logical backup creation/decryption/hash verification
  — PASS; Owner accepted Personal-PC-only storage risk.
- Production migration `20260818154406_line_webhook_event_reliability`:
  structure, RLS, grants, RPCs and unchanged mutation count — PASS.
- Edge Function v22 ACTIVE, `verify_jwt=false`, bundle
  `6cf913cd84e1c30c95d134e91060755be1bd8832b2d686ce213474f7421155aa`.
- Evidence PR #74 / CI #116: direct and Netlify invalid-signature/public endpoint
  checks — PASS.
- Owner live smoke: `menu`, Edit -> Cancel, `search week 49 2026` — PASS.
- Post-smoke data: 5 processed; 0 failed; 0 processing; max attempt 1; mutation
  rows 17; no non-null `source_event_id`; no rollback required.

## Production gates completed

1. Final independent exact-head review — PASS.
2. PR #69 closed unmerged; PR #70 merged reviewed source — PASS.
3. Encrypted logical backup and integrity verification — PASS with accepted
   single-copy risk.
4. Exact additive migration applied and Production schema/RLS checked — PASS.
5. LINE webhook and redelivery Owner-verified enabled — PASS.
6. Signed duplicate replay through exact gateway logic — PASS in isolation.
7. Netlify 8-second timeout / 30-second lease test — PASS.
8. v21 rollback source/version/hash recorded — PASS.
9. Exact five-file source package deployed as v22 — PASS.
10. Invalid signature, menu, Cancel and ISO-week live smoke — PASS.
11. Post-deploy targeted 6D decision — this `CONDITIONAL PASS` closure.

## Rollback and backup

- Runtime rollback: redeploy captured `line-todo-webhook` v21 and verify invalid
  signature rejection plus one controlled `menu` reply.
- The additive ledger migration remains compatible with v21 and is not removed
  during runtime rollback without separate destructive-change approval.
- Encrypted backup `20260818T145008Z` passed integrity verification. Owner accepts
  one Personal-PC copy; passphrase remains separate.
- L0a did not rewrite Todo/planner content; Production mutation rows remained 17.
- No retention cleanup or restore drill is authorized by this closure.

## Accepted risks register

| ID | Risk | Severity | Owner | Revisit trigger | Status |
|---|---|---:|---|---|---|
| L0A-R1 | Redelivery disabled would lose failed/busy events without an internal worker | High if configuration regresses | Owner / release manager | Any LINE provider configuration change | CLOSED FOR RELEASE — enabled verified; configuration must remain enabled |
| L0A-R2 | Reply accepted but final ledger update fails; retry cannot rely on consumed reply token | Medium | Backend owner | Multi-user rollout or outbound-worker design | Accepted, documented residual |
| L0A-R3 | Deterministic fallback digest may be guessable for low-entropy events if ledger access expands | Low | Backend/security owner | Access beyond service role | Accepted with service-role-only control |
| L0A-R4 | Gateway timeout can leave an event busy until the 30-second lease expires | Medium | Backend/operations owner | Forwarder timeout or LINE retry behavior changes | CLOSED FOR RELEASE — isolated 8s/30s test passed; live max runtime below 8s |
| L0A-R5 | Pre-existing dev dependency advisories: 1 moderate, 2 high | Medium | `champban` | `2026-09-17` or dependency/runtime reachability change | Explicitly accepted for this release; no package/lockfile change; separate remediation required |
| L0A-R6 | Retention RPC exists but no schedule is approved | Low | Operations owner | Before ledger volume/retention threshold is reached | Deferred; cleanup remains outside request path |
| L0A-R7 | Only one encrypted backup copy exists on Personal PC | Medium | P'Boy | Before future destructive migration or device-risk change | Explicitly accepted for additive L0a only |

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
