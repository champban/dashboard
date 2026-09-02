#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE="$ROOT_DIR/ops/l1b-post-import-isolated-restore-core.sh"
BASE_ACL_CHECKER="$ROOT_DIR/ops/l1b-post-import-isolated-restore-acl-check.sh"
REVIEW_CHECKER="$ROOT_DIR/ops/l1b-post-import-isolated-restore-review-check.sh"
INJECTOR="$ROOT_DIR/ops/l1b-post-import-isolated-restore-acl-patch.py"
STDIN_PATCHER="$ROOT_DIR/ops/l1b-post-import-isolated-restore-stdin-patch.py"
AICC_CHECKER="$ROOT_DIR/ops/l1b-post-import-isolated-restore-aicc-check.py"
COUNT_CHECKER="$ROOT_DIR/ops/l1b-post-import-isolated-restore-count-check.py"
CHECKER="$ROOT_DIR/ops/l1b-post-import-isolated-restore-check.py"
TELEMETRY="$ROOT_DIR/ops/l1b-post-import-isolated-restore-telemetry.sh"

EXPECTED_CORE_BLOB='cd1b6f33235364b05b94051e9b1264f22437c85a'
EXPECTED_BASE_ACL_CHECKER_BLOB='bf8c60e8c91025a8366edf0c26cf9b4920be8b5b'
EXPECTED_REVIEW_CHECKER_BLOB='cbe4ada3a7e9e9eeb9d93c178297a2a40931b293'
EXPECTED_INJECTOR_BLOB='102165a3f3af1dc8b654bb055775cf3d8f9c448f'
EXPECTED_STDIN_PATCHER_BLOB='838d2d68c9eb608ae56e92883c17cd3058fe0b0a'
EXPECTED_AICC_CHECKER_BLOB='33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2'
EXPECTED_COUNT_CHECKER_BLOB='e4ba0307a3154ab00bff7bbd016bf5f08bb4771c'
EXPECTED_CHECKER_BLOB='ecc8ba98880a234494b210e8f2f5c5c162f4b995'
EXPECTED_TELEMETRY_BLOB='97ef2ac0ccffba5631e032bca94583636ad19e59'

EXPECTED_CORE_STDIN_FIXES='3'
EXPECTED_BASE_ACL_STDIN_FIXES='2'
EXPECTED_REVIEW_STDIN_FIXES='6'
EXPECTED_STDIN_SAFE_CORE_BLOB='2c853a685309f576d88d5ee3e49bc53c1ab2b7df'
EXPECTED_STDIN_SAFE_BASE_ACL_BLOB='6f167bbb443d099618af7207dd5b7ac71e128595'
EXPECTED_STDIN_SAFE_REVIEW_BLOB='276e6063b98d0d50c3d84c89ae74399d53f2fa32'
EXPECTED_REVIEWED_CORE_BLOB='78ed7ba8bb0ebc0673a1c0575728b23131a2c9de'

PATCH_ROOT=''
PATCH_DIR=''
REMOVE_PATCH_ROOT=0

