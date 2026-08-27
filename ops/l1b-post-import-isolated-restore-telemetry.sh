#!/usr/bin/env bash
# Privacy-safe B-2 stage telemetry and frozen runtime verification constants.
L1B_B2_ALLOWED_STAGES=(exact-count postcheck catalog index raw-acl default-acl all-function-acl effective-privilege role-graph aicc-count fk-fingerprint fk-row-validation private-storage)
export EXPECTED_LINE_FINGERPRINT='e0977efa7ccc1f340e753fe470d19da2' EXPECTED_L0B_FINGERPRINT='4c19c28fb80c806e01b5200b1e84edb4' EXPECTED_AICC_FINGERPRINT='4ef839fd8a717501ab3861c1e5aa3a52' EXPECTED_LINE_INDEX_FINGERPRINT='e815ffd95253662ecc53481a825c7232' EXPECTED_L0B_INDEX_FINGERPRINT='4ae6222b2ff6f682c244344cdcbb92ff'
export EXPECTED_AICC_ACL_PARTS='305' EXPECTED_AICC_ACL_FINGERPRINT='e2aeb59ccf1b7cf4fd3d32799d1e91c6' EXPECTED_L0B_ACL_PARTS='115' EXPECTED_L0B_ACL_FINGERPRINT='a7b43c7a3182cc06b53f14f704f901f6' EXPECTED_LINE_ACL_PARTS='77' EXPECTED_LINE_ACL_FINGERPRINT='0b129a7637de9960d951052734eb1731' EXPECTED_POSTGRES_DEFAULT_ACL_PARTS='17' EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT='16bc8ea823eb83d037b1307f647fe1a3'
export EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS='60' EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT='96034c21cbd679dccb46eb2b8b2bf328' EXPECTED_AICC_EFFECTIVE_PARTS='1455' EXPECTED_AICC_EFFECTIVE_FINGERPRINT='19e50eb28495f638d0ffde9b47b11f38' EXPECTED_L0B_EFFECTIVE_PARTS='1917' EXPECTED_L0B_EFFECTIVE_FINGERPRINT='49a6233ebecc46bc50261de316257f5b' EXPECTED_LINE_EFFECTIVE_PARTS='588' EXPECTED_LINE_EFFECTIVE_FINGERPRINT='20ff81c4f39a3f9355b8faa628a60e89'
export EXPECTED_RUNTIME_EFFECTIVE_PARTS='15' EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT='a4c8b4e52e6c0ead388f34e35d5db958' EXPECTED_RUNTIME_ROLE_GRAPH_PARTS='3' EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT='9089adf4b82402903109f41ebc1aa10e' EXPECTED_PUBLIC_APP_FK_PARTS='57' EXPECTED_PUBLIC_APP_FK_FINGERPRINT='08f4cf522b2bc18b50e3edc984946947' EXPECTED_AICC_ROW_COUNT_PARTS='8' EXPECTED_AICC_ROW_COUNT_FINGERPRINT='b6c67dcf199bba386c2d67c5b0d62624'
l1b_b2_stage_allowed(){ local c="${1:-}" s; for s in "${L1B_B2_ALLOWED_STAGES[@]}"; do [[ "$c" == "$s" ]]&&return 0; done; return 1; }
l1b_b2_set_stage(){ local s="${1:-}"; if ! l1b_b2_stage_allowed "$s"; then printf '::error::L1B_B2_STAGE_REJECTED\n' >&2; return 97; fi; export L1B_B2_STAGE="$s"; printf '::notice::L1B_B2_STAGE stage=%s\n' "$s"; }
l1b_b2_safe_parts(){ [[ "${1:-}" =~ ^[0-9]+$ ]]&&printf '%s' "$1"||printf INVALID; }; l1b_b2_safe_digest(){ [[ "${1:-}" =~ ^[0-9a-f]{32}$ ]]&&printf '%s' "$1"||printf INVALID; }
l1b_b2_assert_triplet(){ local stage="${1:-}" scope="${2:-}" ep="${3:-}" ed="${4:-}" file="${5:-}" a ap=MISSING ad=MISSING; l1b_b2_stage_allowed "$stage"||return 97; case "$scope" in AICC|L0B|LINE|RUNTIME|ROLE_GRAPH);; *) return 97;; esac; [[ "$ep" =~ ^[0-9]+$ && "$ed" =~ ^[0-9a-f]{32}$ ]]||return 97; if [[ -f "$file" && ! -L "$file" ]]; then a="$(awk -F '\t' -v scope="$scope" '$1==scope {print $2 "\t" $3}' "$file")"; if [[ "$(grep -c "^${scope}"$'\t' "$file"||true)" == 1 && "$a" == *$'\t'* ]]; then ap="${a%%$'\t'*}"; ad="${a#*$'\t'}"; fi; fi; [[ "$ap" == "$ep" && "$ad" == "$ed" ]]&&return 0; printf '::error::L1B_B2_FINGERPRINT_MISMATCH stage=%s scope=%s expected_parts=%s expected_digest=%s actual_parts=%s actual_digest=%s\n' "$stage" "$scope" "$(l1b_b2_safe_parts "$ep")" "$(l1b_b2_safe_digest "$ed")" "$(l1b_b2_safe_parts "$ap")" "$(l1b_b2_safe_digest "$ad")" >&2; return 1; }
l1b_b2_assert_pair(){ local stage="${1:-}" scope="${2:-}" ep="${3:-}" ed="${4:-}" file="${5:-}" a ap=MISSING ad=MISSING; l1b_b2_stage_allowed "$stage"||return 97; case "$scope" in DEFAULT_ACL|ALL_FUNCTION_ACL|FK);; *) return 97;; esac; [[ "$ep" =~ ^[0-9]+$ && "$ed" =~ ^[0-9a-f]{32}$ ]]||return 97; if [[ -f "$file" && ! -L "$file" ]]; then a="$(head -n 2 "$file"|tail -n 1)"; if [[ "$(wc -l < "$file")" == 1 && "$a" == *$'\t'* ]]; then ap="${a%%$'\t'*}"; ad="${a#*$'\t'}"; fi; fi; [[ "$ap" == "$ep" && "$ad" == "$ed" ]]&&return 0; printf '::error::L1B_B2_FINGERPRINT_MISMATCH stage=%s scope=%s expected_parts=%s expected_digest=%s actual_parts=%s actual_digest=%s\n' "$stage" "$scope" "$(l1b_b2_safe_parts "$ep")" "$(l1b_b2_safe_digest "$ed")" "$(l1b_b2_safe_parts "$ap")" "$(l1b_b2_safe_digest "$ad")" >&2; return 1; }
l1b_b2_assert_zero(){ local stage="${1:-}" scope="${2:-}" file="${3:-}" a=MISSING; l1b_b2_stage_allowed "$stage"||return 97; [[ "$scope" == MTP_PRIVATE_OBJECTS ]]||return 97; [[ -f "$file" && ! -L "$file" ]]&&a="$(head -n 2 "$file"|tail -n 1)"; [[ "$a" == 0 ]]&&return 0; printf '::error::L1B_B2_COUNT_MISMATCH stage=%s scope=%s expected=0 actual=%s\n' "$stage" "$scope" "$(l1b_b2_safe_parts "$a")" >&2; return 1; }
l1b_b2_failure_trap(){ local rc=$?; trap - ERR; local stage="${L1B_B2_STAGE:-pre-stage}"; if [[ "$stage" != pre-stage ]]&&l1b_b2_stage_allowed "$stage"; then printf '::error::L1B_B2_SAFE_FAILURE stage=%s\n' "$stage" >&2; else printf '::error::L1B_B2_SAFE_FAILURE\n' >&2; fi; exit "$rc"; }; trap l1b_b2_failure_trap ERR
if [[ "${1:-}" == --execute && "${BASH_SOURCE[0]}" == "$0" ]]; then
  : "${RUNNER_TEMP:?}"; : "${GITHUB_WORKSPACE:?}"; : "${GITHUB_REPOSITORY:?}"; : "${GH_TOKEN:?}"; : "${BACKUP_PASSPHRASE:?}"
  for n in EXPECTED_REPOSITORY_ID EXPECTED_BACKUP_HEAD_REF EXPECTED_SOURCE_SHA EXPECTED_BACKUP_RUN_ID EXPECTED_ARTIFACT_ID EXPECTED_ARTIFACT_NAME EXPECTED_ARTIFACT_CREATED_AT EXPECTED_ARTIFACT_EXPIRES_AT EXPECTED_ARTIFACT_ZIP_BYTES EXPECTED_ARTIFACT_ZIP_SHA256 EXPECTED_BACKUP_STAMP EXPECTED_ARCHIVE_BYTES; do [[ -n "${!n:-}" ]]||{ echo '::error::Required frozen B-2 artifact pin is absent'; exit 1; }; done
  umask 077
  pass="$RUNNER_TEMP/l1b-b2-passphrase"
  run_meta="$RUNNER_TEMP/l1b-b1-run.json"
  artifact_meta="$RUNNER_TEMP/l1b-b1-artifact.json"
  artifact_zip="$RUNNER_TEMP/l1b-b1-artifact.zip"
  artifact_dir="$RUNNER_TEMP/l1b-b2-artifact"

  ENTRYPOINT_CLEANED=0
  cleanup_entrypoint() {
    local cleanup_rc=0 path
    if [[ "$ENTRYPOINT_CLEANED" == '1' ]]; then return 0; fi
    ENTRYPOINT_CLEANED=1
    unset BACKUP_PASSPHRASE GH_TOKEN
    for path in "$pass" "$run_meta" "$artifact_meta" "$artifact_zip"; do
      case "$path" in
        "$RUNNER_TEMP"/l1b-b2-passphrase|"$RUNNER_TEMP"/l1b-b1-run.json|"$RUNNER_TEMP"/l1b-b1-artifact.json|"$RUNNER_TEMP"/l1b-b1-artifact.zip)
          rm -f -- "$path" >/dev/null 2>&1 || cleanup_rc=1
          [[ ! -e "$path" && ! -L "$path" ]] || cleanup_rc=1
          ;;
        *) cleanup_rc=1 ;;
      esac
    done
    case "$artifact_dir" in
      "$RUNNER_TEMP"/l1b-b2-artifact)
        rm -rf -- "$artifact_dir" >/dev/null 2>&1 || cleanup_rc=1
        [[ ! -e "$artifact_dir" && ! -L "$artifact_dir" ]] || cleanup_rc=1
        ;;
      *) cleanup_rc=1 ;;
    esac
    return "$cleanup_rc"
  }
  cleanup_entrypoint_on_exit() {
    local rc=$?
    trap - EXIT ERR
    if ! cleanup_entrypoint; then
      printf '::error::L1B_B2_ENTRYPOINT_CLEANUP_FAILED
' >&2
      exit 96
    fi
    exit "$rc"
  }
  trap cleanup_entrypoint_on_exit EXIT

  printf '%s' "$BACKUP_PASSPHRASE" > "$pass"
  chmod 600 "$pass"
  unset BACKUP_PASSPHRASE
  gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$EXPECTED_BACKUP_RUN_ID" > "$run_meta"
  python3 - "$run_meta" <<'PY'
