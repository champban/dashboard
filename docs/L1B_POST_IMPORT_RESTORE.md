# L1B fresh post-import B-2 isolated restore

## Status

This document defines the **Draft-only, non-Production** recovery proof for the
fresh post-import B-1 backup. It does not authorize merge, Production migration,
Storage creation, import, client activation, reconciliation, Drive demotion,
cleanup, or L1C cutover.

The source branch must remain exactly one commit from
`main@297854c09205097a6a58cbce4c64961c802cd7a3` and contain only the twelve
files listed below. A synchronize event may run source checks only. The restore
job can run only from one fresh `owner-approved-b2-restore` label event, run
attempt 1, and the protected `production-backup` Environment.

## Fresh replacement B-1 recovery anchor

- Backup workflow run: `33409097769`
- Backup source branch: `ops/l1b-post-import-backup-refresh`
- Backup source SHA: `25508b077a7ee81c1b6b6f42da2dbd704a7f247f`
- Source-safety job: `99543906638` — **PASS**
- Owner-gated backup job: `99543950108` — **PASS**
- Artifact ID: `9805484584`
- Artifact name: `dashboard-l1b-post-import-backup-20260901T143601Z`
- Created: `2026-09-01T14:37:11Z`
- Expires: `2026-09-02T14:37:10Z`
- ZIP: `56347` bytes; SHA-256
  `57a64b3e0276b7f5d431b2374576a3c64f8137b012499d6a280c936d27bbdb60`
- Encrypted archive: `54950` bytes; SHA-256
  `1d563664b953938480691a49e30a3c4da286b0b38cf48666774e2c37676d93fa`
- Roles/schema/data SHA-256:
  `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd`,
  `645e07100834b1e50da3baeeddd9a9a56c59474620a0ec1864d94bfe5ae7a46e`,
  `d4a11ed056b9572900bf9076d1cbba816356ec02f158a9ab8f7de96aa41a1eda`
- Manifest SHA-256:
  `0f2cda1e7463a78c86d452285671f977d33fcfdfb1561b1662b538462d9cb066`
- GitHub artifact availability: **available and unexpired at packet creation**
- Owner custody of a separately downloaded encrypted copy: **CONFIRMED** via
  the connected GitHub artifact download into the Owner's ChatGPT conversation
  on `2026-09-01`; the passphrase was not copied into chat or the artifact.

No replacement artifact or unpinned metadata is accepted. Prior artifacts
`9726016367`, `9709317492` and `9550594832` are superseded and are not valid
substitutes.

## Exact twelve-file boundary

1. `.github/workflows/l1b-post-import-isolated-restore.yml`
2. `docs/L1B_POST_IMPORT_RESTORE.md`
3. `ops/l1b-post-import-isolated-restore-acl-check.sh`
4. `ops/l1b-post-import-isolated-restore-acl-patch.py`
5. `ops/l1b-post-import-isolated-restore-aicc-check.py`
6. `ops/l1b-post-import-isolated-restore-check.py`
7. `ops/l1b-post-import-isolated-restore-core.sh`
8. `ops/l1b-post-import-isolated-restore-count-check.py`
9. `ops/l1b-post-import-isolated-restore-review-check.sh`
10. `ops/l1b-post-import-isolated-restore-stdin-patch.py`
11. `ops/l1b-post-import-isolated-restore-telemetry.sh`
12. `ops/l1b-post-import-isolated-restore.sh`

## Frozen source and derived pins

This packet requalifies the AICC catalog representation, freezes the complete
Auth FK inventory before post-load orphan validation, and fingerprints complete
function definitions, all application index definitions, non-internal triggers,
and every non-FK constraint before B-2 can report PASS. The source and every
derived executable remain content-addressed and fail closed on pin drift.

