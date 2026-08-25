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

EXPECTED_CORE_BLOB='90757c51f83e10545df8159b0bd3757c223144da'
EXPECTED_BASE_ACL_CHECKER_BLOB='457d4ffa2543557e2c2e9488a0518a1f1881ea48'
EXPECTED_REVIEW_CHECKER_BLOB='bf00f2503db6561359f19dfbaf1d39b5f9bcb7b1'
EXPECTED_INJECTOR_BLOB='3a0bb3c49428b61ce6536c92f21f8a67ac633c34'
EXPECTED_STDIN_PATCHER_BLOB='00bfe97899918ff8af5357c5dc2483819394dbd7'
EXPECTED_AICC_CHECKER_BLOB='33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2'
EXPECTED_COUNT_CHECKER_BLOB='39acfa0b950c5ec9365f46623d416d4cbc882e52'

EXPECTED_CORE_STDIN_FIXES='3'
EXPECTED_BASE_ACL_STDIN_FIXES='2'
EXPECTED_REVIEW_STDIN_FIXES='5'
EXPECTED_STDIN_SAFE_CORE_BLOB='fcd181886d4733ca4376faca75dfc2725ddcd065'
EXPECTED_STDIN_SAFE_BASE_ACL_BLOB='44456c741980bfa1752d23abeb3590417de18e15'
EXPECTED_STDIN_SAFE_REVIEW_BLOB='9639cc7c08cc3d7447b775dab5e634973b52cdca'
EXPECTED_REVIEWED_CORE_BLOB='e830585d50ad0f795fe72a8fba9300416bac58ac'

PATCH_ROOT=''
PATCH_DIR=''
REMOVE_PATCH_ROOT=0