import json,os,pathlib,sys
d=json.loads(pathlib.Path(sys.argv[1]).read_text()); e={'id':int(os.environ['EXPECTED_BACKUP_RUN_ID']),'head_branch':os.environ['EXPECTED_BACKUP_HEAD_REF'],'head_sha':os.environ['EXPECTED_SOURCE_SHA'],'conclusion':'success'}
for k,v in e.items():
    if d.get(k)!=v: raise SystemExit(f'B-1 run metadata mismatch: {k}')
if d.get('repository',{}).get('id')!=int(os.environ['EXPECTED_REPOSITORY_ID']): raise SystemExit('B-1 repository identity mismatch')
PY
  gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/$EXPECTED_ARTIFACT_ID" > "$artifact_meta"
  checker="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-check.py"
  python3 "$checker" metadata "$artifact_meta"
  gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/$EXPECTED_ARTIFACT_ID/zip" > "$artifact_zip"
  [[ "$(stat -c '%s' "$artifact_zip")" == "$EXPECTED_ARTIFACT_ZIP_BYTES" ]]
  [[ "$(sha256sum "$artifact_zip"|awk '{print $1}')" == "$EXPECTED_ARTIFACT_ZIP_SHA256" ]]
  python3 "$checker" artifact "$artifact_zip" "$artifact_dir"
  unset GH_TOKEN
  export ARTIFACT_DIR="$artifact_dir" BACKUP_PASSPHRASE_FILE="$pass"
  child_rc=0
  bash "$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore.sh" --run || child_rc=$?
  if [[ "$child_rc" != 0 ]]; then exit "$child_rc"; fi
  trap - EXIT ERR
  if ! cleanup_entrypoint; then
    printf '::error::L1B_B2_ENTRYPOINT_CLEANUP_FAILED