- Workflow blob: `2fbe48b20d93ec7cebd843343c866953de5183d5`
- Wrapper blob: `35f1d24a57885e4836f41e778eb8c9e62e81711b`
- Telemetry blob: `97ef2ac0ccffba5631e032bca94583636ad19e59`
- Catalog/stage/cleanup injector blob: `102165a3f3af1dc8b654bb055775cf3d8f9c448f`
- Stdin/review patcher blob: `838d2d68c9eb608ae56e92883c17cd3058fe0b0a`
- Raw core blob: `cd1b6f33235364b05b94051e9b1264f22437c85a`
- Raw ACL checker blob: `bf8c60e8c91025a8366edf0c26cf9b4920be8b5b`
- AICC checker blob: `33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2`
- Contract/dump checker blob: `ecc8ba98880a234494b210e8f2f5c5c162f4b995`
- SQL-side count checker blob: `e4ba0307a3154ab00bff7bbd016bf5f08bb4771c`
- Raw review checker blob: `cbe4ada3a7e9e9eeb9d93c178297a2a40931b293`
- Stdin-safe core / ACL / review:
  `2c853a685309f576d88d5ee3e49bc53c1ab2b7df` /
  `6f167bbb443d099618af7207dd5b7ac71e128595` /
  `276e6063b98d0d50c3d84c89ae74399d53f2fa32`
- Final derived restore core:
  `78ed7ba8bb0ebc0673a1c0575728b23131a2c9de`

### Complete executable and schema-semantics Production pins

A bounded read-only Production query freezes complete function definitions, all application indexes, non-internal triggers and every non-FK constraint. AICC pins: `24/2532413a689e46fc350d77137984bbc7`, `6/a0d2dde4e49c7c15bb2b04c7b2a2ba56`, `22/6ac0cbd6f5b79519165e2a8a453f176f`, `9/e6d867e6658d53c68a542ab6f22b920a`. L0b pins: `77/694de6dfa636f3dc11931b016e83d77f`, `31/5c554bfe5a9a27a7f3549c2e88d630dc`, `26/587e7bf78ebb0993165f5b0db3814182`, `5/6e059025771f56da66f5303b050a770d`. LINE pins: `22/15d1af279461fc0cda1799bb3be5cadc`, `0/d41d8cd98f00b204e9800998ecf8427e`, `11/0ecfcc5ee8b470ec5c47b1172c1bd1ec`, `0/d41d8cd98f00b204e9800998ecf8427e`.

Every GitHub Action reference is a 40-hex immutable commit SHA. The disposable
database image remains:

`supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f`

## Previous fail-closed attempts

### AICC default-function-ACL ordering — run `33630389296`

The exact recovery source restored the encrypted B-1 into the network-disabled
PostgreSQL 17 target and passed exact-count, post-import, catalog, index and
complete schema-semantics checks. It then stopped fail closed at raw ACL
reconciliation: AICC expected `305/e2aeb59ccf1b7cf4fd3d32799d1e91c6`
but restored `299/8036afaa87de193d3ce344886499efb6`; the isolated
work directory, containers, inherited volume, artifact files and passphrase
were removed, and the sole recovery PASS marker was not emitted.

A bounded read-only Production comparison proved the delta exactly. The six
existing zero-argument AICC functions each have `PUBLIC EXECUTE` in Production,
while the restored target lacked precisely those six ACL entries. The restored
AICC function-ACL lane was `24/2f54344395605a43a14b2975d36bc8d6`; adding
only those verified grants produces the exact Production lane
`30/253113c16f13c2be2022b8db3453997b` and the already frozen complete
AICC raw-ACL fingerprint. This is a deterministic logical-dump/default-ACL
ordering effect: pg_dump omits privileges equal to the source creation defaults,
while the disposable target intentionally revokes the postgres default function
ACL before replaying schema DDL.

The corrected recovery source therefore performs one narrowly bounded
normalization inside the existing roles/schema/data transaction, after schema
creation and before data loading. It first requires the exact 24-part restored
fingerprint, grants `PUBLIC EXECUTE` to exactly
`aicc_add_owner_membership()`, `aicc_audit_agent_status()`,
`aicc_audit_message_insert()`, `aicc_audit_task_status()`,
`aicc_set_updated_at()` and `aicc_task_timestamps()`, then requires the exact
30-part Production fingerprint. Any missing, extra or changed ACL entry stops
the restore before reconciliation PASS. No Production connection or write is
introduced.

### Artifact-repin source qualification — run `33527286507`

