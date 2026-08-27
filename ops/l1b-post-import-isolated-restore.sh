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

EXPECTED_CORE_BLOB='081095bb462429900f119fba1615842e3b4690db'
EXPECTED_BASE_ACL_CHECKER_BLOB='24d275b120cda5508b38e7825643c3740af63221'
EXPECTED_REVIEW_CHECKER_BLOB='eadcafd96d440e9467671a4de457843ba8b98505'
EXPECTED_INJECTOR_BLOB='ae3970904f1044b27ed756350d61323cbce05bed'
EXPECTED_STDIN_PATCHER_BLOB='8fca84c90bfd972c034997ba575484b285dda89b'
EXPECTED_AICC_CHECKER_BLOB='33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2'
EXPECTED_COUNT_CHECKER_BLOB='39acfa0b950c5ec9365f46623d416d4cbc882e52'
EXPECTED_CHECKER_BLOB='a30e5ba299a8c81c49c36376baae25aef06f9116'
EXPECTED_TELEMETRY_BLOB='7dfdd97243f24342b1464ba8cac24dc9c5625721'

EXPECTED_CORE_STDIN_FIXES='3'
EXPECTED_BASE_ACL_STDIN_FIXES='2'
EXPECTED_REVIEW_STDIN_FIXES='5'
EXPECTED_STDIN_SAFE_CORE_BLOB='3257712533abcf7eb1cde350a63b4fa882e137db'
EXPECTED_STDIN_SAFE_BASE_ACL_BLOB='87158a8c3da4807672c7ba463c644b57c9dd39a0'
EXPECTED_STDIN_SAFE_REVIEW_BLOB='c3ac18d0c68485beb841dc96ef0df11db33b6b01'
EXPECTED_REVIEWED_CORE_BLOB='793485061488079cbdf69e341c3c52ee4a0bfa49'

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

python3 - "$PATCHED_CORE" "$STDIN_SAFE_BASE_ACL" "$STDIN_SAFE_REVIEW" "$TELEMETRY" <<'PY'
from pathlib import Path
import sys
core,base,review,telemetry=[Path(x).read_text(encoding='utf-8') for x in sys.argv[1:]]
combined='\n'.join((core,base,review))
telemetry_execute=telemetry[telemetry.index('if [[ "${1:-}" == --execute') : telemetry.index('if [[ "${1:-}" == --selftest')]
stages=('exact-count','postcheck','catalog','index','raw-acl','default-acl','all-function-acl','effective-privilege','role-graph','aicc-count','fk-fingerprint','fk-row-validation','private-storage')
for stage in stages:
    if combined.count(f"l1b_b2_set_stage '{stage}'") != 1:
        raise SystemExit(f'stage coverage mismatch: {stage}')
if 'information_schema.role_table_grants' in core:
    raise SystemExit('role-dependent catalog grant view remains')
core_tokens=(
    'cleanup_resources()',
    'cleanup_on_exit()',
    'if ! docker info',
    'mapfile -t bootstrap_volume_names',
    'docker volume rm "$name"',
    'if ! cleanup_resources; then',
    'L1B_B2_DISPOSABLE_CLEANUP_FAILED',
    'Disposable containers, inherited database volume and plaintext work directory removed: **VERIFIED**',
    "trap - EXIT\nprintf 'L1B_B2_CHILD_RESTORE_COMPLETE\\n'",
)
for token in core_tokens:
    if token not in core:
        raise SystemExit(f'missing fail-closed cleanup token: {token}')
if core.index('if ! cleanup_resources; then', core.index('# Deterministic catalog fingerprints')) > core.index("printf 'L1B_B2_CHILD_RESTORE_COMPLETE\\n'"):
    raise SystemExit('child completion precedes verified core cleanup')
recovery_marker='L1B fresh post-import B-2 isolated restore:'+' PASS'
if recovery_marker in combined:
    raise SystemExit('child or intermediate checker emits final recovery PASS')
private_tokens=(
    (core, '>"$ACTUAL_COUNTS" 2>&1'),
    (core, '>"$POSTCHECK_LOG" 2>&1'),
    (core, '>"$FINGERPRINTS" 2>&1'),
    (core, '>"$INDEX_FINGERPRINTS" 2>&1'),
    (base, '>"$ACL_FINGERPRINTS" 2>&1'),
    (base, '>"$DEFAULT_ACL_FINGERPRINT" 2>&1'),
    (review, '>"$FUNCTION_FINGERPRINT" 2>&1'),
    (review, '>"$EFFECTIVE_FINGERPRINTS" 2>&1'),
    (review, '>"$ROLE_GRAPH_FINGERPRINT" 2>&1'),
    (review, '>"$AICC_ACTUAL_COUNTS" 2>&1'),
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
EXPECTED_AICC_FINGERPRINT
L1B_B2_CHILD_RESTORE_COMPLETE
L1B_B2_STATIC_CONTRACT

if [[ "${1:-}" == --selftest ]]; then
  echo 'L1B B-2 role-independent staged cleanup-hardened source verification: PASS'
  exit 0
fi

L1B_B2_PATCHED_REVIEW_CHECKER="$STDIN_SAFE_REVIEW" L1B_B2_PATCHED_REVIEW_CHECKER_BLOB="$STDIN_SAFE_REVIEW_BLOB" L1B_B2_PATCHED_BASE_ACL_CHECKER="$STDIN_SAFE_BASE_ACL" L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB="$STDIN_SAFE_BASE_ACL_BLOB" bash "$PATCHED_CORE" "$@"
