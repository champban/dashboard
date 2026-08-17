# Targeted Web App Security 6D Audit — LINE Cancel Flow

- Audit timestamp: 2026-08-17T10:35:00+07:00 (Asia/Bangkok)
- Auditor: ChatGPT / GPT-5.6 Sol
- Repository: `champban/dashboard`
- Branch: `fix/line-cancel-flow`
- Base / rollback source: `96b6361e3b61a9e35fedcd6450e12b96aab17fc7`
- Supabase project: `Dashboard` (`qjaywadzvwvcspdsjxth`)
- Production function before release: `line-todo-webhook` v15
- Scope: standalone `cancel` / `ยกเลิก` no-op command plus Cancel Quick Reply in Add/Edit/Status prompt flows
- Data migration / RLS / secret / provider change: none

## Executive summary

The reported defect is a deterministic command-parser UX gap: after a mutation picker prompt, typed `Cancel` does not match any command and falls through to the generic unknown-command reply. The fix adds an explicit cancellation path that executes after owner linkage and before mutation parsing or `mtp_line_mutations` insertion. The cancellation command therefore performs no planner mutation and creates no mutation draft.

The change also appends a LINE message Quick Reply for Cancel to Add/Edit date pickers, Status pickers, and mutation prompt messages. Existing confirmation-stage postback cancellation is preserved unchanged.

**Decision: PASS for merge and function-only Production deployment after CI on the final PR head succeeds.** No Critical or High finding is introduced by this change.

## Six-dimension findings

| Dimension | Result | Evidence / control | Residual |
|---|---|---|---|
| Identity and access | PASS | Existing LINE HMAC verification and linked-owner lookup are unchanged. Cancel is handled only after successful account mapping. | None introduced |
| Secrets and data | PASS | No secret, token, raw user ID, task payload, migration, or new persistent field is added. CI secret scan reports no credentials. | None introduced |
| Input and content safety | PASS | Cancel allow-list is exact: `cancel` case-insensitive or `ยกเลิก`; strings such as `cancel task` do not match. Existing body and HMAC validation are unchanged. | None introduced |
| Browser and network | PASS | No new origin, endpoint, CORS, CSP, browser bundle behavior, or Netlify/LINE provider setting. Quick Replies use existing LINE message actions. | None introduced |
| Supply chain and deployment | PASS | No dependency or lockfile change. Runtime dependencies remain React/ReactDOM; existing project audit records production dependency audit with no high production vulnerability. Final PR CI must pass build/harness/audit/package/regressions. | Generic `npm ci` reports pre-existing dev-tool findings; not introduced by this PR |
| Operations and recovery | PASS | Rollback is redeploying v15 from the recorded base. No DB rollback required. Live Owner smoke after v16 deployment remains the final acceptance gate. | Owner smoke required |

## Required verification

1. `build/line-cancel-flow.test.mjs` executes in the standard `npm test` command and passes.
2. Existing LINE bot/integration regressions pass.
3. Secret scan passes.
4. Production build/harness/static audit/package pass with zero blockers.
5. Generated application artifact remains reproducible.
6. Supabase deployment creates a new ACTIVE version while retaining `verify_jwt=false` because LINE HMAC is the custom webhook authentication layer.
7. Owner live smoke: start Edit on a harmless task, then Cancel; expected reply `Cancelled. No changes were made.` (or Thai equivalent) and task remains unchanged.

## Rollback

- Git/source rollback: `96b6361e3b61a9e35fedcd6450e12b96aab17fc7`
- Supabase rollback: redeploy the v15 `line-todo-webhook` bundle/source.
- Database rollback: not required; no schema/RLS/data migration.

## Deployment decision

**PASS**, conditional only on the final PR-head CI and post-deploy Owner smoke described above. No Critical/High risk is open for this change.