' >&2
    exit 96
  fi
  printf 'L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE
'
  exit 0
fi
if [[ "${1:-}" == --selftest && "${BASH_SOURCE[0]}" == "$0" ]]; then
  [[ "${#L1B_B2_ALLOWED_STAGES[@]}" == 13 ]]
  for s in "${L1B_B2_ALLOWED_STAGES[@]}"; do l1b_b2_stage_allowed "$s"; done
  if l1b_b2_stage_allowed tampered-stage; then exit 1; fi
  t="$(mktemp -d)"; trap 'rm -rf -- "$t"' EXIT
  printf 'AICC\t463\t4ef839fd8a717501ab3861c1e5aa3a52\n' > "$t/a"
  printf '60\t96034c21cbd679dccb46eb2b8b2bf328\n' > "$t/b"
  printf '0\n' > "$t/c"
  l1b_b2_assert_triplet catalog AICC 463 4ef839fd8a717501ab3861c1e5aa3a52 "$t/a"
  l1b_b2_assert_pair all-function-acl ALL_FUNCTION_ACL 60 96034c21cbd679dccb46eb2b8b2bf328 "$t/b"
  l1b_b2_assert_zero private-storage MTP_PRIVATE_OBJECTS "$t/c"
  if l1b_b2_assert_triplet catalog AICC 464 4ef839fd8a717501ab3861c1e5aa3a52 "$t/a" >/dev/null 2>&1; then exit 1; fi
  python3 - "${BASH_SOURCE[0]}" <<'PY'