The exact one-commit/twelve-file boundary passed, but source-safety job
`99921254971` failed before any restore execution because the contract checker
still required the superseded B-1 source SHA `f620c679...`. Restore job
`99921316085` was skipped. No Environment entry, passphrase materialization,
artifact download, disposable database or Production connection occurred.

The bounded correction updates only the checker token to the current B-1 source
SHA `25508b077...`, the wrapper's content-addressed checker pin, and the matching
workflow/document pins. Restore logic, catalog fingerprints, ACL/RLS checks,
artifact hashes, database image and cleanup semantics remain unchanged. The
failed synchronize event is not rerun; a new exact-head synchronize event must
qualify the corrected one-commit source.

### Attempt 1 — run `32841653681`

The restore stopped because heredoc-backed `docker exec` calls did not keep
stdin open. No Production connection or write occurred. The deterministic stdin
patcher now audits and repairs every heredoc-backed Docker execution.

### Attempt 2 — run `32850877666`

Source safety passed, but the restore stopped before a recovery PASS could be
established. Private diagnostics were deliberately withheld. The final source
adds fixed, privacy-safe stage telemetry and does not represent Attempt 2 as
successful.

### Consumed B-2 attempt — run `33235213186`

Source safety completed successfully, but restore job `99054917221` stopped
fail-closed at the AICC catalog gate. The expected fingerprint was
`463/4ef839fd8a717501ab3861c1e5aa3a52`; the restored fingerprint was
`463/5c4bfc371fe4e62e62c03c119d87b21e`. No B-2 PASS was emitted and no
Production connection or mutation occurred. Cleanup removed the runner-private
catalog parts, so the surviving evidence proves a digest-only mismatch but does
not prove which catalog category changed. No recovery PASS was emitted.

The remediation keeps the read-only Production baseline frozen at
`463/4ef839fd8a717501ab3861c1e5aa3a52` but does **not** accept the unexplained
isolated-restore digest `463/5c4bfc371fe4e62e62c03c119d87b21e` as a gate.
Instead, the restored AICC catalog must match the independently captured
Production category pins exactly: `REL 32/77920aa928188c3c5ad5cd6663299fe9`,
`COL 166/7bfa00c87f46152bc58b797f344d1e37`,
`POL 14/29ba83e72a1444f0f340b644658bf59b`, and
`FUN 6/4a448ec93b102ce47d18818599707916`. The role-sensitive `GRANT`
representation is not used to waive structural drift; grant semantics remain
fail-closed behind the independent raw/default/function ACL,
effective-privilege and runtime role-graph gates. Public telemetry may emit
only category, part count and MD5 digest. Object names, SQL, rows and the
private catalog-parts file remain withheld and cleanup-bound. Before accepting
any triplet or emitting category diagnostics, the telemetry helper requires
the complete stage-specific TSV row set, exactly three fields per row, one copy
of every allowlisted key, numeric counts and 32-lowercase-hex digests; stray,
missing, duplicate, extra-field, malformed and symlink inputs all fail closed.

### Catalog-shape remediation attempt — run `33296674194`

Source safety passed, but restore job `99217447574` stopped fail-closed at
`stage=catalog` before any normal fingerprint-mismatch marker was emitted.
Cleanup verification passed and no B-2 output artifact or recovery PASS was
created. The surviving public evidence therefore narrows the failure to either
the catalog query or the strict triplet-file shape check; it does not establish
an accepted digest.

This revision keeps every frozen acceptance triplet unchanged. It makes the
catalog query produce the complete deterministic set of 18 allowlisted keys,
including a `0/md5('')` triplet for an empty category, so zero-part categories
cannot disappear before validation. Query failure and invalid TSV shape now
emit distinct stage-only markers; private SQL, object names and rows remain
withheld and cleanup-bound. Required AICC REL/COL/POL/FUN, combined L0B/LINE,
ACL, privilege, role-graph, Auth FK and row-level FK gates remain fail closed.

### Consumed column-metadata attempt — run `33307402227`

Source safety passed, but restore job `99246280297` stopped fail-closed at
`stage=catalog`. The deterministic 18-key query and strict TSV validation
completed, isolating the mismatch to `AICC_COL`: expected
`166/7bfa00c87f46152bc58b797f344d1e37`, restored
`166/62727372346bb869d88a52b18a15d35d`. Equal counts prove that no column was
added or removed, but the surviving digest-only evidence does not identify an
individual object or field. No recovery PASS or output artifact was produced.

