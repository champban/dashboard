#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

validate_artifact_entries() {
  local directory="$1"
  local archive_name="$2"
  local manifest_name="$3"
  local index
  local -a actual_entries expected_entries

  mapfile -t actual_entries < <(
    find "$directory" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort
  )
  mapfile -t expected_entries < <(
    printf '%s\n' "$archive_name" "$manifest_name" | LC_ALL=C sort
  )

  [[ "${#actual_entries[@]}" -eq "${#expected_entries[@]}" ]] || return 1
  for index in "${!expected_entries[@]}"; do
    [[ "${actual_entries[$index]}" == "${expected_entries[$index]}" ]] || return 1
  done
}

if [[ "${1:-}" == "--selftest" ]]; then
  selftest_dir="$(mktemp -d)"
  trap 'rm -rf -- "$selftest_dir"' EXIT
  selftest_archive='dashboard-supabase-backup-selftest.tar.gz.gpg'
  selftest_manifest='dashboard-supabase-backup-selftest.manifest.txt'

  touch "$selftest_dir/$selftest_archive" "$selftest_dir/$selftest_manifest"
  if ! validate_artifact_entries \
    "$selftest_dir" "$selftest_archive" "$selftest_manifest"; then
    echo "artifact entry self-test rejected the exact canonical two-file set" >&2
    exit 1
  fi

  touch "$selftest_dir/unexpected-member"
  if validate_artifact_entries \
    "$selftest_dir" "$selftest_archive" "$selftest_manifest"; then
    echo "artifact entry self-test accepted an unexpected member" >&2
    exit 1
  fi

  python3 "$(dirname "$0")/packet-a-one-time-isolated-restore-check.py" selftest
  exit 0
fi

if [[ "${1:-}" != "--run" ]]; then
  echo "usage: $0 --run" >&2
  exit 2
fi

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${ARTIFACT_DIR:?ARTIFACT_DIR is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"
: "${EXPECTED_BACKUP_STAMP:?EXPECTED_BACKUP_STAMP is required}"
: "${EXPECTED_PROJECT_REF:?EXPECTED_PROJECT_REF is required}"
: "${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
: "${EXPECTED_ARTIFACT_ID:?EXPECTED_ARTIFACT_ID is required}"
: "${EXPECTED_ARCHIVE_BYTES:?EXPECTED_ARCHIVE_BYTES is required}"
: "${EXPECTED_ARCHIVE_SHA256:?EXPECTED_ARCHIVE_SHA256 is required}"
: "${EXPECTED_ROLES_SHA256:?EXPECTED_ROLES_SHA256 is required}"
: "${EXPECTED_SCHEMA_SHA256:?EXPECTED_SCHEMA_SHA256 is required}"
: "${EXPECTED_DATA_SHA256:?EXPECTED_DATA_SHA256 is required}"
: "${EXPECTED_DB_IMAGE:?EXPECTED_DB_IMAGE is required}"
: "${EXPECTED_STORAGE_BASELINE_MAX_MIGRATION:?EXPECTED_STORAGE_BASELINE_MAX_MIGRATION is required}"
: "${EXPECTED_STORAGE_COMPAT_TARGET_MIGRATION:?EXPECTED_STORAGE_COMPAT_TARGET_MIGRATION is required}"
: "${EXPECTED_STORAGE_MIGRATION_61_BLOB_SHA:?EXPECTED_STORAGE_MIGRATION_61_BLOB_SHA is required}"
: "${EXPECTED_STORAGE_MIGRATION_62_BLOB_SHA:?EXPECTED_STORAGE_MIGRATION_62_BLOB_SHA is required}"

cleanup_early() {
  case "${BACKUP_PASSPHRASE_FILE:-}" in
    "$RUNNER_TEMP"/packet-a-b2-passphrase)
      rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || true
      ;;
    *) ;;
  esac
}
trap cleanup_early EXIT

IMMUTABLE_DB_IMAGE='supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f'
if [[ "$EXPECTED_DB_IMAGE" != "$IMMUTABLE_DB_IMAGE" ]]; then
  echo "::error::Disposable database image differs from the reviewed immutable digest"
  exit 1
fi

if [[ "$EXPECTED_STORAGE_BASELINE_MAX_MIGRATION" != "60" \
   || "$EXPECTED_STORAGE_COMPAT_TARGET_MIGRATION" != "62" \
   || "$EXPECTED_STORAGE_MIGRATION_61_BLOB_SHA" != "473f19ac94419f9cd3f25f2e40c97cefafb2798d" \
   || "$EXPECTED_STORAGE_MIGRATION_62_BLOB_SHA" != "76cf3f7f0f26d37d257c32ebb90f5beeb5a32a1e" ]]; then
  echo "::error::Disposable Storage compatibility pins differ from the reviewed upstream contract"
  exit 1
