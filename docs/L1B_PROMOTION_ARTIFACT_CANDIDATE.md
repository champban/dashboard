# L1B Promotion Artifact Candidate

Status: **DRAFT / NO-GO FOR PRODUCTION APPLY**

Evidence date: `2026-08-29` (`Asia/Bangkok`)

This PR materializes the exact L1A/L1B database migration files and the separate
private Storage operation generated under Owner-approved `Q-L1B-003`. It is an
evidence and review package only. `Q-L1B-004` and `Q-L1B-005` deliberately reserve
merge and Production apply for one later exact Critical-Gate decision.

## Exact boundary

- Repository: `champban/dashboard`
- Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Target Supabase project for future final gate: `qjaywadzvwvcspdsjxth`
- Current client state: already published disabled; no activation is authorized.
- Browser + Google Drive remain authoritative.
- Generic `supabase db push` remains prohibited for this project.

## Generated artifact evidence

Current source provenance commit: `37772e2f0117e79726ab72bb09569d29cc45944c`
(parent `6c80f180557538d23c699d02cc9bc23282090e3b`, generated
`2026-08-29T19:10:26Z`). The commit freezes the byte-identical L1A/L1B contracts
and migrations after the transaction-scoped dependency-lock remediation. Exact-head CI and the
dedicated PostgreSQL 17 proof are required for the final evidence commit.
The dedicated workflow path filter inventories every migration, contract, SQL
test, operation and script consumed by that proof.
Pinned Supabase CLI: `2.111.0`.

Historical GitHub artifact (superseded by current source remediation):

- ID: `9545153367`
- name: `l1b-promotion-artifacts-4a4b159d0009ca88105d5dd12818781d09e190de`
- ZIP SHA-256: `1117444d1804b508d3269a4b25674fcfcb9071835e820b8a1688048a1c8f7624`

Frozen operations:

1. `supabase/migrations/20260825011714_l1a_direct_todo.sql`
   - SHA-256: `6e2df4dba24376a34acab308f20022bab9fb011efc12a7c0efb6568d618931a7`
   - Git blob: `49f2a9554be55cfb32eb972f890526b9ce59e32f`
   - size: `36483` bytes
   - byte-identical to `supabase/contracts/l1a_direct_todo.sql`
   - supersedes the historical artifact ZIP for the changed L1A bytes
2. `supabase/migrations/20260825011716_l1b_planner_parity.sql`
   - SHA-256: `264ea46b0706071bd30db5063453b5d41735d4cf71e9bfb84859d1e438c8e778`
   - Git blob: `1a36536058b84b1ef4a11d5125ea9cde11c09b4e`
   - size: `49087` bytes
   - byte-identical to `supabase/contracts/l1b_planner_parity.sql`
   - supersedes the historical artifact ZIP for the changed L1B bytes
3. `supabase/operations/l1b_private_storage.sql`
   - SHA-256: `9b80f536de31f79d1138b16b40dfd5794f09ad03883efd365738475259e8a93e`
   - Git blob: `cc650ee24acdf68981964c909f1041f2603fcb4b`
   - byte-identical to `supabase/contracts/l1b_private_storage.sql`

The current manifest pins each operation to its reviewed source blob and hash.
The old ZIP remains historical evidence only and is not claimed to contain the
current L1A/L1B bytes. Exact-head CI must recompute current file hashes and
contract/migration byte identity.

## Read-only Production preflight

Project health: **ACTIVE_HEALTHY**, PostgreSQL `17.6.1.147`.
Migration ledger tail remains `20260823055451_l0b_data_foundation`.
No L1A/L1B migration is recorded.

Bounded planner aggregates, with no raw planner content read:

- active tasks `105`; tombstoned `0`
- active subtasks `17`; tombstoned `0`
- active events `6`; tombstoned `0`
- active event windows `15`; tombstoned `0`
- active task attachments `0`; tombstoned `0`
- import staging `0`; rejects `0`
- succeeded batches `1`; running `0`; other terminal `0`

LINE aggregate canary remains accounts/events/link-codes/mutations/snapshots =
`1/5/1/17/1`.

Catalog checks:

- L0b RLS-enabled tables: `9`
- L0b policies: `9`
- L0b importer RPCs: `6`
- L1A tables (`mtp_task_dependencies`, `mtp_task_external_refs`,
  `mtp_mutation_receipts`): absent
