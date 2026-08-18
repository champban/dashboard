#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${EXPECTED_PROJECT_REF:?EXPECTED_PROJECT_REF is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$RUNNER_TEMP/dashboard-supabase-backup-$STAMP"
VERIFY_DIR="$RUNNER_TEMP/dashboard-supabase-verify-$STAMP"
PLAIN_ARCHIVE="$RUNNER_TEMP/dashboard-supabase-backup-$STAMP.tar.gz"
DECRYPTED_ARCHIVE="$RUNNER_TEMP/dashboard-supabase-backup-$STAMP.verify.tar.gz"
ENCRYPTED_ARCHIVE="$RUNNER_TEMP/dashboard-supabase-backup-$STAMP.tar.gz.gpg"
EXTERNAL_MANIFEST="$RUNNER_TEMP/dashboard-supabase-backup-$STAMP.manifest.txt"
PASSPHRASE_FILE="$RUNNER_TEMP/.dashboard-backup-passphrase-$STAMP"

cleanup() {
  unset SUPABASE_DB_URL BACKUP_PASSPHRASE
  rm -rf "$WORK_DIR" "$VERIFY_DIR"
  rm -f "$PLAIN_ARCHIVE" "$DECRYPTED_ARCHIVE" "$PASSPHRASE_FILE"
}
trap cleanup EXIT

mkdir -p "$WORK_DIR" "$VERIFY_DIR"
chmod 700 "$WORK_DIR" "$VERIFY_DIR"
printf '%s' "$BACKUP_PASSPHRASE" > "$PASSPHRASE_FILE"
chmod 600 "$PASSPHRASE_FILE"

supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  -f "$WORK_DIR/roles.sql" \
  --role-only

supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  -f "$WORK_DIR/schema.sql"

supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  -f "$WORK_DIR/data.sql" \
  --use-copy \
  --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

for file in roles.sql schema.sql data.sql; do
  if [[ ! -s "$WORK_DIR/$file" ]]; then
    echo "::error::$file is missing or empty"
    exit 1
  fi
done

# Fail closed if a protected input somehow appears in an exported file.
python3 - "$WORK_DIR" <<'PY'
import os
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
secrets = [
    os.environ.get("SUPABASE_DB_URL", "").encode(),
    os.environ.get("BACKUP_PASSPHRASE", "").encode(),
]
for path in (root / "roles.sql", root / "schema.sql", root / "data.sql"):
    payload = path.read_bytes()
    if any(secret and secret in payload for secret in secrets):
        raise SystemExit(f"protected input found in generated file: {path.name}")
PY

(
  cd "$WORK_DIR"
  sha256sum roles.sql schema.sql data.sql > SHA256SUMS.txt
)

SUPABASE_CLI_VERSION="$(supabase --version | tr -d '\r')"
SOURCE_SHA="$(git rev-parse HEAD)"

file_size() {
  stat -c '%s' "$1"
}

file_hash() {
  sha256sum "$1" | awk '{print $1}'
}

cat > "$WORK_DIR/MANIFEST.txt" <<EOF
backup_utc=$STAMP
project_ref=$EXPECTED_PROJECT_REF
source_repository=${GITHUB_REPOSITORY:-champban/dashboard}
source_sha=$SOURCE_SHA
supabase_cli_version=$SUPABASE_CLI_VERSION
roles_sql_bytes=$(file_size "$WORK_DIR/roles.sql")
roles_sql_sha256=$(file_hash "$WORK_DIR/roles.sql")
schema_sql_bytes=$(file_size "$WORK_DIR/schema.sql")
schema_sql_sha256=$(file_hash "$WORK_DIR/schema.sql")
data_sql_bytes=$(file_size "$WORK_DIR/data.sql")
data_sql_sha256=$(file_hash "$WORK_DIR/data.sql")
restore_order=roles.sql -> schema.sql -> SET session_replication_role=replica -> data.sql
EOF

tar -C "$WORK_DIR" -czf "$PLAIN_ARCHIVE" \
  roles.sql \
  schema.sql \
  data.sql \
  SHA256SUMS.txt \
  MANIFEST.txt

gpg \
  --batch \
  --yes \
  --pinentry-mode loopback \
  --passphrase-file "$PASSPHRASE_FILE" \
  --symmetric \
  --cipher-algo AES256 \
  --s2k-mode 3 \
  --s2k-digest-algo SHA512 \
  --compress-algo none \
  --output "$ENCRYPTED_ARCHIVE" \
  "$PLAIN_ARCHIVE"

if [[ ! -s "$ENCRYPTED_ARCHIVE" ]]; then
  echo "::error::Encrypted backup was not created"
  exit 1
fi

# Prove the encrypted package is decryptable and its SQL hashes survive.
gpg \
  --batch \
  --yes \
  --pinentry-mode loopback \
  --passphrase-file "$PASSPHRASE_FILE" \
  --decrypt \
  --output "$DECRYPTED_ARCHIVE" \
  "$ENCRYPTED_ARCHIVE"

cmp "$PLAIN_ARCHIVE" "$DECRYPTED_ARCHIVE"
tar -C "$VERIFY_DIR" -xzf "$DECRYPTED_ARCHIVE"
(
  cd "$VERIFY_DIR"
  sha256sum -c SHA256SUMS.txt
)

ENCRYPTED_BYTES="$(file_size "$ENCRYPTED_ARCHIVE")"
ENCRYPTED_SHA256="$(file_hash "$ENCRYPTED_ARCHIVE")"

cat "$WORK_DIR/MANIFEST.txt" > "$EXTERNAL_MANIFEST"
cat >> "$EXTERNAL_MANIFEST" <<EOF
encrypted_archive=$(basename "$ENCRYPTED_ARCHIVE")
encrypted_archive_bytes=$ENCRYPTED_BYTES
encrypted_archive_sha256=$ENCRYPTED_SHA256
encryption=gpg symmetric AES256; passphrase not stored
artifact_retention_days=1
EOF
chmod 600 "$ENCRYPTED_ARCHIVE" "$EXTERNAL_MANIFEST"

{
  echo "BACKUP_STAMP=$STAMP"
  echo "BACKUP_ARTIFACT_PATH=$ENCRYPTED_ARCHIVE"
  echo "BACKUP_MANIFEST_PATH=$EXTERNAL_MANIFEST"
} >> "$GITHUB_ENV"

{
  echo "## L0a one-time encrypted Supabase backup"
  echo
  echo "- UTC stamp: \`$STAMP\`"
  echo "- Project ref: \`$EXPECTED_PROJECT_REF\`"
  echo "- Source SHA: \`$SOURCE_SHA\`"
  echo "- Supabase CLI: \`$SUPABASE_CLI_VERSION\`"
  echo "- roles.sql: \`$(file_size "$WORK_DIR/roles.sql") bytes\` — \`$(file_hash "$WORK_DIR/roles.sql")\`"
  echo "- schema.sql: \`$(file_size "$WORK_DIR/schema.sql") bytes\` — \`$(file_hash "$WORK_DIR/schema.sql")\`"
  echo "- data.sql: \`$(file_size "$WORK_DIR/data.sql") bytes\` — \`$(file_hash "$WORK_DIR/data.sql")\`"
  echo "- encrypted archive: \`$ENCRYPTED_BYTES bytes\` — \`$ENCRYPTED_SHA256\`"
  echo "- decrypt-and-hash verification: **PASS**"
  echo "- artifact retention: **1 day**"
  echo
  echo "No connection URI, password, passphrase, SQL content, or private row data is written to this summary."
} >> "$GITHUB_STEP_SUMMARY"

echo "Encrypted logical backup verification: PASS"
