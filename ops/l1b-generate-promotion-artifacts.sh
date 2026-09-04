#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"
: "${EXPECTED_BASE_SHA:?EXPECTED_BASE_SHA is required}"
: "${EXPECTED_PROJECT_REF:?EXPECTED_PROJECT_REF is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SHORT_SHA="${SOURCE_SHA:0:12}"
WORK_DIR="$(mktemp -d "$RUNNER_TEMP/l1b-artifact-generation.XXXXXX")"
GEN_PROJECT="$WORK_DIR/generator"
OUTPUT_DIR="$RUNNER_TEMP/l1b-promotion-artifacts-$SHORT_SHA"
MANIFEST_PATH="$OUTPUT_DIR/L1B_PROMOTION_ARTIFACT_MANIFEST.json"
ORDER_PATH="$OUTPUT_DIR/L1B_APPLY_ORDER.md"

cleanup() {
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT

rm -rf -- "$OUTPUT_DIR"
mkdir -p "$GEN_PROJECT" "$OUTPUT_DIR/supabase/migrations" "$OUTPUT_DIR/supabase/operations"

(
  cd "$GEN_PROJECT"
  supabase init >/dev/null
  supabase migration new l1a_direct_todo >/dev/null
  sleep 1
  supabase migration new l1b_planner_parity >/dev/null
)

mapfile -t L1A_GENERATED < <(find "$GEN_PROJECT/supabase/migrations" -maxdepth 1 -type f -name '*_l1a_direct_todo.sql' -printf '%f\n' | LC_ALL=C sort)
mapfile -t L1B_GENERATED < <(find "$GEN_PROJECT/supabase/migrations" -maxdepth 1 -type f -name '*_l1b_planner_parity.sql' -printf '%f\n' | LC_ALL=C sort)

if [[ "${#L1A_GENERATED[@]}" != "1" || "${#L1B_GENERATED[@]}" != "1" ]]; then
  echo "::error::Pinned CLI did not generate exactly one migration filename per unit"
  exit 1
fi

L1A_FILENAME="${L1A_GENERATED[0]}"
L1B_FILENAME="${L1B_GENERATED[0]}"
L1A_TIMESTAMP="${L1A_FILENAME%%_*}"
L1B_TIMESTAMP="${L1B_FILENAME%%_*}"

if [[ ! "$L1A_TIMESTAMP" =~ ^[0-9]{14}$ || ! "$L1B_TIMESTAMP" =~ ^[0-9]{14}$ ]]; then
  echo "::error::Generated migration timestamp format differs from the approved CLI contract"
  exit 1
fi
if (( 10#$L1B_TIMESTAMP <= 10#$L1A_TIMESTAMP )); then
  echo "::error::Generated L1B migration is not ordered strictly after L1A"
  exit 1
fi

L1A_SOURCE="$ROOT_DIR/supabase/contracts/l1a_direct_todo.sql"
L1B_SOURCE="$ROOT_DIR/supabase/contracts/l1b_planner_parity.sql"
STORAGE_SOURCE="$ROOT_DIR/supabase/contracts/l1b_private_storage.sql"

for source in "$L1A_SOURCE" "$L1B_SOURCE" "$STORAGE_SOURCE"; do
  if [[ ! -s "$source" || -L "$source" ]]; then
    echo "::error::Required reviewed source contract is missing, empty, or a symlink"
    exit 1
  fi
done

L1A_ARTIFACT="$OUTPUT_DIR/supabase/migrations/$L1A_FILENAME"
L1B_ARTIFACT="$OUTPUT_DIR/supabase/migrations/$L1B_FILENAME"
STORAGE_ARTIFACT="$OUTPUT_DIR/supabase/operations/l1b_private_storage.sql"

cp -- "$L1A_SOURCE" "$L1A_ARTIFACT"
cp -- "$L1B_SOURCE" "$L1B_ARTIFACT"
cp -- "$STORAGE_SOURCE" "$STORAGE_ARTIFACT"

cmp --silent "$L1A_SOURCE" "$L1A_ARTIFACT"
cmp --silent "$L1B_SOURCE" "$L1B_ARTIFACT"
cmp --silent "$STORAGE_SOURCE" "$STORAGE_ARTIFACT"

file_bytes() {
  stat -c '%s' "$1"
}

file_sha256() {
  sha256sum "$1" | awk '{print $1}'
}

file_blob() {
  git -C "$ROOT_DIR" hash-object "$1"
}

CLI_VERSION="$(supabase --version | tr -d '\r')"
GENERATED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - \
  "$MANIFEST_PATH" \
  "$GENERATED_UTC" \
  "$SOURCE_SHA" \
  "$EXPECTED_BASE_SHA" \
  "$EXPECTED_PROJECT_REF" \
  "$CLI_VERSION" \
  "$L1A_FILENAME" \
  "$(file_bytes "$L1A_ARTIFACT")" \
  "$(file_sha256 "$L1A_ARTIFACT")" \
  "$(file_blob "$L1A_SOURCE")" \
  "$L1B_FILENAME" \
  "$(file_bytes "$L1B_ARTIFACT")" \
  "$(file_sha256 "$L1B_ARTIFACT")" \
  "$(file_blob "$L1B_SOURCE")" \
  "$(file_bytes "$STORAGE_ARTIFACT")" \
  "$(file_sha256 "$STORAGE_ARTIFACT")" \
  "$(file_blob "$STORAGE_SOURCE")" <<'PY'
import json
import pathlib
import sys

(
    manifest_path,
    generated_utc,
    source_sha,
    base_sha,
    project_ref,
    cli_version,
    l1a_filename,
    l1a_bytes,
    l1a_sha256,
    l1a_blob,
    l1b_filename,
    l1b_bytes,
    l1b_sha256,
    l1b_blob,
    storage_bytes,
    storage_sha256,
    storage_blob,
) = sys.argv[1:]

manifest = {
    "schema_version": 1,
    "generated_utc": generated_utc,
    "repository": "champban/dashboard",
    "source_sha": source_sha,
    "base_sha": base_sha,
    "target_project_ref": project_ref,
    "supabase_cli_version": cli_version,
    "production_effect": "none",
    "generic_db_push_allowed": False,
    "client_activation_allowed": False,
    "artifacts": [
        {
            "unit": "L1A",
            "kind": "database_migration",
            "order": 1,
            "provider_name": "l1a_direct_todo",
            "path": f"supabase/migrations/{l1a_filename}",
            "bytes": int(l1a_bytes),
            "sha256": l1a_sha256,
            "reviewed_source_path": "supabase/contracts/l1a_direct_todo.sql",
            "reviewed_source_blob": l1a_blob,
            "byte_identical_to_reviewed_source": True,
        },
        {
            "unit": "L1B",
            "kind": "database_migration",
            "order": 2,
            "provider_name": "l1b_planner_parity",
            "path": f"supabase/migrations/{l1b_filename}",
            "bytes": int(l1b_bytes),
            "sha256": l1b_sha256,
            "reviewed_source_path": "supabase/contracts/l1b_planner_parity.sql",
            "reviewed_source_blob": l1b_blob,
            "byte_identical_to_reviewed_source": True,
        },
        {
            "unit": "Storage",
            "kind": "separate_storage_operation",
            "order": 3,
            "provider_name": "l1b_private_storage",
            "path": "supabase/operations/l1b_private_storage.sql",
            "bytes": int(storage_bytes),
            "sha256": storage_sha256,
            "reviewed_source_path": "supabase/contracts/l1b_private_storage.sql",
            "reviewed_source_blob": storage_blob,
            "byte_identical_to_reviewed_source": True,
        },
    ],
    "required_order": [
        "L1A targeted apply",
        "L1A catalog verification",
        "L1B targeted apply",
        "L1B catalog verification",
        "Storage targeted operation",
        "Storage catalog and policy verification",
    ],
    "hard_stops": [
        "No Production operation without the later exact Owner Critical-Gate approval",
        "No generic supabase db push",
        "No client activation, reconciliation, Drive demotion, cleanup, or L1C cutover",
    ],
}
pathlib.Path(manifest_path).write_text(
    json.dumps(manifest, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY

cat > "$ORDER_PATH" <<EOF
# L1B Promotion Artifact Apply Order

Status: **GENERATED FOR REVIEW ONLY / NO PRODUCTION AUTHORITY**

1. Targeted L1A database migration: \`$L1A_FILENAME\`
2. Stop and verify the exact L1A catalog/RLS/ACL/function shape.
3. Targeted L1B database migration: \`$L1B_FILENAME\`
4. Stop and verify the exact L1B catalog/RLS/ACL/function shape.
5. Separate private Storage operation: \`supabase/operations/l1b_private_storage.sql\`
6. Stop and verify bucket, MIME/size limits, owner-path policies, and zero unexpected objects.

The database units and Storage operation are separate gates. Do not claim
cross-operation atomicity. The published browser client must remain disabled.
Never use generic \`supabase db push\` for this project. The final Production
merge/apply remains reserved for one later exact Owner Critical-Gate decision.
EOF

python3 -m json.tool "$MANIFEST_PATH" >/dev/null

{
  echo "ARTIFACT_DIR=$OUTPUT_DIR"
  echo "ARTIFACT_MANIFEST=$MANIFEST_PATH"
  echo "L1A_GENERATED_FILENAME=$L1A_FILENAME"
  echo "L1B_GENERATED_FILENAME=$L1B_FILENAME"
} >> "$GITHUB_ENV"

{
  echo "## L1B provider-compatible promotion artifacts"
  echo
  echo "- Source SHA: \`$SOURCE_SHA\`"
  echo "- Exact base: \`$EXPECTED_BASE_SHA\`"
  echo "- Target project ref (future gate only): \`$EXPECTED_PROJECT_REF\`"
  echo "- Supabase CLI: \`$CLI_VERSION\`"
  echo "- L1A migration: \`$L1A_FILENAME\` — \`$(file_sha256 "$L1A_ARTIFACT")\`"
  echo "- L1B migration: \`$L1B_FILENAME\` — \`$(file_sha256 "$L1B_ARTIFACT")\`"
  echo "- Storage operation: \`l1b_private_storage.sql\` — \`$(file_sha256 "$STORAGE_ARTIFACT")\`"
  echo "- Contract byte comparison: **PASS (3/3)**"
  echo "- Production connection/write: **NONE**"
  echo "- Generic db push: **PROHIBITED**"
} >> "$GITHUB_STEP_SUMMARY"

echo "L1B promotion artifact generation: PASS"