cleanup_wrapper() {
  local rc=$? cleanup_rc=0
  trap - EXIT ERR
  if [[ -n "${RUNNER_TEMP:-}" && "${BACKUP_PASSPHRASE_FILE:-}" == "$RUNNER_TEMP/l1b-b2-passphrase" ]]; then
    rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || cleanup_rc=1
    [[ ! -e "$BACKUP_PASSPHRASE_FILE" && ! -L "$BACKUP_PASSPHRASE_FILE" ]] || cleanup_rc=1
  fi
  if [[ -n "${PATCH_DIR:-}" && -n "${PATCH_ROOT:-}" ]]; then
    case "$PATCH_DIR" in
      "$PATCH_ROOT"/l1b-b2-wrapper.*)
        rm -rf -- "$PATCH_DIR" >/dev/null 2>&1 || cleanup_rc=1
        [[ ! -e "$PATCH_DIR" && ! -L "$PATCH_DIR" ]] || cleanup_rc=1
        ;;
      *) cleanup_rc=1 ;;
    esac
  fi
  if [[ "$REMOVE_PATCH_ROOT" == 1 && -n "${PATCH_ROOT:-}" ]]; then
    case "$PATCH_ROOT" in
      /tmp/*)
        rm -rf -- "$PATCH_ROOT" >/dev/null 2>&1 || cleanup_rc=1
        [[ ! -e "$PATCH_ROOT" && ! -L "$PATCH_ROOT" ]] || cleanup_rc=1
        ;;
      *) cleanup_rc=1 ;;
    esac
  fi
  if [[ "$cleanup_rc" != 0 ]]; then
    printf '::error::L1B_B2_WRAPPER_CLEANUP_FAILED\n' >&2
    exit 96
  fi
  exit "$rc"
}
trap cleanup_wrapper EXIT

for file in "$CORE" "$BASE_ACL_CHECKER" "$REVIEW_CHECKER" "$INJECTOR" "$STDIN_PATCHER" "$AICC_CHECKER" "$COUNT_CHECKER" "$CHECKER" "$TELEMETRY"; do
  [[ -f "$file" && ! -L "$file" ]] || { echo '::error::Pinned B-2 source input is absent or unsafe'; exit 1; }
done

[[ "$(git -C "$ROOT_DIR" hash-object "$CORE")" == "$EXPECTED_CORE_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$BASE_ACL_CHECKER")" == "$EXPECTED_BASE_ACL_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$REVIEW_CHECKER")" == "$EXPECTED_REVIEW_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$INJECTOR")" == "$EXPECTED_INJECTOR_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$STDIN_PATCHER")" == "$EXPECTED_STDIN_PATCHER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$AICC_CHECKER")" == "$EXPECTED_AICC_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$COUNT_CHECKER")" == "$EXPECTED_COUNT_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$CHECKER")" == "$EXPECTED_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$TELEMETRY")" == "$EXPECTED_TELEMETRY_BLOB" ]]
command -v python3 >/dev/null
bash "$TELEMETRY" --selftest >/dev/null

PATCH_ROOT="${RUNNER_TEMP:-}"
if [[ -z "$PATCH_ROOT" ]]; then
  PATCH_ROOT="$(mktemp -d)"
  REMOVE_PATCH_ROOT=1
fi
PATCH_DIR="$(mktemp -d "$PATCH_ROOT/l1b-b2-wrapper.XXXXXX")"
STDIN_SAFE_CORE="$PATCH_DIR/core.sh"
STDIN_SAFE_BASE_ACL="$PATCH_DIR/base.sh"
STDIN_SAFE_REVIEW="$PATCH_DIR/review.sh"
PATCHED_CORE="$PATCH_DIR/final.sh"

core_fix_line="$(python3 "$STDIN_PATCHER" patch "$CORE" "$STDIN_SAFE_CORE" --kind core --expected-fixes "$EXPECTED_CORE_STDIN_FIXES")"
base_fix_line="$(python3 "$STDIN_PATCHER" patch "$BASE_ACL_CHECKER" "$STDIN_SAFE_BASE_ACL" --kind base-acl --expected-fixes "$EXPECTED_BASE_ACL_STDIN_FIXES")"
review_fix_line="$(python3 "$STDIN_PATCHER" patch "$REVIEW_CHECKER" "$STDIN_SAFE_REVIEW" --kind review --expected-fixes "$EXPECTED_REVIEW_STDIN_FIXES")"
CORE_STDIN_FIXES="${core_fix_line#L1B_B2_STDIN_FIXES=}"
BASE_ACL_STDIN_FIXES="${base_fix_line#L1B_B2_STDIN_FIXES=}"
REVIEW_STDIN_FIXES="${review_fix_line#L1B_B2_STDIN_FIXES=}"

python3 "$STDIN_PATCHER" audit "$STDIN_SAFE_CORE"
python3 "$STDIN_PATCHER" audit "$STDIN_SAFE_BASE_ACL"
python3 "$STDIN_PATCHER" audit "$STDIN_SAFE_REVIEW"
bash -n "$STDIN_SAFE_CORE"
bash -n "$STDIN_SAFE_BASE_ACL"
bash -n "$STDIN_SAFE_REVIEW"

STDIN_SAFE_CORE_BLOB="$(git -C "$ROOT_DIR" hash-object "$STDIN_SAFE_CORE")"
STDIN_SAFE_BASE_ACL_BLOB="$(git -C "$ROOT_DIR" hash-object "$STDIN_SAFE_BASE_ACL")"
STDIN_SAFE_REVIEW_BLOB="$(git -C "$ROOT_DIR" hash-object "$STDIN_SAFE_REVIEW")"
[[ "$STDIN_SAFE_CORE_BLOB" == "$EXPECTED_STDIN_SAFE_CORE_BLOB" ]]

python3 "$INJECTOR" "$STDIN_SAFE_CORE" "$PATCHED_CORE"
bash -n "$PATCHED_CORE"
PATCHED_CORE_BLOB="$(git -C "$ROOT_DIR" hash-object "$PATCHED_CORE")"

python3 - "$PATCHED_CORE" "$STDIN_SAFE_BASE_ACL" "$STDIN_SAFE_REVIEW" "$TELEMETRY" "$CHECKER" "$COUNT_CHECKER" <<'PY'
from pathlib import Path
import re,sys
core,base,review,telemetry,checker,count_checker=[Path(x).read_text(encoding='utf-8') for x in sys.argv[1:]]
combined='\n'.join((core,base,review))
telemetry_execute=telemetry[telemetry.index('if [[ "${1:-}" == --execute') : telemetry.index('if [[ "${1:-}" == --selftest')]
stages=('exact-count','postcheck','catalog','index','schema-semantics','raw-acl','default-acl','all-function-acl','effective-privilege','role-graph','aicc-count','auth-fk-fingerprint','fk-fingerprint','fk-row-validation','private-storage')
for stage in stages:
    if combined.count(f"l1b_b2_set_stage '{stage}'") != 1:
        raise SystemExit(f'stage coverage mismatch: {stage}')
if 'information_schema.role_table_grants' in core:
    raise SystemExit('role-dependent catalog grant view remains')
if core.count('l1b_b2_assert_catalog ') != 2 or 'l1b_b2_assert_catalog AICC ' in core:
    raise SystemExit('AICC combined restore digest remains an acceptance gate')
for token in (
    'l1b_b2_assert_triplet catalog AICC_REL "$EXPECTED_AICC_REL_PARTS" "$EXPECTED_AICC_REL_FINGERPRINT"',
    'l1b_b2_assert_triplet catalog AICC_COL "$EXPECTED_AICC_COL_PARTS" "$EXPECTED_AICC_COL_FINGERPRINT"',
    'l1b_b2_assert_triplet catalog AICC_POL "$EXPECTED_AICC_POL_PARTS" "$EXPECTED_AICC_POL_FINGERPRINT"',
    'l1b_b2_assert_triplet catalog AICC_FUN "$EXPECTED_AICC_FUN_PARTS" "$EXPECTED_AICC_FUN_FINGERPRINT"',
):
    if token not in core:
        raise SystemExit(f'missing frozen Production AICC category assertion: {token}')
if "scope||'_'||split_part(part,'|',1)" not in core:
    raise SystemExit('privacy-safe catalog category aggregation is absent')
catalog_search_path='set search_path to pg_catalog, public, extensions;'
catalog_anchor=core.index('# Deterministic catalog fingerprints')
catalog_query=core.index('with parts as (',catalog_anchor)
if core.count(catalog_search_path)<2 or not catalog_anchor < core.index(catalog_search_path) < catalog_query:
    raise SystemExit('catalog query does not pin the reviewed deterministic search_path')
catalog_shape_tokens=(
    "expected_scopes(scope) as (values ('AICC'),('L0B'),('LINE'))",
    "expected_kinds(kind) as (values ('REL'),('COL'),('POL'),('FUN'),('GRANT'))",
    'left join diagnostic_parts on diagnostic_parts.key=expected_keys.key',
    'L1B_B2_CATALOG_QUERY_FAILED stage=catalog',
)
for token in catalog_shape_tokens:
    if token not in core:
        raise SystemExit(f'missing deterministic catalog shape/query-failure token: {token}')
catalog_diagnostic_tokens=(
    'l1b_b2_validate_triplet_file(){',
    'l1b_b2_emit_catalog_diagnostics(){',
    'local -a kinds=(REL COL POL FUN GRANT)',
    'L1B_B2_CATALOG_DIAGNOSTIC scope=%s kind=%s parts=%s digest=%s',
    'L1B_B2_FINGERPRINT_FILE_INVALID stage=%s',
    'l1b_b2_assert_catalog(){',
)
for token in catalog_diagnostic_tokens:
    if token not in telemetry:
        raise SystemExit(f'missing privacy-safe catalog diagnostic token: {token}')
raw_acl_search_path='set search_path to pg_catalog, public, extensions;'
raw_acl_query=base.index('with target_tables as (')
if base.count(raw_acl_search_path)!=1 or base.index(raw_acl_search_path) > raw_acl_query:
    raise SystemExit('raw ACL query does not pin the reviewed deterministic search_path')
raw_acl_shape_tokens=(
    "expected_scopes(scope) as (",
    "values ('AICC'),('L0B'),('LINE')",
    "values ('RELMETA'),('RELACL'),('COLACL'),('FUNMETA'),('FUNACL')",
    "select scope||'_'||kind from expected_scopes cross join expected_kinds",
    "left join diagnostic_parts on diagnostic_parts.key=expected_keys.key",
)
for token in raw_acl_shape_tokens:
    if token not in base:
        raise SystemExit(f'missing deterministic raw ACL shape token: {token}')
raw_acl_diagnostic_tokens=(
    'l1b_b2_emit_raw_acl_diagnostics(){',
    'local -a kinds=(RELMETA RELACL COLACL FUNMETA FUNACL)',
    'L1B_B2_RAW_ACL_DIAGNOSTIC scope=%s kind=%s parts=%s digest=%s',
    'l1b_b2_emit_catalog_grant_diagnostic(){',
    'L1B_B2_CATALOG_GRANT_DIAGNOSTIC scope=%s kind=GRANT parts=%s digest=%s',
    'l1b_b2_assert_raw_acl(){',
)
for token in raw_acl_diagnostic_tokens:
    if token not in telemetry:
        raise SystemExit(f'missing privacy-safe raw ACL diagnostic token: {token}')
if base.count('l1b_b2_assert_raw_acl ') != 3:
    raise SystemExit('raw ACL assertions do not use the diagnostic fail-closed boundary')
auth_expected=(
    'auth.users',
    'auth.identities',
    'auth.sessions',
    'auth.refresh_tokens',
    'auth.mfa_factors',
    'auth.mfa_challenges',
    'auth.mfa_amr_claims',
    'auth.one_time_tokens',
    'auth.webauthn_credentials',
    'auth.webauthn_challenges',
)
import ast
def literal_tuple(source,name):
    tree=ast.parse(source)
    for node in tree.body:
        if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id==name for target in node.targets):
            return tuple(ast.literal_eval(node.value))
    raise SystemExit(f'missing frozen tuple: {name}')
if literal_tuple(checker,'AUTH_RECOVERY_RELATIONS') != auth_expected:
    raise SystemExit('dump extractor Auth recovery inventory differs from the frozen contract')
if literal_tuple(count_checker,'AUTH_RECOVERY_RELATIONS') != auth_expected:
    raise SystemExit('SQL count checker Auth recovery inventory differs from the frozen contract')
if literal_tuple(checker,'PUBLIC_RECOVERY_RELATIONS') != literal_tuple(count_checker,'PUBLIC_RECOVERY_RELATIONS'):
    raise SystemExit('dump extractor and SQL count checker public inventories differ')
auth_fingerprint_marker="where con.contype='f' and ns.nspname='auth' and child.relname in ("
if review.count(auth_fingerprint_marker)!=1:
    raise SystemExit('review checker frozen Auth FK fingerprint filter is absent or ambiguous')
auth_fingerprint_start=review.index(auth_fingerprint_marker)+len(auth_fingerprint_marker)
auth_fingerprint_end=review.index('\n  )',auth_fingerprint_start)
auth_fingerprint_tables=tuple(re.findall(r"'([a-z_]+)'",review[auth_fingerprint_start:auth_fingerprint_end]))
if tuple(f'auth.{table}' for table in auth_fingerprint_tables) != auth_expected:
    raise SystemExit('frozen Auth FK fingerprint inventory differs from the recovery contract')
auth_fk_marker="or (child_ns.nspname='auth' and child.relname in ("
if review.count(auth_fk_marker)!=1:
    raise SystemExit('review checker Auth FK child filter is absent or ambiguous')
auth_fk_start=review.index(auth_fk_marker)+len(auth_fk_marker)
auth_fk_end=review.index('\n      ))',auth_fk_start)
auth_fk_tables=tuple(re.findall(r"'([a-z_]+)'",review[auth_fk_start:auth_fk_end]))
if tuple(f'auth.{table}' for table in auth_fk_tables) != auth_expected:
    raise SystemExit('review checker Auth FK child inventory differs from the frozen recovery contract')
core_count_lines=[line for line in core.splitlines() if 'python3 "$CHECKER" extract' in line]
if len(core_count_lines)!=1 or '>"$CORE_COUNT_CHECK_LOG" 2>&1' not in core_count_lines[0]:
    raise SystemExit('core COPY parser diagnostics are not fully redirected to the runner-private log')
core_tokens=(
    'cleanup_resources()',
    'cleanup_on_exit()',
    'if ! docker info',
    'mapfile -t bootstrap_volume_names',
    'docker volume rm "$name"',
    'if ! cleanup_resources; then',
    'L1B_B2_DISPOSABLE_CLEANUP_FAILED',
    'CORE_COUNT_CHECK_LOG="$WORK_DIR/core-count-check.log"',
    'L1B_B2_CORE_COUNT_CHECK_FAILED stage=exact-count',
    'Disposable containers, inherited database volume and plaintext work directory removed: **VERIFIED**',
    "trap - EXIT\nprintf 'L1B_B2_CHILD_RESTORE_COMPLETE\\n'",
)
for token in core_tokens:
    if token not in core:
        raise SystemExit(f'missing fail-closed cleanup token: {token}')
if core.index('if ! cleanup_resources; then', core.index('# Deterministic catalog fingerprints')) > core.index("printf 'L1B_B2_CHILD_RESTORE_COMPLETE\\n'"):
    raise SystemExit('child completion precedes verified core cleanup')

schema_semantics_tokens=('SCHEMA_SEMANTICS_FINGERPRINTS="$WORK_DIR/schema-semantics-fingerprints.tsv"',"l1b_b2_set_stage 'schema-semantics'",'pg_catalog.pg_get_functiondef(p.oid)','pg_catalog.pg_get_function_result(p.oid)','pg_catalog.pg_get_indexdef(i.oid)','pg_catalog.pg_get_triggerdef(g.oid,true)','pg_catalog.pg_get_constraintdef(c.oid,true)',"where c.contype<>'f'",'L1B_B2_SCHEMA_SEMANTICS_QUERY_FAILED stage=schema-semantics','l1b_b2_assert_triplet schema-semantics AICC_FUNCDEF','l1b_b2_assert_triplet schema-semantics AICC_INDEX','l1b_b2_assert_triplet schema-semantics L0B_TRIGGER','l1b_b2_assert_triplet schema-semantics LINE_CONSTRAINT')
for token in schema_semantics_tokens:
    if token not in core: raise SystemExit(f'missing complete schema-semantics recovery token: {token}')
semantic_anchor=core.index("l1b_b2_set_stage 'schema-semantics'")
semantic_query=core.index('with target_relations as (',semantic_anchor)
semantic_search_path=core.index(catalog_search_path,semantic_anchor)
if not semantic_anchor < semantic_search_path < semantic_query: raise SystemExit('schema-semantics query does not pin the reviewed deterministic search_path')
if 'schema-semantics' not in telemetry: raise SystemExit('telemetry does not validate the schema-semantics fingerprint file')

recovery_marker='L1B fresh post-import B-2 isolated restore:'+' PASS'
if recovery_marker in combined:
    raise SystemExit('child or intermediate checker emits final recovery PASS')
private_tokens=(
    (core, '>"$CORE_COUNT_CHECK_LOG" 2>&1'),
    (core, '>"$ACTUAL_COUNTS" 2>&1'),
    (core, '>"$POSTCHECK_LOG" 2>&1'),
    (core, '>"$FINGERPRINTS" 2>&1'),
    (core, '>"$INDEX_FINGERPRINTS" 2>&1'),
    (core, '>"$SCHEMA_SEMANTICS_FINGERPRINTS" 2>&1'),
    (base, '>"$ACL_FINGERPRINTS" 2>&1'),
    (base, '>"$DEFAULT_ACL_FINGERPRINT" 2>&1'),
    (review, '>"$FUNCTION_FINGERPRINT" 2>&1'),
    (review, '>"$EFFECTIVE_FINGERPRINTS" 2>&1'),
    (review, '>"$ROLE_GRAPH_FINGERPRINT" 2>&1'),
    (review, '>"$AICC_ACTUAL_COUNTS" 2>&1'),
    (review, '>"$AUTH_FK_FINGERPRINT" 2>&1'),
    (review, '>"$FK_FINGERPRINT" 2>&1'),
    (review, '>"$FK_ROW_VALIDATION_LOG" 2>&1'),
    (review, '>"$PRIVATE_OBJECT_COUNT" 2>&1'),
)
for source,token in private_tokens:
    if token not in source:
        raise SystemExit(f'missing private stdout/stderr token: {token}')
if 'L1B_B2_BASE_ACL_VERIFICATION_COMPLETE' not in base:
    raise SystemExit('base ACL checker still emits an early PASS or lacks completion marker')
if 'L1B_B2_REVIEW_VERIFICATION_COMPLETE' not in review:
    raise SystemExit('review checker still emits an early PASS or lacks completion marker')
review_tokens=(
    'AUTH_FK_FINGERPRINT="$WORK_DIR/auth-fk-fingerprint.tsv"',
    'l1b_b2_assert_pair auth-fk-fingerprint AUTH_FK "$EXPECTED_AUTH_FK_PARTS" "$EXPECTED_AUTH_FK_FINGERPRINT" "$AUTH_FK_FINGERPRINT"',
    'FK_ROW_VALIDATION_LOG="$WORK_DIR/fk-row-validation.log"',
    ">\"$FK_ROW_VALIDATION_LOG\" 2>&1 <<'SQL'",
    'L1B_B2_FK_ROW_VALIDATION_FAILED stage=fk-row-validation',
    'AICC_CHECK_LOG="$WORK_DIR/aicc-count-check.log"',
    'L1B_B2_AICC_COUNT_CHECK_FAILED stage=aicc-count',
)
for token in review_tokens:
    if token not in review:
        raise SystemExit(f'missing private review diagnostic token: {token}')
aicc_lines=[line for line in review.splitlines() if 'python3 "$AICC_CHECKER"' in line]
if len(aicc_lines) != 4 or any('$AICC_CHECK_LOG" 2>&1' not in line for line in aicc_lines):
    raise SystemExit('AICC checker diagnostics are not fully redirected to the runner-private log')
pass_write = '''printf '%s' "$BACKUP_PASSPHRASE" > "$pass"'''
if telemetry_execute.index('trap cleanup_entrypoint_on_exit EXIT') > telemetry_execute.index(pass_write):
    raise SystemExit('entrypoint cleanup trap is installed too late')
if telemetry_execute.index('if ! cleanup_entrypoint; then') > telemetry_execute.index('L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE'):
    raise SystemExit('entrypoint completion precedes explicit artifact cleanup')
if recovery_marker in telemetry_execute:
    raise SystemExit('telemetry emits final recovery PASS before workflow cleanup')
PY

printf '%s\n'   "L1B_B2_CORE_STDIN_FIXES=$CORE_STDIN_FIXES"   "L1B_B2_BASE_ACL_STDIN_FIXES=$BASE_ACL_STDIN_FIXES"   "L1B_B2_REVIEW_STDIN_FIXES=$REVIEW_STDIN_FIXES"   "L1B_B2_STDIN_SAFE_CORE_BLOB=$STDIN_SAFE_CORE_BLOB"   "L1B_B2_STDIN_SAFE_BASE_ACL_BLOB=$STDIN_SAFE_BASE_ACL_BLOB"   "L1B_B2_STDIN_SAFE_REVIEW_BLOB=$STDIN_SAFE_REVIEW_BLOB"   "L1B_B2_REVIEWED_CORE_BLOB=$PATCHED_CORE_BLOB" >&2

[[ "$STDIN_SAFE_BASE_ACL_BLOB" == "$EXPECTED_STDIN_SAFE_BASE_ACL_BLOB" ]]
[[ "$STDIN_SAFE_REVIEW_BLOB" == "$EXPECTED_STDIN_SAFE_REVIEW_BLOB" ]]
[[ "$PATCHED_CORE_BLOB" == "$EXPECTED_REVIEWED_CORE_BLOB" ]]

: <<'L1B_B2_STATIC_CONTRACT'
--network none
--single-transaction
sha256sum -c SHA256SUMS.txt
EXPECTED_LINE_FINGERPRINT
EXPECTED_L0B_FINGERPRINT
EXPECTED_AICC_PRODUCTION_FINGERPRINT
EXPECTED_AICC_REL_FINGERPRINT
EXPECTED_AICC_COL_FINGERPRINT
EXPECTED_AICC_POL_FINGERPRINT
EXPECTED_AICC_FUN_FINGERPRINT
EXPECTED_AUTH_FK_FINGERPRINT
EXPECTED_AICC_FUNCDEF_FINGERPRINT
EXPECTED_AICC_INDEX_FINGERPRINT
EXPECTED_AICC_TRIGGER_FINGERPRINT
EXPECTED_AICC_CONSTRAINT_FINGERPRINT
EXPECTED_L0B_FUNCDEF_FINGERPRINT
EXPECTED_L0B_SEMANTIC_INDEX_FINGERPRINT
EXPECTED_L0B_TRIGGER_FINGERPRINT
EXPECTED_L0B_CONSTRAINT_FINGERPRINT
EXPECTED_LINE_FUNCDEF_FINGERPRINT
EXPECTED_LINE_SEMANTIC_INDEX_FINGERPRINT
EXPECTED_LINE_TRIGGER_FINGERPRINT
EXPECTED_LINE_CONSTRAINT_FINGERPRINT
L1B_B2_CHILD_RESTORE_COMPLETE
L1B_B2_STATIC_CONTRACT

if [[ "${1:-}" == --selftest ]]; then
  echo 'L1B B-2 role-independent staged cleanup-hardened source verification: PASS'
  exit 0
fi

L1B_B2_PATCHED_REVIEW_CHECKER="$STDIN_SAFE_REVIEW" L1B_B2_PATCHED_REVIEW_CHECKER_BLOB="$STDIN_SAFE_REVIEW_BLOB" L1B_B2_PATCHED_BASE_ACL_CHECKER="$STDIN_SAFE_BASE_ACL" L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB="$STDIN_SAFE_BASE_ACL_BLOB" bash "$PATCHED_CORE" "$@"