from pathlib import Path
import sys
payload=Path(sys.argv[1]).read_text(encoding='utf-8')
trap_start=payload.index('l1b_b2_failure_trap(){')
trap_end=payload.index('; trap l1b_b2_failure_trap ERR',trap_start)
failure_trap=payload[trap_start:trap_end]
for forbidden in ('source=%s','line=%s','rc=%s','BASH_SOURCE','BASH_LINENO'):
    if forbidden in failure_trap:
        raise SystemExit(f'failure telemetry leaks non-allowlisted field: {forbidden}')
if "L1B_B2_SAFE_FAILURE stage=%s\\n" not in failure_trap:
    raise SystemExit('allowlisted stage-only failure marker is absent')
if "L1B_B2_SAFE_FAILURE\\n" not in failure_trap:
    raise SystemExit('constant pre-stage failure marker is absent')
execute=payload[payload.index('if [[ "${1:-}" == --execute') : payload.index('if [[ "${1:-}" == --selftest')]
required=(
    'trap cleanup_entrypoint_on_exit EXIT',
    'printf \'%s\' "$BACKUP_PASSPHRASE" > "$pass"',
    '"$RUNNER_TEMP"/l1b-b1-run.json',
    '"$RUNNER_TEMP"/l1b-b1-artifact.json',
    '"$RUNNER_TEMP"/l1b-b1-artifact.zip',
    '"$RUNNER_TEMP"/l1b-b2-artifact',
    'bash "$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore.sh" --run || child_rc=$?',
    'trap - EXIT ERR',
    'if ! cleanup_entrypoint; then',
    'L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE',
)
for token in required:
    if token not in execute:
        raise SystemExit(f'missing entrypoint cleanup/source token: {token}')
if execute.index('trap cleanup_entrypoint_on_exit EXIT') > execute.index('printf \'%s\' "$BACKUP_PASSPHRASE" > "$pass"'):
    raise SystemExit('cleanup trap is installed after passphrase materialization')
if execute.index('if ! cleanup_entrypoint; then') > execute.index('L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE'):
    raise SystemExit('entrypoint completion precedes explicit cleanup')
recovery_marker='L1B fresh post-import B-2 isolated restore:'+' PASS'
if recovery_marker in execute:
    raise SystemExit('entrypoint emits recovery PASS before workflow cleanup verification')
if 'exec bash "$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore.sh"' in execute:
    raise SystemExit('entrypoint exec would bypass its EXIT cleanup')
PY
  echo 'L1B B-2 privacy-safe telemetry selftest: PASS'
  exit 0
fi