The column serialization includes `format_type(...)` and decompiled default
expressions from `pg_get_expr(...)`, while the failed source left the catalog
session `search_path` implicit. PostgreSQL documents that type/function names
use the schema search path and that symbolic object names may be rendered with
or without schema qualification according to visibility:

- <https://www.postgresql.org/docs/17/ddl-schemas.html#DDL-SCHEMAS-PATH>
- <https://www.postgresql.org/docs/17/datatype-oid.html>

That is a source-confirmed nondeterminism in the fingerprint mechanism and a
working explanation for a same-count column digest delta across roles or
environments; it is not represented as the uniquely proven runtime cause. This
revision pins only the ephemeral catalog-query session to
`pg_catalog, public, extensions` before calculating the unchanged 18-key
fingerprints. The frozen Production acceptance value remains exactly
`AICC_COL 166/7bfa00c87f46152bc58b797f344d1e37`; the failed
`62727372346bb869d88a52b18a15d35d` value is not accepted. If the next separately
authorized isolated run does not reproduce the frozen value under the pinned
path, it must fail closed and the root cause remains open.

### Consumed raw-ACL attempt — run `33312054640`

Source-safety job `99258773589` passed, but owner-gated restore job
`99258793995` stopped fail-closed at `stage=raw-acl`. The frozen AICC
acceptance triplet remains `305/e2aeb59ccf1b7cf4fd3d32799d1e91c6`; the
disposable restore produced `299/8036afaa87de193d3ce344886499efb6`.
No recovery PASS or output artifact was produced. The six-part reduction proves
an ACL-row cardinality delta, but the retained aggregate did not identify
whether the missing rows belonged to relation, column or function ACLs.

This source-only remediation does not accept the failed triplet and does not
authorize another restore. The raw-ACL query now pins exactly one
`search_path` to `pg_catalog, public, extensions` and always produces the
complete fixed 18-key result: three scope aggregates plus
`RELMETA/RELACL/COLACL/FUNMETA/FUNACL` category triplets for AICC, L0B and
LINE. Before any diagnostic is emitted, telemetry validates the full key set,
three fields per row, one row per key, numeric counts, lowercase 32-hex digests,
and a regular non-symlink file. On aggregate mismatch it emits only fixed
scope/category/count/digest diagnostics and the already validated catalog
`GRANT` triplet; object names, SQL, rows and private files remain withheld.
Negative selftests cover six-part relation, column and function ACL deltas.

Workflow cleanup verification now emits
`L1B_B2_UNCONDITIONAL_CLEANUP_COMPLETE` immediately after every runner cleanup
assertion passes, before checking the restore outcome. The sole final recovery
PASS remains after the successful-restore guard, so a fail-closed restore may
prove cleanup without being misrepresented as B-2 PASS.

## Recovery and security controls

The final source enforces:

- exact repository, base, branch, one-commit history and twelve-file manifest;
- exact encrypted artifact metadata, expiry, sizes and hashes;
- only the `BACKUP_PASSPHRASE` Environment secret;
- no Production database URL or provider write credential;
- PostgreSQL 17 target with `--network none` and no published port before
  decryption;
- transactional roles → schema → replica-mode data restore;
- exact B-1 COPY-count reconciliation for the frozen recovery-critical Auth
  inventory (`auth.users`, `auth.identities`, `auth.sessions`,
  `auth.refresh_tokens`, MFA factor/challenge/AMR state, one-time tokens and
  WebAuthn credentials/challenges), plus LINE and L0b relations;
- accepted planner aggregate `105/17/6/15/0`, LINE `1/5/1/17/1`, and eight
  zero-row AICC tables;
- RLS, policies, catalog/index fingerprints, raw/default/function ACLs,
  effective privileges, complete runtime role graph, owner integrity, all `57`
  public application foreign keys, and the frozen `10`-part durable Auth
  foreign-key inventory with digest `fb000e29b0a4c3aacd97a6e3a8f96766`,
  before validating every corresponding foreign-key row relationship;
