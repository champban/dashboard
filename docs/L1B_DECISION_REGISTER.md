# L1B Decision Register

Status: **ACTIVE / DURABLE DECISION SOURCE**

Date baseline: `2026-08-24` (`Asia/Bangkok`)

This register prevents repeated Owner questions and preserves approval boundaries
across session, worker, and context rollover. Git and current PR evidence override
stale prose when they conflict.

## Decisions

| Decision ID | Date | Requirement | Selected option | Approval boundary | Roadmap item | Branch / PR | Conditions | Status |
|---|---|---|---|---|---|---|---|---|
| D-L1B-001 | 2026-08-24 | L1B readiness takeover | Codex/ChatGPT primary takeover from durable Git state | Verify actual repository state; do not trust inaccessible local-only handover state blindly | Readiness takeover | `docs/l1b-promotion-readiness` / PR #93 | Stop on material drift | APPROVED |
| D-L1B-002 | 2026-08-24 | Current delivery scope | Readiness docs, commits/pushes, Draft PR, exact-head CI/review remediation | No merge, Production migration/import/Storage mutation, client activation, Auth/RLS/secret/provider change, Drive demotion, cleanup or L1C | Readiness packet | PR #93 | Scope/risk unchanged | APPROVED |
| D-L1B-003 | 2026-08-24 | Execution model | Continuous autonomous execution after scope lock | Milestones are informational; stop only for a true blocking ambiguity, external blocker, or unauthorized Critical Gate | Whole approved readiness scope | current lane | Existing approval boundaries remain controlling | APPROVED |
| D-L1B-004 | 2026-08-24 | Owner interaction model | One consolidated preflight decision packet plus conditional approvals | Do not re-ask ordinary engineering/test/CI/doc/review questions; new material risk invalidates only the affected authorization | Whole roadmap | all later L1B lanes | Check this register before asking | APPROVED |
| D-L1B-005 | existing | Current planner authority | Browser + Google Drive remain authoritative | No Supabase authority, Drive demotion, or L1C cutover without later explicit decision | L1B/L1C boundary | `main` | No promotion gate silently changes authority | EXISTING PROJECT DECISION |
| D-L1B-006 | 2026-08-24 | Session continuity and rollover | Repository + durable project-state files are authoritative; checkpoint after meaningful stages; rollover is not an approval gate | Never claim background continuation without a real persistent runner/orchestrator; if unavailable, checkpoint then provide one concise ready-to-copy handover only when rollover is actually needed | All execution lanes | repo status files + PR evidence | New worker must reread mandatory context and verify branch/HEAD/base/PR/CI before resuming | APPROVED |
| D-L1B-007 | 2026-08-24 | Post-schema disabled-client gate | Do not republish unchanged L1B client bytes; verify the already-published client remains disabled after schema/Storage apply | A new client publication is allowed only if client bytes change and then requires its applicable release gate; no activation is implied | L1B post-apply verification | future apply lane | Existing published artifact remains byte-equivalent and disabled | ENGINEERING DEFAULT / NON-BLOCKING |

## Foreseeable Owner decisions

The detailed question format, recommendations, impacts, defaults, and approval
boundaries are maintained in `docs/L1B_OWNER_DECISION_PACKET.md`.

Current grouping:

- `Q-L1B-001`: conditional docs-only readiness PR merge/publication.
- `Q-L1B-002`: fresh post-import B-1 backup plus exact B-2 isolated restore.
- `Q-L1B-003`: read-only Production preflight and provider-artifact preparation.
- `Q-L1B-004`: promotion-artifact PR merge — recommended to defer to final exact gate.
- `Q-L1B-005`: Production DB + Storage apply — final exact Critical Gate; no pre-approval recommended.
- `Q-L1B-006`: activation/reconciliation/L1C — outside current promotion scope.

## New-question classification

- **Category A — Fully Blocking:** pause affected implementation, consolidate all
  known blocking questions, ask once with recommendations/defaults.
- **Category B — Partially Blocking:** pause only the affected component, continue
  unaffected work, include the question in the next consolidated packet.
- **Category C — Non-Blocking:** choose the safest reversible default or defer,
  record it here, and continue.

## Rollover rule

A worker/session change is operational continuity, not a milestone or approval
checkpoint. Before rollover, persist a checkpoint with repository, branch, base,
current PR head, scope/boundaries, completed/pending work, changed files,
verification, findings, blockers, Critical Gates, and the next exact action.

If no approved persistent runner/orchestrator is active, do not claim work is
continuing in the background. Use manual rollover fallback only when needed:
write and verify the durable checkpoint, then provide one concise ready-to-copy
handover so the Owner only needs to open a new session and submit it.
