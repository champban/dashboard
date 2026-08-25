# L1B Promotion Artifact Generation

Status: **GENERATION-ONLY / NO PRODUCTION AUTHORITY / DO NOT MERGE**

Decision date: `2026-08-25` (`Asia/Bangkok`)

This temporary packet implements the non-mutating artifact-generation portion of
Owner-approved `Q-L1B-003`. It generates exact provider-compatible review
artifacts from the already reviewed L1A/L1B/Storage source contracts. It does not
connect to Supabase, apply SQL, create a Storage bucket, change migration history,
or activate any client path.

## Exact source boundary

- Repository: `champban/dashboard`
- Exact base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Exact base tree: `c25d9b044e7a46963c3fc5661bd53b08f48d83d6`
- Temporary branch: `ops/l1b-promotion-artifact-generation`
- Future target project reference recorded for the final gate only:
  `qjaywadzvwvcspdsjxth`
- Supabase CLI: pinned `2.111.0`
- Final exact head/tree/run/job/artifact IDs are recorded after creation.

The branch must be exactly one commit from the base and add only:

1. `.github/workflows/l1b-promotion-artifact-generation.yml`
2. `ops/l1b-generate-promotion-artifacts.sh`
3. `docs/L1B_PROMOTION_ARTIFACT_GENERATION.md`

## Generation contract

The workflow uses the pinned CLI command `supabase migration new` to generate two
strictly ordered migration filenames:

1. `l1a_direct_todo`
2. `l1b_planner_parity`

The generated files receive byte-identical copies of:

- `supabase/contracts/l1a_direct_todo.sql`
- `supabase/contracts/l1b_planner_parity.sql`

The private Storage source remains outside `supabase/migrations/` and is copied
byte-identically to:

- `supabase/operations/l1b_private_storage.sql`

The generated review packet also includes:

- `L1B_PROMOTION_ARTIFACT_MANIFEST.json`
- `L1B_APPLY_ORDER.md`

The manifest freezes generated filenames, provider names, source Git blobs,
byte sizes, SHA-256 values, source/base SHAs, target project reference, CLI
version and exact operation order.

## Required order and safety boundary

The intended future sequence is deliberately split:

1. targeted L1A database migration;
2. L1A catalog/RLS/ACL verification;
3. targeted L1B database migration;
4. L1B catalog/RLS/ACL verification;
5. separate private Storage operation;
6. Storage bucket/policy verification.

No cross-operation atomicity is claimed. Each intermediate state must later be
proven safe and fail-closed on a disposable compatible target while the browser
client remains disabled.

Generic `supabase db push` is prohibited because repository timestamps and the
provider-assigned L0b migration ledger differ. Future Production execution must
use the exact targeted artifacts and operation order named in the final Owner
Critical-Gate packet.

## Verification required

Before generated artifacts may become a source-controlled promotion PR:

- exact source-safety job passes;
- normal repository `verify` passes at the exact generator head;
- generation job passes using the pinned CLI;
- generated filenames have valid fourteen-digit timestamps with L1B after L1A;
- all three artifacts compare byte-for-byte with reviewed source contracts;
- manifest JSON validates;
- uploaded artifact is downloaded and independently inspected;
- no credential, connection URI, private data or provider mutation occurs.

The subsequent source-controlled promotion-artifact PR must separately prove
success, injected-failure rollback, rerun fail-closed behavior, safe intermediate
states, exact-head CI, targeted 6D and independent review. Its merge remains
reserved under `Q-L1B-004`; Production apply remains reserved under
`Q-L1B-005`.

## Hard stops

Stop if source/base/branch/file scope drifts, the CLI version differs, generated
migration ordering is invalid, artifact bytes differ from reviewed contracts,
any provider connection or secret appears, or any generated operation would be
executed rather than merely packaged.

Do not merge this temporary generator branch. This packet does not authorize:

- Production migration, SQL/DDL/DML or migration-history write;
- Production Storage bucket/policy creation;
- planner import/re-import or reconciliation;
- client activation or new authority path;
- Auth/RLS/secret/provider configuration changes;
- Drive demotion, cleanup/resource deletion or L1C cutover.
