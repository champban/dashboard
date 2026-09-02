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
8. On Drive failure, do not complete mutation IDs and do not claim sync success.

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
7. On failure, do not complete IDs and do not silently mark the conflict resolved.

## Tests

- Extend `build/sync-content-check.test.mjs` with a Full-app regression that
  reproduces: local JSON import conflict + cloud chosen + pending LINE mutation.
- Prove the mutation is merged into the Drive upload, applied to browser storage,
  and completed only after upload.
- Prove a failed upload leaves the mutation uncompleted and does not report a
  successful adoption.
- Extend `build/line-contract.test.mjs`, or add one focused Mobile test, to pin
  prepare → upload → complete → adopt ordering for the Mobile cloud-pull path.
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

Status: **IMPLEMENTED ON DRAFT SOURCE BRANCH / VERIFICATION REQUIRED**

Changed source and test boundary:

- `src/App.jsx` — final cloud-wins import decision prepares pending LINE
  mutations, uploads the merged payload before completing IDs/adopting locally,
  and retains the unresolved conflict on upload failure.
- `mobile/index.html` — final downloaded cloud payload follows prepare → upload
  → complete → adopt ordering; failed uploads do not close the conflict.
- `build/sync-content-check.test.mjs` — executable success/failure ordering
  regressions for Full and Mobile.
- `build/line-contract.test.mjs` — static ordering, rejection-message and
  fail-closed contract pins.
- `PROJECT_CONTEXT.md` — backlog closure and `LINE-CLOUD-ADOPT-1` prevention
  control.
- `CHANGELOG.md` — source-only candidate record.
- Generated `index.html` and `BUILD-MANIFEST.json` are refreshed only by the
  normal repository verification/package pipeline.

This implementation does not change Database, migrations, Storage, Auth, RLS,
providers, Environment, secrets, backup/recovery, import/reconciliation,
activation, deployment or Production. PR merge remains a separate Owner gate.