- L1B tables (`mtp_notes`, `mtp_note_assets`, `mtp_planner_settings`): absent
- private L1 schema: absent
- `mtp-private` Storage bucket: absent
- `mtp_private_owner_%` Storage policies: absent

Frozen catalog fingerprints using a deterministic metadata-only recipe:

- LINE: `127` parts / MD5 `e0977efa7ccc1f340e753fe470d19da2`
- L0b: `234` parts / MD5 `4c19c28fb80c806e01b5200b1e84edb4`
- unrelated AICC: `463` parts / MD5 `4ef839fd8a717501ab3861c1e5aa3a52`

Security Advisor remains at the accepted pre-L1 disposition: one INFO for
`mtp_line_events` RLS-without-policy, six WARN findings for intentional signed-in
`SECURITY DEFINER` importer RPCs, and one Auth leaked-password-protection WARN.
No L1 object exists in Production at this checkpoint.

## Failure-safety proof

`ops/l1b-promotion-artifact-proof.sh` and its PR-only PostgreSQL 17 workflow prove
against the exact source-controlled artifacts that:

1. file hashes and bytes match the reviewed contracts;
2. L1A is one explicit database transaction in the disposable proof; controlled
   failure rolls the whole unit back;
3. after successful L1A, a failed transactional rerun changes no catalog state;
4. L1B is tested the same way while preserving the committed L1A intermediate state;
5. the Storage operation is a separate transaction/gate; failure leaves no
   `mtp-private` bucket/policies;
6. a repeated Storage operation fails closed without catalog drift;
7. a deterministic PostgreSQL 17 trigger-guard proof shows same-owner direct
   mutations wait, refresh their READ COMMITTED snapshot, reject the completing
   cycle with `L1D01 dependency_cycle`, and leave an acyclic graph;
8. a second deterministic RPC proof shows the waiting same-owner
   `task.children.replace` call holds no task row lock before acquiring the
   owner advisory lock, then rejects the completing cycle with `L1D01`;
9. a mixed direct reactivation-versus-RPC proof holds an inactive dependency
   tuple first, proves the RPC owns the advisory lock while waiting to replace
   the tombstone, then requires direct inactive-to-active UPDATE to fail
   immediately with `L1D02 dependency_lock_required`, no `40P01`, and a
   successful serialized RPC reactivation;
10. a granted shared owner advisory lock cannot authorize direct reactivation;
    every graph-topology-changing UPDATE fails closed before lock acquisition;
11. a forged caller-writable GUC plus a session-scoped exclusive advisory lock
    is also rejected. The public L1B entry point deletes the inactive tombstone
    only after acquiring the owner transaction lock, then uses the serialized
    INSERT trigger path while preserving `created_at` and incrementing the
    prior dependency `version`;
12. distinct owners derive different advisory keys and complete independently
   through both the direct trigger and public RPC paths under a 500 ms lock timeout;
13. existing L1A/L1B RLS/conflict/storage contract tests pass on the completed
   disposable state.

This proves the SQL units can be executed safely as explicit transactions on
PostgreSQL 17. It does **not** claim cross-operation atomicity and does not yet
authorize or claim Production/provider execution. The final gate must bind the
exact Production apply mechanism to equivalent transactional semantics and stop
if that cannot be demonstrated.

## Fresh recovery gate status

Fresh B-1 run `33233676310` succeeded at PR #100 head
`f620c67909a7cbfd88acabe88ba75c404f44efe9`; encrypted artifact `9709317492`
is unexpired through `2026-08-30T04:28:13Z` and Owner custody is confirmed.
PR #97 source-only requalification at `35aeb51125d84363780819aa561135698475f38c`
passed normal CI and the B-2 source/secret-safety job, but its exact restore job
was `skipped` and is not recovery PASS. The latest actual execution remains run
`33235213186`, which failed closed on an AICC catalog-digest mismatch. No
Production write or promotion authority was added.

Until an exact Owner-approved B-2 restore job completes successfully against a
still-valid qualifying B-1, the final Production gate remains blocked.

## Hard stops

This candidate does not authorize:

- merge of this artifact PR;
- Production L1A/L1B migration apply or migration-history write;
- Production Storage bucket/policy creation;
- planner import/re-import or reconciliation;
- client activation or Supabase authority;
- Auth/RLS/secret/provider changes outside the exact future apply artifacts;
- Drive demotion, cleanup/resource deletion, or L1C cutover.
