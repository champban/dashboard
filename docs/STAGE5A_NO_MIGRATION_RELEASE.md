# Stage 5A — No-Migration LINE Conflict Safety

Status: **APPROVED FOR SOURCE IMPLEMENTATION / DO NOT MERGE OR DEPLOY**

Owner approval date: `2026-09-02` (`Asia/Bangkok`)

Repository: `champban/dashboard`

Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`

Branch: `feature/stage5a-line-import-conflict`

## Objective

Deliver one useful Stage 5A increment without changing Production Database,
Storage, Auth, RLS, provider configuration or secrets: close the remaining
Google Drive conflict path that can silently discard a confirmed LINE mutation
when the user chooses the cloud copy.

## Verified existing gap

The Full app's `importUseCloud` path applies `importConflict.cloud.payload`
directly and publishes it without first calling
`window.__MTP_LINE__.prepareMutations(...)`. A confirmed LINE mutation can
therefore remain `confirmed` and unapplied when the user opens a conflicting
local JSON file and chooses the Drive copy.

The Mobile conflict `Cloud → Local` path also downloads and adopts the Drive
payload directly. Although `syncNow` prepares the current local state before
showing the conflict, the later cloud-pull handler downloads a fresh payload and
can overwrite that prepared state. It must prepare the downloaded payload at the
final decision point.

## Required implementation

### Full app

Update `src/App.jsx` only within the `importUseCloud` flow:

1. Prepare pending LINE mutations against the selected cloud payload.
2. When mutation IDs exist, create a fresh `dataLastUpdated` stamp and upload the
   merged payload to the already-linked Drive file before marking mutations
   complete.
3. Persist the returned Drive `modifiedTime`, pushed stamp and fingerprint.
4. Call `completeMutations` only after the Drive update succeeds.
5. Apply the merged payload locally and publish the LINE snapshot only after the
   successful Drive write.
6. Reuse the existing rejected-mutation notice helper.
7. When no mutation IDs exist, retain the current cloud-wins behaviour.
8. Re-read current Drive metadata/content immediately before writing and use
   the current ETag as an `If-Match` precondition. If Drive advanced, refresh the
   conflict instead of overwriting it.
9. After upload succeeds, retain the exact payload, modified time, fingerprint,
   IDs and rejections in a completion checkpoint. A retry performs only the
   idempotent queue completion and adopts that checkpoint payload.
10. On upload/completion failure, keep the conflict/checkpoint and report both
    the later error and any earlier rejected mutations.

### Mobile app

Update `mobile/index.html` only within the conflict `Cloud → Local` handler:

1. Prepare LINE mutations against the freshly downloaded cloud payload.
2. If mutation IDs exist, upload the merged payload before adopting it locally.
3. Complete mutation IDs only after the Drive update succeeds.
4. Use the merged payload for `state.data`, local persistence and snapshot
   publication.
5. Persist the returned `modifiedTime`; surface rejected mutations with the
   existing `lineSaveToastText(...)` mechanism.
6. If no mutation IDs exist, preserve current behaviour.
7. Persist a temporary exact post-upload checkpoint before completion. A
   retry/reload completes only those exact IDs and does not re-run mutation
   preparation; clear the checkpoint only after exact local adoption succeeds.
8. Preserve the downloaded cloud profile language when serialising the merged
   upload.
9. On upload/completion failure, keep the conflict/checkpoint and report both
   the later error and any earlier rejected mutations.

## Tests

- Extend `build/sync-content-check.test.mjs` with a Full-app regression that
  reproduces: local JSON import conflict + cloud chosen + pending LINE mutation.
- Prove the mutation is merged into the Drive upload, applied to browser storage,
  and completed only after upload.
- Prove a failed upload leaves the mutation uncompleted and does not report a
  successful adoption.
- Prove stale Drive revisions are refreshed, ETag preconditions are supplied,
  ambiguous completion responses retain exact recovery state, and retries do
  not re-prepare or duplicate a mutation.
- Prove Mobile persists completion-only recovery, preserves cloud language and
  surfaces earlier rejections on later failure.
- Extend `build/line-contract.test.mjs` to pin these Full/Mobile contracts.
- Preserve all existing sync, LINE, build, packaging and secret-scan tests.

## Durable records

- Update `PROJECT_CONTEXT.md` to close the open `importUseCloud` backlog row and
  add a Prevented Recurrence Register entry for every cloud-adopt decision point
  requiring pending-LINE-mutation preparation.
- Update `CHANGELOG.md` with a source-only Stage 5A candidate entry.

## Non-goals / prohibited actions

- No Supabase schema or migration change.
- No Production SQL/DDL/DML or migration-history write.
- No Storage bucket/policy/object operation.
- No Auth, RLS, provider, Environment or secret change.
- No LINE Edge Function deployment or provider configuration.
- No import/backfill/reconciliation or Drive source-of-truth change.
- No merge, GitHub Pages deploy, Netlify deploy or Production activation.
- Do not reopen PR #100 or any custom backup/recovery lane.

## Verification gate

Required before this Stage 5A source increment can be called complete:

1. `npm test`
2. `npm run verify`
3. `npm run scan-secrets`
4. Exact changed-file review
5. GitHub Actions terminal PASS
6. Independent exact-head Codex review with no unresolved Critical/High/Medium
   finding

Rollback is branch deletion or commit revert; Production remains unchanged.


## Implementation record

Status: **REMEDIATED ROUND 3 ON DRAFT SOURCE BRANCH / EXACT-HEAD CI + REVIEW REQUIRED**

Changed source and test boundary:

- `src/App.jsx` — final cloud-wins import decision uses exact canonical
  base/target/current comparison, ETag preconditions, strict set/read-back for
  checkpoints and local adoption, completion-only retry, and explicit keep-both
  reconciliation for ambiguous PATCH results.
- `mobile/index.html` — preserves cloud language, persists exact completion-only
  or blocked recovery state, and saves the current Drive copy before resolving an
  ambiguous recovery without re-preparing a mutation.
- `build/sync-content-check.test.mjs` — lightweight source contracts for strict
  storage, full-field comparison, blocked recovery and keep-both ordering.
- `build/line-contract.test.mjs` — executable helper regressions plus Full/Mobile
  ETag, strict-adoption, canonical comparison, no-duplicate and CSP contracts.
- `PROJECT_CONTEXT.md` — backlog closure and `LINE-CLOUD-ADOPT-1` prevention
  control.
- `CHANGELOG.md` — source-only candidate record.
- Generated `index.html` and `BUILD-MANIFEST.json` are refreshed only by the
  normal repository verification/package pipeline.

This implementation does not change Database, migrations, Storage, Auth, RLS,
providers, Environment, secrets, backup/recovery, import/reconciliation,
activation, deployment or Production. PR merge remains a separate Owner gate.

## Exact-head review remediation round 2

The second exact-head review required four additional source-only controls:

- Full prepared/uploaded completion state is profile-scoped and durable in the
  existing Drive sync record, so reload recovery never re-prepares an already
  uploaded mutation.
- Mobile metadata retains the Drive ETag and every conflict upload uses an
  `If-Match` precondition after final revision revalidation.
- A stale Mobile prepared checkpoint is deleted before the latest conflict is
  reopened; it cannot permanently short-circuit later sync attempts.
- Full 412/stale-revision recovery preserves and surfaces preparation rejections
  while refreshing the conflict.

Focused contracts cover durable phase ordering, completion-only retry, exact
payload adoption, Mobile stale-checkpoint reopening, ETag preconditions, and
rejection reporting. The source boundary remains no-migration/no-Production.

## Clean mirror review and remediation round 3

- Temporary Draft PR #106 was created from the exact base as one commit with the
  byte-identical tree from PR #105. Its CI run `33771928437` passed all six jobs.
  The mirror was closed without merge or deployment immediately after review.
- The clean review found four source-only failure modes: a `null` storage result
  could be mistaken for a durable checkpoint; local adoption could clear the
  checkpoint after a swallowed write failure; a potentially committed PATCH
  followed by another Drive change could lose the only reconciliation marker;
  and the normal partial sync fingerprint omitted fields required for recovery.
- Round 3 fails closed on null or mismatched storage read-back, persists exact
  complete payload canonical forms, retains an ambiguous recovery as `blocked`,
  and exposes one explicit safe action that first saves the current Drive bytes as
  a conflict copy and then finishes the exact stored mutation IDs.
- No Database, migration, Storage, Auth, RLS, provider, Environment, secret,
  Production data, custom backup/recovery lane, merge, deployment or HTML-status
  work is part of this remediation.

## Exact-head review remediation round 4

The latest exact-head independent review required four final source-only controls:

- Full and Mobile record a canonical local baseline when recovery begins. If the
  user edits locally while completion is pending, the latest local payload is
  saved beside the master as a conflict copy before and after queue completion,
  before the recovered payload can be adopted.
- Full `importUseCloud` and blocked-recovery actions are single-flight. Full
  background content checks and the 10-second poll pause while a completion
  checkpoint exists.
- Mobile Cloud-to-Local preparation and blocked-recovery actions use the existing
  synchronous `driveBusy` guard with unconditional release.
- Focused contracts verify local-edit detection, copy-before-adopt ordering,
  before/after-completion preservation and single-flight guards.

This round remains inside the exact nine-file no-migration boundary. It performs
no Database, migration, Storage, Auth, RLS, provider, Environment, secret,
Production data, backup/recovery, merge, deployment or HTML-status operation.

## Final file-identity and concurrency closure

- Full cloud-choice rejects entry while Check Now owns the checker lock; Check
  Now already rejects entry after cloud-choice synchronously owns the busy lock.
  The exclusion is acquired before mutation preparation and always released.
- Full relink and unlink refuse to replace or clear the linked Drive file while
  a durable completion checkpoint exists. The pending IDs stay bound to their
  original file until recovery completes.
- Mobile applies the same checkpoint guard to linking, creating a new active
  cloud file and deleting the currently active file. Deleting an unrelated file
  remains allowed because it cannot detach the checkpoint.
- Mobile `syncNow` rejects entry before any Drive or LINE work whenever conflict
  or recovery already owns the synchronous `driveBusy` lock.
- `build/line-contract.test.mjs` and `build/sync-content-check.test.mjs` pin the
  source ordering and exercise both trigger orders, proving a confirmed LINE
  `add` is prepared once under the guarded races.
- Follow-up exact-head review also binds Full recovery to the active profile:
  switching profiles or deleting the active profile is blocked before any
  profile-scoped storage is changed, including the in-flight interval after
  cloud-choice acquires `gsyncBusy` but before its checkpoint exists. Mobile
  connect, file-list, rename and
  conflict-save actions now reject entry before acquiring `driveBusy`, so no
  contender can release another sync/recovery action's lock.

The targeted 6D assessment for this bounded source change is unchanged in
dimensions 1–3 (no Identity/Auth/RLS, secret/data contract or untrusted-input
surface change), preserves generated Mobile CSP integrity in dimension 4, and
requires exact-head CI/generated-package parity plus independent review for
dimension 5. Dimension 6 improves by retaining the original recovery file
identity and serializing recovery entry points. Production promotion remains
blocked until every exact-head release gate in this document passes.

## Stage 5A final-review remediation

The release-gate review found two P1 failures in the Full paths that had learned
to apply pending LINE mutations outside the original local-file conflict flow:
they uploaded before persisting a completion checkpoint, and cloud-adopt/check
PATCHes did not pin the downloaded Drive revision. This one permitted remediation
round closes both findings without changing the nine-file/source-only boundary:

- All twelve Full mutation-upload call sites enter `startFullLineCompletion`.
  The helper persists exact base/target canonical payloads, mutation IDs,
  rejections and the owning sync/file identity before any mutation PATCH.
- Recovery re-reads Drive and requires a non-empty current/base ETag for
  `If-Match`. A concurrent save produces 412, keeps the newer Drive bytes and
  retains the exact recovery as `blocked` for the existing keep-both decision.
- An uploaded checkpoint survives an ambiguous queue-completion response. Retry
  completes only its stored IDs, performs no second preparation or upload, and
  clears the marker only after strict local adoption and sync metadata storage.
- On a first save, Drive receives the unmutated screen payload first; the pending
  mutation is uploaded only after the returned file identity is durably bound to
  the same checkpoint primitive.
- Focused executable regressions reproduce both ambiguous completion and a
  concurrent Drive write between download and PATCH, including ETag, zero stale
  writes, no duplicate preparation/upload and no premature queue completion.

No Database, migration, Storage, Auth, RLS, provider, Environment, secret,
Production data, backup/recovery workflow, deployment or destructive operation
is part of this remediation.
