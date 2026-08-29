# L1B Promotion Artifact — Targeted Security 6D Review

Audit timestamp: `2026-08-30T01:06:16+07:00` (`Asia/Bangkok`)

Auditor: ChatGPT/Codex using GitHub and Supabase read-only evidence. This is a
targeted security review by the implementing agent; it is **not** an independent
second-reviewer attestation.

Decision: **CONDITIONAL PASS FOR DRAFT ARTIFACT/TEST PREPARATION; BLOCKED FOR
PRODUCTION PROMOTION.**

The previously reported dependency-cycle findings are remediated in the candidate
bytes by acquiring the owner-scoped transaction advisory lock at the
`task.children.replace` RPC entry before any per-task row lock. Direct INSERT keeps
the same trigger guard; direct active-edge UPDATE must already hold the exclusive lock before
the statement or the trigger fails immediately with `L1D02`, so it never waits on
the advisory lock after taking a tuple lock. Deterministic PostgreSQL 17 evidence is
required at the exact remote head. No other new Critical, High, or Medium security
finding was identified by the implementing review. Production promotion remains blocked by the
fresh B-1/B-2 recovery gate, final exact-head CI/failure-safety evidence,
independent review, and the separately reserved Owner Critical Gate.

## Scope

- Repository: `champban/dashboard`
- Branch: `ops/l1b-promotion-artifact-candidate`
- Audited source head: `75095e7fcee434c7efb80e11f6021d67e4048147`
- Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Environment: Draft PR / disposable PostgreSQL 17 only
- Future Production project: `qjaywadzvwvcspdsjxth`
- Production effect of this review: **NONE**

Frozen operation blobs reviewed:

- L1A migration blob `4cc4821bc023801ea3501400340c7ff57a28f71a`,
  SHA-256 `b0cc480974995d15e667b14176e0ff70b77e34f977d83c732e1439a1a32b98fe`
- L1B migration blob `f763e5ff25da166e35d569c76c35022884c956cd`,
  SHA-256 `9980557bd01830a36da3da35a7de6f3e418a4b0fb82db1431e6d736f74ee88d4`
- private Storage operation blob `cc650ee24acdf68981964c909f1041f2603fcb4b`,
  SHA-256 `9b80f536de31f79d1138b16b40dfd5794f09ad03883efd365738475259e8a93e`

All three operation files are byte-identical to their current source contracts.
The source provenance commit is
`31446f105d8753dfa7d8e1548955963daa85428b` (parent
`c2918ecdacba35ab5b4d77a74944a2e1a4df6635`, generated
`2026-08-29T18:19:34Z`). Historical artifact ZIP digest
`1117444d1804b508d3269a4b25674fcfcb9071835e820b8a1688048a1c8f7624`
is superseded for the changed L1A and L1B bytes and is not current evidence.

## Six-dimension findings

| Dimension | Result | Evidence / residual gate |
|---|---|---|
| 1. Identity and access | PASS FOR CANDIDATE BYTES | L1A/L1B preserve the reviewed `auth.uid()` owner model, authenticated wrapper boundary, private `SECURITY DEFINER` core, explicit RLS and negative cross-owner/direct-write tests. Privileged direct dependency UPDATE now requires a caller-held owner transaction lock and fails closed otherwise. Production L1 objects are currently absent. No Auth/provider change is included. |
| 2. Secrets and data | PASS FOR ARTIFACT BYTES | No secret value, service-role key, credential or Production data is added to this PR. Normal CI secret scan is required on the final head. Read-only preflight used aggregate/catalog evidence only; raw planner content was not read. Fresh encrypted B-1/B-2 remains mandatory before Production promotion. |
| 3. Input and content safety | PASS FOR ARTIFACT BYTES / ACTIVATION STILL GATED | Reviewed payload allowlists, bounds, UUID ownership paths, active-content rejection, settings denylist, attachment MIME/size/path metadata and conflict semantics are unchanged. The private bucket remains absent and upload/client activation is not authorized. |
| 4. Browser and network controls | PASS FOR THIS DRAFT SCOPE | No browser/runtime/CSP/network-origin/client-enable byte is changed. The already-published L1B bridge remains disabled (`enabled=false`, mode `off`). No new automatic enqueue/send path is introduced. |
| 5. Supply chain and deployment | CONDITIONAL PASS | The current SQL/Storage bytes match reviewed Git blobs and add no dependency. The historical generated ZIP is explicitly superseded for changed L1A/L1B bytes. Normal PR `verify` and the dedicated PostgreSQL 17 transactional/fail-closed proof must pass at the final exact head. Generic `supabase db push` remains prohibited. |
| 6. Operations and recovery | BLOCKED FOR PRODUCTION | Read-only Production preflight is healthy and L1 objects/`mtp-private` are absent. Fresh B-1 is valid and Owner custody is confirmed, but the latest actual B-2 execution failed closed; the newer source-only run skipped its restore job and is not PASS. No cross-operation atomicity is claimed. Final merge/apply remains reserved for one exact Owner Critical Gate. |