fi

if [[ "$BACKUP_PASSPHRASE_FILE" != "$RUNNER_TEMP/packet-a-b2-passphrase" \
   || ! -f "$BACKUP_PASSPHRASE_FILE" \
   || -L "$BACKUP_PASSPHRASE_FILE" \
   || "$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")" != "600" \
   || "$(stat -c '%s' "$BACKUP_PASSPHRASE_FILE")" -lt 24 ]]; then
  echo "::error::The local passphrase file does not satisfy the reviewed contract"
  exit 1
fi

if [[ -n "${SUPABASE_DB_URL+x}" || -n "${DATABASE_URL+x}" ]]; then
  echo "::error::A remote database variable reached the isolated restore job"
  exit 1
fi

case "$ARTIFACT_DIR" in
  "$RUNNER_TEMP"/*) ;;
  *)
    echo "::error::Artifact directory is outside the ephemeral runner directory"
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d "$RUNNER_TEMP/packet-a-b2.XXXXXX")"
LOCAL_PROJECT="$WORK_DIR/local-supabase"
EXTRACT_DIR="$WORK_DIR/extracted"
DECRYPTED_ARCHIVE="$WORK_DIR/backup.tar.gz"
RESTORE_LOG="$WORK_DIR/restore.log"
RESTORE_ERROR_LOG="$WORK_DIR/restore-error.log"
START_LOG="$WORK_DIR/start.log"
DOCKER_LOG="$WORK_DIR/docker.log"
EXPECTED_COUNTS="$WORK_DIR/expected-counts.tsv"
ACTUAL_COUNTS="$WORK_DIR/actual-counts.tsv"
CHECKER="$GITHUB_WORKSPACE/ops/packet-a-one-time-isolated-restore-check.py"
PROJECT_ID='packet-a-b2-isolated'
BOOTSTRAP_DB_CONTAINER="supabase_db_$PROJECT_ID"
ISOLATED_DB_CONTAINER="packet-a-b2-restore-$GITHUB_RUN_ID"
LOCAL_DB_PASSWORD='postgres'
LOCAL_DB_ADMIN='supabase_admin'
LOCAL_JWT_SECRET='packet-a-b2-local-only-jwt-secret-00000000000000000000000000000000'
STACK_STARTED=0
ISOLATED_STARTED=0

cleanup() {
  rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || true
  unset DATABASE_URL SUPABASE_DB_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  if [[ "$ISOLATED_STARTED" == "1" ]]; then
    docker rm -f -- "$ISOLATED_DB_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ "$STACK_STARTED" == "1" && -d "$LOCAL_PROJECT" ]]; then
    (cd "$LOCAL_PROJECT" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  case "${WORK_DIR:-}" in
    "$RUNNER_TEMP"/packet-a-b2.*) rm -rf -- "$WORK_DIR" ;;
    *) ;;
  esac
}
trap cleanup EXIT

mkdir -p "$EXTRACT_DIR"

ARCHIVE_NAME="dashboard-supabase-backup-$EXPECTED_BACKUP_STAMP.tar.gz.gpg"
MANIFEST_NAME="dashboard-supabase-backup-$EXPECTED_BACKUP_STAMP.manifest.txt"
ENCRYPTED_ARCHIVE="$ARTIFACT_DIR/$ARCHIVE_NAME"
EXTERNAL_MANIFEST="$ARTIFACT_DIR/$MANIFEST_NAME"

if ! validate_artifact_entries "$ARTIFACT_DIR" "$ARCHIVE_NAME" "$MANIFEST_NAME"; then
  echo "::error::Downloaded artifact does not contain the exact two-file contract"
  exit 1
fi
if [[ ! -f "$ENCRYPTED_ARCHIVE" || -L "$ENCRYPTED_ARCHIVE" || ! -f "$EXTERNAL_MANIFEST" || -L "$EXTERNAL_MANIFEST" ]]; then
  echo "::error::Downloaded artifact contains a non-regular member"
  exit 1
fi

if [[ "$(stat -c '%s' "$ENCRYPTED_ARCHIVE")" != "$EXPECTED_ARCHIVE_BYTES" ]]; then
  echo "::error::Encrypted archive size does not match the reviewed backup"
  exit 1
fi
if [[ "$(sha256sum "$ENCRYPTED_ARCHIVE" | awk '{print $1}')" != "$EXPECTED_ARCHIVE_SHA256" ]]; then
  echo "::error::Encrypted archive digest does not match the reviewed backup"
  exit 1
fi

grep -Fxq "backup_utc=$EXPECTED_BACKUP_STAMP" "$EXTERNAL_MANIFEST"
grep -Fxq "project_ref=$EXPECTED_PROJECT_REF" "$EXTERNAL_MANIFEST"
grep -Fxq "source_sha=$EXPECTED_SOURCE_SHA" "$EXTERNAL_MANIFEST"
grep -Fxq "roles_sql_sha256=$EXPECTED_ROLES_SHA256" "$EXTERNAL_MANIFEST"
grep -Fxq "schema_sql_sha256=$EXPECTED_SCHEMA_SHA256" "$EXTERNAL_MANIFEST"
grep -Fxq "data_sql_sha256=$EXPECTED_DATA_SHA256" "$EXTERNAL_MANIFEST"
grep -Fxq "encrypted_archive_sha256=$EXPECTED_ARCHIVE_SHA256" "$EXTERNAL_MANIFEST"

# Bootstrap a compatible empty local Supabase catalog before any plaintext or
# Production row is present. The database is moved to a no-network container
# before decryption, restore, or reconciliation begins.
if ! docker pull "$EXPECTED_DB_IMAGE" >"$DOCKER_LOG" 2>&1; then
  echo "::error::The reviewed immutable Supabase/PostgreSQL 17 image could not be pulled"
  exit 1
fi
EXPECTED_IMAGE_ID="$(docker image inspect "$EXPECTED_DB_IMAGE" --format '{{.Id}}')"

mkdir -p "$LOCAL_PROJECT"
if ! (cd "$LOCAL_PROJECT" && supabase init >"$WORK_DIR/init.log" 2>&1); then
  echo "::error::Disposable Supabase project initialization failed"
  exit 1
fi

python3 - "$LOCAL_PROJECT/supabase/config.toml" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
payload = path.read_text(encoding="utf-8")
payload, project_count = re.subn(
    r'^project_id\s*=\s*"[^"]*"',
    'project_id = "packet-a-b2-isolated"',
    payload,
    count=1,
    flags=re.MULTILINE,
)
payload, version_count = re.subn(
    r'(?ms)(^\[db\]\s*.*?^major_version\s*=\s*)\d+',
    r'\g<1>17',
    payload,
    count=1,
)
for section in ("db.migrations", "db.seed"):
    pattern = rf'(?ms)(^\[{re.escape(section)}\]\s*.*?^enabled\s*=\s*)true'
    payload, count = re.subn(pattern, r'\g<1>false', payload, count=1)
    if count != 1:
        raise SystemExit(f"unable to disable {section}")
if project_count != 1 or version_count != 1:
    raise SystemExit("unable to pin the isolated Supabase project contract")
path.write_text(payload, encoding="utf-8")
PY

if ! (cd "$LOCAL_PROJECT" && supabase start >"$START_LOG" 2>&1); then
  echo "::error::Disposable Supabase/PostgreSQL 17 bootstrap failed; raw diagnostics were withheld"
  exit 1
fi
STACK_STARTED=1

if ! docker inspect "$BOOTSTRAP_DB_CONTAINER" >/dev/null 2>&1; then
  echo "::error::The disposable Supabase database container was not found"
  exit 1
fi
BOOTSTRAP_IMAGE_ID="$(docker inspect "$BOOTSTRAP_DB_CONTAINER" --format '{{.Image}}')"
if [[ "$BOOTSTRAP_IMAGE_ID" != "$EXPECTED_IMAGE_ID" ]]; then
  echo "::error::Supabase CLI bootstrapped an unreviewed database image"
  exit 1
fi

mapfile -t project_containers < <(
  docker ps -a --format '{{.Names}}' \
    | awk -v suffix="_$PROJECT_ID" 'index($0, suffix) == length($0) - length(suffix) + 1' \
    | sort
)
if [[ "${#project_containers[@]}" -lt 1 ]]; then
  echo "::error::No exact disposable Supabase containers were found"
  exit 1
fi
found_bootstrap_db=0
for container in "${project_containers[@]}"; do
  if [[ ! "$container" =~ ^supabase_[a-z0-9_-]+_packet-a-b2-isolated$ ]]; then
    echo "::error::A disposable container name is outside the reviewed namespace"
    exit 1
  fi
  if [[ "$container" == "$BOOTSTRAP_DB_CONTAINER" ]]; then
    found_bootstrap_db=1
  fi
done
if [[ "$found_bootstrap_db" != "1" ]]; then
  echo "::error::The exact bootstrap database container is absent"
  exit 1
fi

if ! docker stop --time 20 "${project_containers[@]}" >>"$DOCKER_LOG" 2>&1; then
  echo "::error::The disposable Supabase bootstrap could not be stopped cleanly"
  exit 1
fi

if ! docker run --detach \
  --name "$ISOLATED_DB_CONTAINER" \
  --network none \
  --volumes-from "$BOOTSTRAP_DB_CONTAINER" \
  --volume "$EXTRACT_DIR:/packet-a-restore:ro" \
  --env POSTGRES_HOST=/var/run/postgresql \
  --env PGPORT=5432 \
  --env POSTGRES_PORT=5432 \
  --env PGPASSWORD="$LOCAL_DB_PASSWORD" \
  --env POSTGRES_PASSWORD="$LOCAL_DB_PASSWORD" \
  --env PGDATABASE=postgres \
  --env POSTGRES_DB=postgres \
  --env JWT_SECRET="$LOCAL_JWT_SECRET" \
  --env JWT_EXP=3600 \
  "$EXPECTED_DB_IMAGE" \
  postgres \
  -c config_file=/etc/postgresql/postgresql.conf \
  -c log_min_messages=fatal \
  >"$WORK_DIR/isolated-container-id" 2>>"$DOCKER_LOG"; then
  echo "::error::The network-isolated restore target failed to start"
  exit 1
fi
ISOLATED_STARTED=1

if [[ "$(docker inspect "$ISOLATED_DB_CONTAINER" --format '{{.HostConfig.NetworkMode}}')" != "none" ]]; then
  echo "::error::The restore target is not network-isolated"
  exit 1
fi
PORT_BINDINGS="$(docker inspect "$ISOLATED_DB_CONTAINER" --format '{{json .HostConfig.PortBindings}}')"
if [[ "$PORT_BINDINGS" != "null" && "$PORT_BINDINGS" != "{}" ]]; then
  echo "::error::The restore target unexpectedly publishes a host port"
  exit 1
fi
if [[ -n "$(docker port "$ISOLATED_DB_CONTAINER")" ]]; then
  echo "::error::The restore target has a reachable host port"
  exit 1
fi
if [[ "$(docker inspect "$ISOLATED_DB_CONTAINER" --format '{{.Image}}')" != "$EXPECTED_IMAGE_ID" ]]; then
  echo "::error::The isolated restore target uses an unreviewed image"
  exit 1
fi

for _ in $(seq 1 60); do
  if docker exec "$ISOLATED_DB_CONTAINER" \
    pg_isready -h /var/run/postgresql -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker exec "$ISOLATED_DB_CONTAINER" \
  pg_isready -h /var/run/postgresql -U postgres -d postgres >/dev/null 2>&1; then
  echo "::error::The network-isolated database did not become ready"
  exit 1
fi

SERVER_VERSION_NUM="$(
  docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
    psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq \
    --set=ON_ERROR_STOP=1 --command 'show server_version_num'
)"
if [[ ! "$SERVER_VERSION_NUM" =~ ^17[0-9]{4}$ ]]; then
  echo "::error::Disposable restore target is not PostgreSQL 17"
  exit 1
fi
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq \
  --set=ON_ERROR_STOP=1 \
  --command "select to_regclass('auth.users') is not null" \
  | grep -Fxq 't'; then
  echo "::error::Supabase Auth bootstrap is incompatible with the approved backup"
  exit 1
fi
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq \
  --set=ON_ERROR_STOP=1 \
  --command "select rolsuper from pg_catalog.pg_roles where rolname = 'supabase_admin'" \
  | grep -Fxq 't'; then
  echo "::error::The disposable Supabase restore administrator is incompatible"
  exit 1
fi

# CLI 2.111.0 bootstraps Storage through upstream migration 60, while the
# approved B-1 data dump was produced after upstream migrations 61 and 62.
# Apply those two exact additive changes only to the already network-isolated
# disposable target, before plaintext exists. The service migration ledger is
# deliberately left at 60 because the Storage service did not run this bridge.
if ! docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -Xq \
  --single-transaction --set=ON_ERROR_STOP=1 \
  >"$WORK_DIR/storage-compatibility.log" 2>&1 <<'SQL'
do $packet_a_b2_precondition$
begin
  if to_regclass('storage.migrations') is null
     or not exists (
       select 1
         from storage.migrations
       having count(*) = 61
          and min(id) = 0
          and max(id) = 60
          and count(distinct id) = 61
     ) then
    raise exception 'unexpected disposable Storage migration baseline';
  end if;

  if (
    select p.provolatile
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'storage'
       and p.oid = to_regprocedure('storage.filename(text)')
  ) is distinct from 'v' then
    raise exception 'unexpected disposable Storage filename baseline';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_attribute as a
      join pg_catalog.pg_class as c on c.oid = a.attrelid
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'storage'
       and not a.attisdropped
       and (
         (c.relname = 'buckets' and a.attname = 'versioning_status')
         or (
           c.relname = 'objects'
           and a.attname in ('archived_at', 'is_delete_marker', 'is_versioned')
         )
       )
  ) then
    raise exception 'unexpected pre-existing Storage compatibility column';
  end if;
end;
$packet_a_b2_precondition$;

-- Exact upstream Storage migration 61:
-- Git blob 473f19ac94419f9cd3f25f2e40c97cefafb2798d.
CREATE OR REPLACE FUNCTION storage.filename(name text)
    RETURNS text
    LANGUAGE plpgsql
    IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$function$;

-- Exact upstream Storage migration 62:
-- Git blob 76cf3f7f0f26d37d257c32ebb90f5beeb5a32a1e.
ALTER TABLE storage.buckets
ADD COLUMN IF NOT EXISTS versioning_status text NOT NULL DEFAULT 'DISABLED';

DO $packet_a_b2_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'storage.buckets'::regclass
      AND conname = 'buckets_versioning_status_check'
  ) THEN
    ALTER TABLE storage.buckets
    ADD CONSTRAINT buckets_versioning_status_check CHECK (
      versioning_status IN ('DISABLED', 'ENABLED', 'SUSPENDED')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'storage.buckets'::regclass
      AND conname = 'buckets_versioning_standard_only_check'
  ) THEN
    ALTER TABLE storage.buckets
    ADD CONSTRAINT buckets_versioning_standard_only_check CHECK (
      type = 'STANDARD'
      OR versioning_status = 'DISABLED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'storage.buckets'::regclass
      AND conname = 'buckets_versioning_dark_check'
  ) THEN
    ALTER TABLE storage.buckets
    ADD CONSTRAINT buckets_versioning_dark_check CHECK (
      versioning_status = 'DISABLED'
    );
  END IF;
END;
$packet_a_b2_constraints$;

ALTER TABLE storage.objects
ADD COLUMN IF NOT EXISTS archived_at timestamptz,
ADD COLUMN IF NOT EXISTS is_delete_marker boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_versioned boolean NOT NULL DEFAULT false;

do $packet_a_b2_postcondition$
begin
  if not exists (
    select 1
      from storage.migrations
    having count(*) = 61
       and min(id) = 0
       and max(id) = 60
       and count(distinct id) = 61
  ) then
    raise exception 'Storage compatibility bridge changed the service ledger';
  end if;

  if (
    select p.provolatile
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'storage'
       and p.oid = to_regprocedure('storage.filename(text)')
  ) is distinct from 'i' then
    raise exception 'Storage filename compatibility check failed';
  end if;

  if exists (
    select 1
      from (values
        ('buckets', 'versioning_status', 'text', true, '''DISABLED''::text'),
        ('objects', 'archived_at', 'timestamp with time zone', false, ''),
        ('objects', 'is_delete_marker', 'boolean', true, 'false'),
        ('objects', 'is_versioned', 'boolean', true, 'false')
      ) as expected(table_name, column_name, data_type, not_null, default_expression)
     where not exists (
       select 1
         from pg_catalog.pg_attribute as a
         join pg_catalog.pg_class as c on c.oid = a.attrelid
         join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
         left join pg_catalog.pg_attrdef as d
           on d.adrelid = a.attrelid and d.adnum = a.attnum
        where n.nspname = 'storage'
          and c.relname = expected.table_name
          and a.attname = expected.column_name
          and not a.attisdropped
          and pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.data_type
          and a.attnotnull = expected.not_null
          and coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') =
              expected.default_expression
     )
  ) then
    raise exception 'Storage compatibility column check failed';
  end if;

  if (
    select count(*)
      from pg_catalog.pg_constraint
     where conrelid = 'storage.buckets'::regclass
       and contype = 'c'
       and convalidated
       and conname in (
         'buckets_versioning_status_check',
         'buckets_versioning_standard_only_check',
         'buckets_versioning_dark_check'
       )
  ) <> 3 then
    raise exception 'Storage compatibility constraint check failed';
  end if;
end;
$packet_a_b2_postcondition$;
SQL
then
  echo "::error::Disposable Storage compatibility bridge failed; private diagnostics were withheld and deleted"
  exit 1
fi

# Plaintext exists only after the target has no network and no published port.
if ! gpg \
  --batch \
  --yes \
  --pinentry-mode loopback \
  --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
  --decrypt \
  --output "$DECRYPTED_ARCHIVE" \
  "$ENCRYPTED_ARCHIVE" >/dev/null 2>&1; then
  echo "::error::The pinned encrypted backup could not be decrypted"
  exit 1
fi
rm -f -- "$BACKUP_PASSPHRASE_FILE"

python3 - "$DECRYPTED_ARCHIVE" "$EXTRACT_DIR" <<'PY'
import pathlib
import shutil
import stat
import sys
import tarfile

archive = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
expected = {"roles.sql", "schema.sql", "data.sql", "SHA256SUMS.txt", "MANIFEST.txt"}
with tarfile.open(archive, "r:gz") as bundle:
    members = bundle.getmembers()
    names = [member.name for member in members]
    if len(names) != 5 or set(names) != expected:
        raise SystemExit("decrypted archive does not match the exact five-file contract")
    for member in members:
        path = pathlib.Path(member.name)
        if (
            not member.isfile()
            or path.is_absolute()
            or len(path.parts) != 1
            or member.issym()
            or member.islnk()
            or not stat.S_ISREG(member.mode | stat.S_IFREG)
        ):
            raise SystemExit("decrypted archive contains an unsafe member")
        source = bundle.extractfile(member)
        if source is None:
            raise SystemExit("unable to read an approved archive member")
        target = destination / member.name
        with target.open("xb") as output:
            shutil.copyfileobj(source, output, length=1024 * 1024)
        target.chmod(0o600)
PY

(
  cd "$EXTRACT_DIR"
  sha256sum -c SHA256SUMS.txt >/dev/null
)

for file in roles.sql schema.sql data.sql; do
  [[ -s "$EXTRACT_DIR/$file" ]]
done
[[ "$(sha256sum "$EXTRACT_DIR/roles.sql" | awk '{print $1}')" == "$EXPECTED_ROLES_SHA256" ]]
[[ "$(sha256sum "$EXTRACT_DIR/schema.sql" | awk '{print $1}')" == "$EXPECTED_SCHEMA_SHA256" ]]
[[ "$(sha256sum "$EXTRACT_DIR/data.sql" | awk '{print $1}')" == "$EXPECTED_DATA_SHA256" ]]

grep -Fxq "backup_utc=$EXPECTED_BACKUP_STAMP" "$EXTRACT_DIR/MANIFEST.txt"
grep -Fxq "project_ref=$EXPECTED_PROJECT_REF" "$EXTRACT_DIR/MANIFEST.txt"
grep -Fxq "source_sha=$EXPECTED_SOURCE_SHA" "$EXTRACT_DIR/MANIFEST.txt"

python3 "$CHECKER" extract "$EXTRACT_DIR/data.sql" "$EXPECTED_COUNTS"

PHASE_NONCE=''
if ! PHASE_NONCE="$(python3 -c 'import secrets; print(secrets.token_hex(16))')" \
   || [[ ! "$PHASE_NONCE" =~ ^[0-9a-f]{32}$ ]]; then
  echo "::error::Unable to create the private restore phase boundary"
  exit 1
fi

unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql \
  -h /var/run/postgresql \
  -U "$LOCAL_DB_ADMIN" \
  -d postgres \
  -X \
  --single-transaction \
  --set=ON_ERROR_STOP=1 \
  --set=VERBOSITY=sqlstate \
  --command "\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:roles" \
  --file /packet-a-restore/roles.sql \
  --command "\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:schema" \
  --file /packet-a-restore/schema.sql \
  --command "\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:data" \
  --command 'SET session_replication_role = replica;' \
  --file /packet-a-restore/data.sql \
  >"$RESTORE_LOG" 2>"$RESTORE_ERROR_LOG"; then
  restore_classification=''
  if restore_classification="$(
    python3 "$CHECKER" classify-restore "$RESTORE_ERROR_LOG" "$PHASE_NONCE" 2>>"$RESTORE_ERROR_LOG"
  )" && [[ "$restore_classification" =~ ^phase=(roles|schema|data)[[:space:]]sqlstate=[0-9A-Z]{5}$ ]]; then
    echo "::error::Isolated logical restore failed ($restore_classification); raw diagnostics were withheld and deleted"
  else
    echo "::error::Isolated logical restore failed (phase=unknown sqlstate=unknown); raw diagnostics were withheld and deleted"
  fi
  exit 1
fi

if ! docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -Xq \
  --set=ON_ERROR_STOP=1 >"$WORK_DIR/post-restore-check.log" 2>&1 <<'SQL'
do $$
declare
  expected_tables text[] := array[
    'mtp_line_accounts',
    'mtp_line_events',
    'mtp_line_link_codes',
    'mtp_line_mutations',
    'mtp_line_snapshots'
  ];
  l0b_tables text[] := array[
    'mtp_import_batches',
    'mtp_import_chunks',
    'mtp_import_staging',
    'mtp_import_rejects',
    'mtp_tasks',
    'mtp_subtasks',
    'mtp_events',
    'mtp_event_windows',
    'mtp_task_attachments'
  ];
  expected_functions text[] := array[
    'public.mtp_claim_line_link(text,text)',
    'public.mtp_claim_line_event(text,uuid,integer)',
    'public.mtp_finish_line_event(text,integer,text,text)',
    'public.mtp_cleanup_line_events(timestamp with time zone)'
  ];
  expected_indexes text[] := array[
    'mtp_line_link_codes_available_idx',
    'mtp_line_events_status_updated_idx',
    'mtp_line_events_received_idx',
    'mtp_line_mutations_source_event_uidx'
  ];
  signature text;
  index_name text;
  function_oid oid;
  function_is_secure boolean;
  owner_orphans bigint;
begin
  if (
    select count(*)
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname like 'mtp_line_%'
  ) <> 5 then
    raise exception 'expected the exact five LINE tables';
  end if;

  if (
    select count(*)
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname = any(expected_tables)
  ) <> 5 then
    raise exception 'required LINE tables are incomplete';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname = any(l0b_tables)
  ) then
    raise exception 'an L0b table exists in the restored backup';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(expected_tables)
       and not c.relrowsecurity
  ) then
    raise exception 'RLS is disabled on a required LINE table';
  end if;

  if exists (
    (
      select p.tablename, p.policyname
        from pg_catalog.pg_policies as p
       where p.schemaname = 'public'
         and p.tablename = any(expected_tables)
    )
    except
    (
      select * from (values
        ('mtp_line_accounts', 'owners read their LINE account'),
        ('mtp_line_link_codes', 'owners create their LINE link code'),
        ('mtp_line_link_codes', 'owners delete their LINE link code'),
        ('mtp_line_link_codes', 'owners read their LINE link code'),
        ('mtp_line_link_codes', 'owners update their LINE link code'),
        ('mtp_line_mutations', 'owners read LINE mutations'),
        ('mtp_line_mutations', 'owners update LINE mutations'),
        ('mtp_line_snapshots', 'owners create their LINE snapshot'),
        ('mtp_line_snapshots', 'owners read their LINE snapshot'),
        ('mtp_line_snapshots', 'owners update their LINE snapshot')
      ) as expected(tablename, policyname)
    )
  ) or exists (
    (
      select * from (values
        ('mtp_line_accounts', 'owners read their LINE account'),
        ('mtp_line_link_codes', 'owners create their LINE link code'),
        ('mtp_line_link_codes', 'owners delete their LINE link code'),
        ('mtp_line_link_codes', 'owners read their LINE link code'),
        ('mtp_line_link_codes', 'owners update their LINE link code'),
        ('mtp_line_mutations', 'owners read LINE mutations'),
        ('mtp_line_mutations', 'owners update LINE mutations'),
        ('mtp_line_snapshots', 'owners create their LINE snapshot'),
        ('mtp_line_snapshots', 'owners read their LINE snapshot'),
        ('mtp_line_snapshots', 'owners update their LINE snapshot')
      ) as expected(tablename, policyname)
    )
    except
    (
      select p.tablename, p.policyname
        from pg_catalog.pg_policies as p
       where p.schemaname = 'public'
         and p.tablename = any(expected_tables)
    )
  ) then
    raise exception 'the exact ten-policy LINE inventory differs';
  end if;

  if (
    select count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any(array[
         'mtp_claim_line_link',
         'mtp_claim_line_event',
         'mtp_finish_line_event',
         'mtp_cleanup_line_events'
       ])
  ) <> 4 then
    raise exception 'the exact LINE function inventory differs';
  end if;

  foreach signature in array expected_functions loop
    function_oid := pg_catalog.to_regprocedure(signature);
    if function_oid is null then
      raise exception 'a required LINE function signature is absent';
    end if;
    select p.prosecdef
           and r.rolname = 'postgres'
           and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
      into function_is_secure
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_roles as r on r.oid = p.proowner
     where p.oid = function_oid;
    if function_is_secure is distinct from true then
      raise exception 'a LINE function security contract differs';
    end if;
  end loop;

  foreach index_name in array expected_indexes loop
    if not exists (
      select 1
        from pg_catalog.pg_class as index_class
        join pg_catalog.pg_namespace as n on n.oid = index_class.relnamespace
        join pg_catalog.pg_index as i on i.indexrelid = index_class.oid
       where n.nspname = 'public'
         and index_class.relname = index_name
         and index_class.relkind = 'i'
         and i.indisvalid
         and i.indisready
    ) then
      raise exception 'a required LINE index is absent or invalid';
    end if;
  end loop;

  select coalesce(sum(orphan_count), 0)::bigint
    into owner_orphans
    from (
      select count(*)::bigint as orphan_count
        from public.mtp_line_accounts as t
        left join auth.users as u on u.id = t.owner_id
       where t.owner_id is not null and u.id is null
      union all
      select count(*)::bigint
        from public.mtp_line_events as t
        left join auth.users as u on u.id = t.owner_id
       where t.owner_id is not null and u.id is null
      union all
      select count(*)::bigint
        from public.mtp_line_link_codes as t
        left join auth.users as u on u.id = t.owner_id
       where t.owner_id is not null and u.id is null
      union all
      select count(*)::bigint
        from public.mtp_line_mutations as t
        left join auth.users as u on u.id = t.owner_id
       where t.owner_id is not null and u.id is null
      union all
      select count(*)::bigint
        from public.mtp_line_snapshots as t
        left join auth.users as u on u.id = t.owner_id
       where t.owner_id is not null and u.id is null
    ) as owner_orphan_counts;
  if owner_orphans <> 0 then
    raise exception 'owner orphan reconciliation failed';
  end if;
end
$$;
SQL
then
  echo "::error::Restored schema/RLS/function/reconciliation checks failed; raw diagnostics were withheld and deleted"
  exit 1
fi

if ! docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$ACTUAL_COUNTS" <<'SQL'
select 'auth.users', count(*)::bigint from auth.users
union all select 'public.mtp_line_accounts', count(*)::bigint from public.mtp_line_accounts
union all select 'public.mtp_line_events', count(*)::bigint from public.mtp_line_events
union all select 'public.mtp_line_link_codes', count(*)::bigint from public.mtp_line_link_codes
union all select 'public.mtp_line_mutations', count(*)::bigint from public.mtp_line_mutations
union all select 'public.mtp_line_snapshots', count(*)::bigint from public.mtp_line_snapshots
order by 1;
SQL
then
  echo "::error::Restored aggregate reconciliation query failed"
  exit 1
fi
chmod 600 "$ACTUAL_COUNTS"

python3 "$CHECKER" compare "$EXPECTED_COUNTS" "$ACTUAL_COUNTS"

{
  echo "## Packet A Backup Gate B-2 — isolated restore"
  echo
  echo "- Backup stamp: \`$EXPECTED_BACKUP_STAMP\`"
  echo "- Artifact ID: \`$EXPECTED_ARTIFACT_ID\`"
  echo "- Encrypted archive digest: \`$EXPECTED_ARCHIVE_SHA256\`"
  echo "- Restore image: \`$EXPECTED_DB_IMAGE\`"
  echo "- PostgreSQL server version number: \`$SERVER_VERSION_NUM\`"
  echo "- Target network mode: **NONE**"
  echo "- Published database port: **NONE**"
  echo "- Disposable Storage compatibility bridge 61-62 / service ledger 60: **PASS**"
  echo "- Transactional roles -> schema -> replica-mode data restore: **PASS**"
  echo "- Exact COPY/restored aggregate reconciliation (Auth + five LINE tables): **PASS**"
  echo "- Exact LINE tables, ten policies, four function signatures, security metadata and indexes: **PASS**"
  echo "- LINE owner orphan count: **0**"
  echo "- L0b table count: **0**"
  echo "- Production connection used: **NO**"
  echo "- Plaintext SQL/log artifact uploaded: **NO**"
} >> "$GITHUB_STEP_SUMMARY"

echo "Packet A Backup Gate B-2 isolated restore: PASS"