- absence of L1A/L1B tables, the `private` schema, `mtp-private` bucket/policies,
  and `storage.objects` rows for that bucket;
- fixed-stage and fixed-category catalog diagnostics that publish only
  allowlisted scope/category/count/digest fields and never publish SQL,
  credentials, object names, row content, source paths, line numbers, return
  codes or private helper logs;
- the pre-restore core COPY parser writes complete stdout/stderr only to a
  mode-`0600` runner-private log and exposes a fixed failure marker;
- cleanup trap installed before passphrase materialization;
- unconditional deletion and verification of passphrase, metadata, artifact ZIP,
  extracted encrypted files, plaintext work directory, disposable containers and
  inherited database volume;
- no PASS marker until disposable cleanup has been verified.

## Attempt gate

Before creating the fresh label event:

1. exact-head normal CI must pass;
2. B-2 source-safety must pass and synchronize restore must be skipped;
3. independent exact-head review must report zero unresolved
   Critical/High/Medium findings;
4. all review threads must be resolved;
5. read-only Production baseline must remain unchanged;
6. artifact `9805484584` must remain exact, available and unexpired;
7. Owner custody of the conversation-held encrypted copy of artifact
   `9805484584` is **confirmed**.

A label event is consumed once. GitHub reruns are blocked by
`github.run_attempt == 1`. The Environment reviewer must approve only the exact
new run.

## Hard stop

**DO NOT MERGE OR APPLY.** This packet does not authorize Production SQL,
migration-history writes, Storage creation, Auth/RLS/provider changes, import,
backfill, reconciliation, client activation, Drive demotion, resource deletion,
cleanup of Production assets, or L1C cutover. Q-L1B-004 and Q-L1B-005 remain a
separate exact Owner Critical Gate.

## Exact final PASS and diagnostic boundary

- Every database fingerprint/query command writes stdout and stderr only to a
  mode-`0600` runner-private file.
- Public failure output is limited to fixed allowlisted stage markers and
  validated count/digest fields.
- Core, ACL and independent-review helpers emit completion markers only; they do
  not emit the recovery PASS marker.
- The telemetry entrypoint removes and verifies absence of passphrase, run
  metadata, artifact metadata, downloaded ZIP and extracted encrypted artifact
  before returning success.
- The workflow emits the sole exact
  `L1B fresh post-import B-2 isolated restore: PASS` marker only after the
  restore succeeds and the unconditional cleanup gate verifies zero residual
  artifact paths, containers, inherited volumes and plaintext work directories.

## Consolidated P2 remediation and requalification note

This packet retains the two earlier review remediations and closes the current
Auth-relationship finding in the same exact twelve-file recovery boundary:

1. the fixed COPY/restored-count contract now covers durable user-facing Auth
   state beyond `auth.users`, including OAuth identities, sessions, refresh
   tokens, MFA state, one-time tokens and WebAuthn state;
2. the pre-restore core COPY parser sends all diagnostics to a runner-private
   log and publishes only `L1B_B2_CORE_COUNT_CHECK_FAILED stage=exact-count`;
3. after replica-mode restore, an independent canonical query must first match
   the frozen Auth FK count/digest `10/fb000e29b0a4c3aacd97a6e3a8f96766`;
4. only then does the dynamic orphan validator check every foreign key whose
   child is one of the ten frozen durable Auth relations, plus the existing
   public `mtp_*`/`aicc_*` relationships. Source-safety fails closed if that
   Auth child inventory diverges from the shared dump/restored-count contract.

The generic extractor and SQL-side count checker inventories are statically
compared in source-safety and by the wrapper selftest. Their helper selftests,
Python compilation, Bash syntax, telemetry selftest, derived-core pin checks and
contract check pass locally. `npm test`, `npm run verify` and
`npm run scan-secrets` also pass locally; the GitHub exact-head runner remains
the authoritative terminal qualification evidence.

A synchronize event may qualify source and normal CI, but cannot execute the
restore because no approval label is present. The restore remains blocked until
exact-head CI, source-safety and independent review are green with zero unresolved
Critical/High/Medium findings and the exact artifact remains unexpired.