## Read-only Production evidence

Project `qjaywadzvwvcspdsjxth` is `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.147`.
Migration history still ends at `20260823055451_l0b_data_foundation`.

Bounded planner aggregates remain:

- tasks `105`, subtasks `17`, events `6`, event windows `15`, attachments `0`;
- tombstones, rejects, staging and running batches `0`;
- succeeded import batches `1`.

LINE aggregate counts remain `1/5/1/17/1`. L1A/L1B objects, private L1 schema,
`mtp-private` bucket and `mtp_private_owner_%` policies are absent.

Frozen metadata fingerprints for final drift comparison:

- LINE: `127` parts / `e0977efa7ccc1f340e753fe470d19da2`
- L0b: `234` parts / `4c19c28fb80c806e01b5200b1e84edb4`
- AICC: `463` parts / `4ef839fd8a717501ab3861c1e5aa3a52`

Current Supabase Security Advisor residuals are unchanged from the accepted
pre-L1 baseline: one `mtp_line_events` RLS-without-policy INFO, six intentional
signed-in importer `SECURITY DEFINER` WARN findings, and Auth leaked-password
protection WARN. No L1 object exists in Production at this checkpoint.

## Tests and checks performed / required

Historical evidence retained for context:

- generation-head normal `verify` run `32796926470`: PASS;
- artifact-generation run `32796926635`: PASS;
- independent recomputation of the superseded artifact ZIP/file SHA-256 and Git blob hashes;
- bounded read-only Production migration/catalog/aggregate/advisor preflight;
- initial PR #96 normal SQL/security jobs passed while the main verify job was
  still running at the audit checkpoint.

Current remediation evidence adds an RPC-entry lock before any task-row lock,
retains the INSERT trigger guard, and requires direct active-edge UPDATE callers
to hold the same exclusive owner transaction lock before taking a dependency tuple. The
dedicated proof checks same-owner RPC ordering with a `NOWAIT` probe, then creates
the formerly-deadlocking mixed UPDATE-versus-RPC order and requires immediate
`L1D02 dependency_lock_required`, no `40P01`, and a successful RPC. A separate
negative probe holds only the shared advisory lock and must still fail `L1D02`.
The dedicated workflow path filter includes the Storage source contract read by
the proof. Exact-head CI
and proof must pass after this source remediation.

## Residual risks and gates

- Fresh post-import B-1 is valid only through `2026-08-30T04:28:13Z`; exact B-2
  restore PASS is still missing.
- A true independent second review of the final exact artifact head is still
  required before the final Production gate; this report is not that review.
- The exact Production apply mechanism has not been executed or authorized.
  The final gate must bind each database migration to explicit transactional
  semantics and keep the Storage operation separate; stop if equivalent
  fail-closed behavior cannot be guaranteed.
- No cleanup/destructive rollback is authorized. Recovery remains forward-fix
  plus the qualifying fresh encrypted backup/restore anchor.

## Backup and rollback readiness

Fresh B-1 run `33233676310` produced encrypted artifact `9709317492`; Owner
custody is confirmed and the artifact expires at `2026-08-30T04:28:13Z`.
PR #97 source-only requalification passed, but its Owner-gated restore job was
`skipped`. The latest actual B-2 execution, run `33235213186`, failed closed on
the bounded AICC catalog digest check. A new exact B-2 execution requires its
own Owner approval and must restore the still-valid exact B-1 in an isolated
disposable environment.

## Deployment decision

**BLOCKED FOR PRODUCTION PROMOTION.**

The artifact bytes themselves have no new Critical/High/Medium finding and are
suitable to remain in a Draft review/evidence PR. Do not merge PR #96 and do not
apply L1A/L1B/Storage to Production until fresh B-1/B-2, final exact-head CI and
failure-safety proof, independent review, drift recheck, and the separately
reserved exact Owner Critical Gate are all complete.