cleanup_wrapper() {
  if [[ -n "${RUNNER_TEMP:-}" \
     && "${BACKUP_PASSPHRASE_FILE:-}" == "$RUNNER_TEMP/l1b-b2-passphrase" ]]; then
    rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PATCH_DIR:-}" && -n "${PATCH_ROOT:-}" ]]; then
    case "$PATCH_DIR" in
      "$PATCH_ROOT"/l1b-b2-wrapper.*) rm -rf -- "$PATCH_DIR" ;;
      *) ;;
    esac
  fi
  if [[ "$REMOVE_PATCH_ROOT" == '1' && -n "${PATCH_ROOT:-}" ]]; then
    case "$PATCH_ROOT" in
      /tmp/*) rm -rf -- "$PATCH_ROOT" ;;
      *) ;;
    esac
  fi
}
trap cleanup_wrapper EXIT

for file in "$CORE" "$BASE_ACL_CHECKER" "$REVIEW_CHECKER" "$INJECTOR" "$STDIN_PATCHER" "$AICC_CHECKER" "$COUNT_CHECKER"; do
  if [[ ! -f "$file" || -L "$file" ]]; then
    echo "::error::Pinned B-2 source input is absent or unsafe"
    exit 1
  fi
done
[[ "$(git -C "$ROOT_DIR" hash-object "$CORE")" == "$EXPECTED_CORE_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$BASE_ACL_CHECKER")" == "$EXPECTED_BASE_ACL_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$REVIEW_CHECKER")" == "$EXPECTED_REVIEW_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$INJECTOR")" == "$EXPECTED_INJECTOR_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$STDIN_PATCHER")" == "$EXPECTED_STDIN_PATCHER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$AICC_CHECKER")" == "$EXPECTED_AICC_CHECKER_BLOB" ]]
[[ "$(git -C "$ROOT_DIR" hash-object "$COUNT_CHECKER")" == "$EXPECTED_COUNT_CHECKER_BLOB" ]]
command -v python3 >/dev/null

PATCH_ROOT="${RUNNER_TEMP:-}"
if [[ -z "$PATCH_ROOT" ]]; then
  PATCH_ROOT="$(mktemp -d)"
  REMOVE_PATCH_ROOT=1
fi
PATCH_DIR="$(mktemp -d "$PATCH_ROOT/l1b-b2-wrapper.XXXXXX")"
STDIN_SAFE_CORE="$PATCH_DIR/l1b-post-import-isolated-restore-core.stdin-safe.sh"
STDIN_SAFE_BASE_ACL="$PATCH_DIR/l1b-post-import-isolated-restore-acl-check.stdin-safe.sh"
STDIN_SAFE_REVIEW="$PATCH_DIR/l1b-post-import-isolated-restore-review-check.stdin-safe.sh"
PATCHED_CORE="$PATCH_DIR/l1b-post-import-isolated-restore-core.final.sh"

core_fix_line="$(python3 "$STDIN_PATCHER" patch "$CORE" "$STDIN_SAFE_CORE" --kind core --expected-fixes "$EXPECTED_CORE_STDIN_FIXES")"
base_fix_line="$(python3 "$STDIN_PATCHER" patch "$BASE_ACL_CHECKER" "$STDIN_SAFE_BASE_ACL" --kind base-acl --expected-fixes "$EXPECTED_BASE_ACL_STDIN_FIXES")"
review_fix_line="$(python3 "$STDIN_PATCHER" patch "$REVIEW_CHECKER" "$STDIN_SAFE_REVIEW" --kind review --expected-fixes "$EXPECTED_REVIEW_STDIN_FIXES")"
CORE_STDIN_FIXES="${core_fix_line#L1B_B2_STDIN_FIXES=}"
BASE_ACL_STDIN_FIXES="${base_fix_line#L1B_B2_STDIN_FIXES=}"
REVIEW_STDIN_FIXES="${review_fix_line#L1B_B2_STDIN_FIXES=}"
[[ "$CORE_STDIN_FIXES" == "$EXPECTED_CORE_STDIN_FIXES" ]]
[[ "$BASE_ACL_STDIN_FIXES" == "$EXPECTED_BASE_ACL_STDIN_FIXES" ]]
[[ "$REVIEW_STDIN_FIXES" == "$EXPECTED_REVIEW_STDIN_FIXES" ]]
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
[[ "$STDIN_SAFE_BASE_ACL_BLOB" == "$EXPECTED_STDIN_SAFE_BASE_ACL_BLOB" ]]
[[ "$STDIN_SAFE_REVIEW_BLOB" == "$EXPECTED_STDIN_SAFE_REVIEW_BLOB" ]]

python3 "$INJECTOR" "$STDIN_SAFE_CORE" "$PATCHED_CORE"
bash -n "$PATCHED_CORE"
PATCHED_CORE_BLOB="$(git -C "$ROOT_DIR" hash-object "$PATCHED_CORE")"
[[ "$PATCHED_CORE_BLOB" == "$EXPECTED_REVIEWED_CORE_BLOB" ]]

printf '%s\n' \
  "L1B_B2_CORE_STDIN_FIXES=$CORE_STDIN_FIXES" \
  "L1B_B2_BASE_ACL_STDIN_FIXES=$BASE_ACL_STDIN_FIXES" \
  "L1B_B2_REVIEW_STDIN_FIXES=$REVIEW_STDIN_FIXES" \
  "L1B_B2_STDIN_SAFE_CORE_BLOB=$STDIN_SAFE_CORE_BLOB" \
  "L1B_B2_STDIN_SAFE_BASE_ACL_BLOB=$STDIN_SAFE_BASE_ACL_BLOB" \
  "L1B_B2_STDIN_SAFE_REVIEW_BLOB=$STDIN_SAFE_REVIEW_BLOB" \
  "L1B_B2_REVIEWED_CORE_BLOB=$PATCHED_CORE_BLOB"

: <<'L1B_B2_STATIC_CONTRACT'
--network none
--single-transaction
sha256sum -c SHA256SUMS.txt
EXPECTED_LINE_FINGERPRINT
EXPECTED_L0B_FINGERPRINT
EXPECTED_AICC_FINGERPRINT
L1B fresh post-import B-2 isolated restore: PASS
L1B_B2_STATIC_CONTRACT

if [[ "${1:-}" == '--selftest' ]]; then
  echo 'L1B B-2 stdin-safe final derived-core verification: PASS'
  exit 0
fi

L1B_B2_PATCHED_REVIEW_CHECKER="$STDIN_SAFE_REVIEW" \
L1B_B2_PATCHED_REVIEW_CHECKER_BLOB="$STDIN_SAFE_REVIEW_BLOB" \
L1B_B2_PATCHED_BASE_ACL_CHECKER="$STDIN_SAFE_BASE_ACL" \
L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB="$STDIN_SAFE_BASE_ACL_BLOB" \
  bash "$PATCHED_CORE" "$@"
