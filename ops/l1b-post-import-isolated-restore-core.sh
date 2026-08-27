#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ "${1:-}" == "--selftest" ]]; then
  [[ 'e0977efa7ccc1f340e753fe470d19da2' =~ ^[0-9a-f]{32}$ ]]
  [[ '4c19c28fb80c806e01b5200b1e84edb4' =~ ^[0-9a-f]{32}$ ]]
  [[ '4ef839fd8a717501ab3861c1e5aa3a52' =~ ^[0-9a-f]{32}$ ]]
  [[ 'e815ffd95253662ecc53481a825c7232' =~ ^[0-9a-f]{32}$ ]]
  [[ '4ae6222b2ff6f682c244344cdcbb92ff' =~ ^[0-9a-f]{32}$ ]]
  echo "L1B B-2 restore source selftest: PASS"
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
: "${EXPECTED_LINE_FINGERPRINT:?EXPECTED_LINE_FINGERPRINT is required}"
: "${EXPECTED_L0B_FINGERPRINT:?EXPECTED_L0B_FINGERPRINT is required}"
: "${EXPECTED_AICC_FINGERPRINT:?EXPECTED_AICC_FINGERPRINT is required}"
: "${EXPECTED_LINE_INDEX_FINGERPRINT:?EXPECTED_LINE_INDEX_FINGERPRINT is required}"
: "${EXPECTED_L0B_INDEX_FINGERPRINT:?EXPECTED_L0B_INDEX_FINGERPRINT is required}"

if [[ "$EXPECTED_LINE_FINGERPRINT" != 'e0977efa7ccc1f340e753fe470d19da2' \
   || "$EXPECTED_L0B_FINGERPRINT" != '4c19c28fb80c806e01b5200b1e84edb4' \
   || "$EXPECTED_AICC_FINGERPRINT" != '4ef839fd8a717501ab3861c1e5aa3a52' \
   || "$EXPECTED_LINE_INDEX_FINGERPRINT" != 'e815ffd95253662ecc53481a825c7232' \
   || "$EXPECTED_L0B_INDEX_FINGERPRINT" != '4ae6222b2ff6f682c244344cdcbb92ff' ]]; then
  echo "::error::Frozen preflight fingerprint pins differ from reviewed evidence"
  exit 1
fi

IMMUTABLE_DB_IMAGE='supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f'
if [[ "$EXPECTED_DB_IMAGE" != "$IMMUTABLE_DB_IMAGE" ]]; then
  echo "::error::Disposable database image differs from reviewed immutable digest"
  exit 1
fi

if [[ "$EXPECTED_ARTIFACT_ID" == 'PENDING_B1' \
   || "$EXPECTED_ARCHIVE_SHA256" == 'PENDING_B1' \
   || "$EXPECTED_ROLES_SHA256" == 'PENDING_B1' \
   || "$EXPECTED_SCHEMA_SHA256" == 'PENDING_B1' \
   || "$EXPECTED_DATA_SHA256" == 'PENDING_B1' ]]; then
  echo "::error::B-1 artifact pins are not frozen"
  exit 1
fi

if [[ -n "${SUPABASE_DB_URL+x}" || -n "${DATABASE_URL+x}" ]]; then
  echo "::error::A remote database variable reached the isolated restore job"
  exit 1
fi

case "$ARTIFACT_DIR" in
  "$RUNNER_TEMP"/*) ;;
  *) echo "::error::Artifact directory is outside runner temp"; exit 1 ;;
esac

if [[ "$BACKUP_PASSPHRASE_FILE" != "$RUNNER_TEMP/l1b-b2-passphrase" \
   || ! -f "$BACKUP_PASSPHRASE_FILE" \
   || -L "$BACKUP_PASSPHRASE_FILE" \
   || "$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")" != '600' \
   || "$(stat -c '%s' "$BACKUP_PASSPHRASE_FILE")" -lt 24 ]]; then
  echo "::error::Local passphrase file does not satisfy the reviewed contract"
  exit 1
fi

WORK_DIR="$(mktemp -d "$RUNNER_TEMP/l1b-b2.XXXXXX")"
LOCAL_PROJECT="$WORK_DIR/local-supabase"
EXTRACT_DIR="$WORK_DIR/extracted"
DECRYPTED_ARCHIVE="$WORK_DIR/backup.tar.gz"
RESTORE_LOG="$WORK_DIR/restore.log"
POSTCHECK_LOG="$WORK_DIR/postcheck.log"
EXPECTED_COUNTS="$WORK_DIR/expected-counts.tsv"
ACTUAL_COUNTS="$WORK_DIR/actual-counts.tsv"
FINGERPRINTS="$WORK_DIR/fingerprints.tsv"
INDEX_FINGERPRINTS="$WORK_DIR/index-fingerprints.tsv"
CHECKER="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-check.py"
PROJECT_ID='l1b-b2-isolated'
BOOTSTRAP_DB_CONTAINER="supabase_db_$PROJECT_ID"
ISOLATED_DB_CONTAINER="l1b-b2-restore-$GITHUB_RUN_ID"
LOCAL_DB_PASSWORD='postgres'
LOCAL_DB_ADMIN='supabase_admin'
LOCAL_JWT_SECRET='l1b-b2-local-only-jwt-secret-000000000000000000000000000000000'
STACK_STARTED=0
ISOLATED_STARTED=0

cleanup() {
  rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || true
  unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  if [[ "$ISOLATED_STARTED" == '1' ]]; then
    docker rm -f -- "$ISOLATED_DB_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ "$STACK_STARTED" == '1' && -d "$LOCAL_PROJECT" ]]; then
    (cd "$LOCAL_PROJECT" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  case "${WORK_DIR:-}" in
    "$RUNNER_TEMP"/l1b-b2.*) rm -rf -- "$WORK_DIR" ;;
    *) ;;
  esac
}
trap cleanup EXIT

ARCHIVE_NAME="dashboard-l1b-post-import-backup-$EXPECTED_BACKUP_STAMP.tar.gz.gpg"
MANIFEST_NAME="dashboard-l1b-post-import-backup-$EXPECTED_BACKUP_STAMP.manifest.txt"
ENCRYPTED_ARCHIVE="$ARTIFACT_DIR/$ARCHIVE_NAME"
EXTERNAL_MANIFEST="$ARTIFACT_DIR/$MANIFEST_NAME"

[[ -f "$ENCRYPTED_ARCHIVE" && ! -L "$ENCRYPTED_ARCHIVE" ]]
[[ -f "$EXTERNAL_MANIFEST" && ! -L "$EXTERNAL_MANIFEST" ]]
[[ "$(stat -c '%s' "$ENCRYPTED_ARCHIVE")" == "$EXPECTED_ARCHIVE_BYTES" ]]
[[ "$(sha256sum "$ENCRYPTED_ARCHIVE" | awk '{print $1}')" == "$EXPECTED_ARCHIVE_SHA256" ]]
grep -Fxq "backup_utc=$EXPECTED_BACKUP_STAMP" "$EXTERNAL_MANIFEST"
grep -Fxq "project_ref=$EXPECTED_PROJECT_REF" "$EXTERNAL_MANIFEST"
grep -Fxq "source_sha=$EXPECTED_SOURCE_SHA" "$EXTERNAL_MANIFEST"
grep -Fxq "roles_sql_sha256=$EXPECTED_ROLES_SHA256" "$EXTERNAL_MANIFEST"
grep -Fxq "schema_sql_sha256=$EXPECTED_SCHEMA_SHA256" "$EXTERNAL_MANIFEST"
grep -Fxq "data_sql_sha256=$EXPECTED_DATA_SHA256" "$EXTERNAL_MANIFEST"
grep -Fxq "encrypted_archive_sha256=$EXPECTED_ARCHIVE_SHA256" "$EXTERNAL_MANIFEST"

# Bootstrap compatible Supabase catalog while network access is still allowed.
# No plaintext backup has been decrypted yet.
docker pull "$EXPECTED_DB_IMAGE" >"$WORK_DIR/docker.log" 2>&1
EXPECTED_IMAGE_ID="$(docker image inspect "$EXPECTED_DB_IMAGE" --format '{{.Id}}')"
mkdir -p "$LOCAL_PROJECT" "$EXTRACT_DIR"
chmod 700 "$LOCAL_PROJECT" "$EXTRACT_DIR"
(cd "$LOCAL_PROJECT" && supabase init >"$WORK_DIR/init.log" 2>&1)
python3 - "$LOCAL_PROJECT/supabase/config.toml" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
payload = path.read_text(encoding='utf-8')
payload, a = re.subn(r'^project_id\s*=\s*"[^"]*"', 'project_id = "l1b-b2-isolated"', payload, count=1, flags=re.MULTILINE)
payload, b = re.subn(r'(?ms)(^\[db\]\s*.*?^major_version\s*=\s*)\d+', r'\g<1>17', payload, count=1)
for section in ('db.migrations', 'db.seed'):
    pattern = rf'(?ms)(^\[{re.escape(section)}\]\s*.*?^enabled\s*=\s*)true'
    payload, count = re.subn(pattern, r'\g<1>false', payload, count=1)
    if count != 1:
        raise SystemExit(f'unable to disable {section}')
if a != 1 or b != 1:
    raise SystemExit('unable to pin isolated Supabase project')
path.write_text(payload, encoding='utf-8')
PY
(cd "$LOCAL_PROJECT" && supabase start >"$WORK_DIR/start.log" 2>&1)
STACK_STARTED=1

BOOTSTRAP_IMAGE_ID="$(docker inspect "$BOOTSTRAP_DB_CONTAINER" --format '{{.Image}}')"
[[ "$BOOTSTRAP_IMAGE_ID" == "$EXPECTED_IMAGE_ID" ]]
mapfile -t project_containers < <(docker ps -a --format '{{.Names}}' | awk -v suffix="_$PROJECT_ID" 'index($0,suffix)==length($0)-length(suffix)+1' | sort)
[[ "${#project_containers[@]}" -ge 1 ]]
printf '%s\n' "${project_containers[@]}" | grep -Fxq "$BOOTSTRAP_DB_CONTAINER"
docker stop --time 20 "${project_containers[@]}" >>"$WORK_DIR/docker.log" 2>&1

# The actual restore target has no network and no published database port.
docker run --detach \
  --name "$ISOLATED_DB_CONTAINER" \
  --network none \
  --volumes-from "$BOOTSTRAP_DB_CONTAINER" \
  --volume "$EXTRACT_DIR:/l1b-restore:ro" \
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
  postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal \
  >"$WORK_DIR/isolated-container-id" 2>>"$WORK_DIR/docker.log"
ISOLATED_STARTED=1
[[ "$(docker inspect "$ISOLATED_DB_CONTAINER" --format '{{.HostConfig.NetworkMode}}')" == 'none' ]]
PORT_BINDINGS="$(docker inspect "$ISOLATED_DB_CONTAINER" --format '{{json .HostConfig.PortBindings}}')"
[[ "$PORT_BINDINGS" == 'null' || "$PORT_BINDINGS" == '{}' ]]
[[ -z "$(docker port "$ISOLATED_DB_CONTAINER")" ]]
[[ "$(docker inspect "$ISOLATED_DB_CONTAINER" --format '{{.Image}}')" == "$EXPECTED_IMAGE_ID" ]]
for _ in $(seq 1 60); do
  if docker exec "$ISOLATED_DB_CONTAINER" pg_isready -h /var/run/postgresql -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 2
done
docker exec "$ISOLATED_DB_CONTAINER" pg_isready -h /var/run/postgresql -U postgres -d postgres >/dev/null
SERVER_VERSION_NUM="$(docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq --set=ON_ERROR_STOP=1 --command 'show server_version_num')"
[[ "$SERVER_VERSION_NUM" =~ ^17[0-9]{4}$ ]]
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq --set=ON_ERROR_STOP=1 --command "select to_regclass('auth.users') is not null" | grep -Fxq 't'

# CLI 2.111.0 local bootstrap is Storage migration 60. Production backup is
# after upstream Storage migrations 61-62. Apply those exact additive changes
# only inside the already network-isolated disposable target before decryption.
docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -Xq --single-transaction --set=ON_ERROR_STOP=1 \
  >"$WORK_DIR/storage-compat.log" 2>&1 <<'SQL'
do $pre$
begin
  if to_regclass('storage.migrations') is null
     or not exists (select 1 from storage.migrations having count(*)=61 and min(id)=0 and max(id)=60 and count(distinct id)=61) then
    raise exception 'unexpected disposable Storage migration baseline';
  end if;
end;
$pre$;
CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE _parts text[];
BEGIN SELECT string_to_array(name, '/') INTO _parts; RETURN _parts[array_length(_parts,1)]; END
$fn$;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS versioning_status text NOT NULL DEFAULT 'DISABLED';
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_versioning_status_check') THEN
    ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_status_check CHECK (versioning_status IN ('DISABLED','ENABLED','SUSPENDED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_versioning_standard_only_check') THEN
    ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_standard_only_check CHECK (type='STANDARD' OR versioning_status='DISABLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_versioning_dark_check') THEN
    ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_dark_check CHECK (versioning_status='DISABLED');
  END IF;
END;
$constraints$;
ALTER TABLE storage.objects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_delete_marker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_versioned boolean NOT NULL DEFAULT false;
do $post$
begin
  if not exists (select 1 from storage.migrations having count(*)=61 and min(id)=0 and max(id)=60 and count(distinct id)=61) then
    raise exception 'Storage compatibility bridge changed service ledger';
  end if;
end;
$post$;
SQL

# Plaintext is created only after network isolation has been proven.
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" --decrypt --output "$DECRYPTED_ARCHIVE" "$ENCRYPTED_ARCHIVE" >/dev/null 2>&1
rm -f -- "$BACKUP_PASSPHRASE_FILE"
python3 - "$DECRYPTED_ARCHIVE" "$EXTRACT_DIR" <<'PY'
import pathlib, shutil, stat, sys, tarfile
archive = pathlib.Path(sys.argv[1]); destination = pathlib.Path(sys.argv[2])
expected = {'roles.sql','schema.sql','data.sql','SHA256SUMS.txt','MANIFEST.txt'}
with tarfile.open(archive, 'r:gz') as bundle:
    members = bundle.getmembers()
    if len(members) != 5 or {m.name for m in members} != expected:
        raise SystemExit('decrypted archive differs from five-file contract')
    for member in members:
        path = pathlib.Path(member.name)
        if not member.isfile() or path.is_absolute() or len(path.parts) != 1 or member.issym() or member.islnk():
            raise SystemExit('decrypted archive contains unsafe member')
        source = bundle.extractfile(member)
        if source is None: raise SystemExit('unable to read archive member')
        target = destination / member.name
        with target.open('xb') as output: shutil.copyfileobj(source, output, length=1024*1024)
        target.chmod(0o600)
PY
(cd "$EXTRACT_DIR" && sha256sum -c SHA256SUMS.txt >/dev/null)
[[ "$(sha256sum "$EXTRACT_DIR/roles.sql" | awk '{print $1}')" == "$EXPECTED_ROLES_SHA256" ]]
[[ "$(sha256sum "$EXTRACT_DIR/schema.sql" | awk '{print $1}')" == "$EXPECTED_SCHEMA_SHA256" ]]
[[ "$(sha256sum "$EXTRACT_DIR/data.sql" | awk '{print $1}')" == "$EXPECTED_DATA_SHA256" ]]
grep -Fxq "backup_utc=$EXPECTED_BACKUP_STAMP" "$EXTRACT_DIR/MANIFEST.txt"
grep -Fxq "project_ref=$EXPECTED_PROJECT_REF" "$EXTRACT_DIR/MANIFEST.txt"
grep -Fxq "source_sha=$EXPECTED_SOURCE_SHA" "$EXTRACT_DIR/MANIFEST.txt"
python3 "$CHECKER" extract "$EXTRACT_DIR/data.sql" "$EXPECTED_COUNTS"

# Restore roles -> schema -> data as one transaction. Normalize only the known
# postgres default-ACL leak from the local Supabase bootstrap before schema DDL.
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -X --single-transaction --set=ON_ERROR_STOP=1 \
  --file /l1b-restore/roles.sql \
  --command 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;' \
  --command 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;' \
  --command 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;' \
  --command 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;' \
  --command 'SET ROLE postgres;' \
  --file /l1b-restore/schema.sql \
  --command 'RESET ROLE;' \
  --command 'SET session_replication_role = replica;' \
  --file /l1b-restore/data.sql >"$RESTORE_LOG" 2>&1; then
  echo "::error::Isolated logical restore failed; private diagnostics were withheld and deleted"
  exit 1
fi

# Exact row-count reconciliation against the encrypted B-1 data dump.
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq -F $'\t' --set=ON_ERROR_STOP=1 >"$ACTUAL_COUNTS" <<'SQL'
select 'auth.users',count(*) from auth.users
union all select 'public.mtp_line_accounts',count(*) from public.mtp_line_accounts
union all select 'public.mtp_line_events',count(*) from public.mtp_line_events
union all select 'public.mtp_line_link_codes',count(*) from public.mtp_line_link_codes
union all select 'public.mtp_line_mutations',count(*) from public.mtp_line_mutations
union all select 'public.mtp_line_snapshots',count(*) from public.mtp_line_snapshots
union all select 'public.mtp_import_batches',count(*) from public.mtp_import_batches
union all select 'public.mtp_import_chunks',count(*) from public.mtp_import_chunks
union all select 'public.mtp_import_staging',count(*) from public.mtp_import_staging
union all select 'public.mtp_import_rejects',count(*) from public.mtp_import_rejects
union all select 'public.mtp_tasks',count(*) from public.mtp_tasks
union all select 'public.mtp_subtasks',count(*) from public.mtp_subtasks
union all select 'public.mtp_events',count(*) from public.mtp_events
union all select 'public.mtp_event_windows',count(*) from public.mtp_event_windows
union all select 'public.mtp_task_attachments',count(*) from public.mtp_task_attachments
order by 1;
SQL
then
  echo "::error::Restored aggregate query failed"; exit 1
fi
chmod 600 "$ACTUAL_COUNTS"
python3 "$CHECKER" compare "$EXPECTED_COUNTS" "$ACTUAL_COUNTS"

# Validate accepted post-import state, RLS/policies/functions, owner integrity,
# and absence of L1/mtp-private. No row content is emitted.
if ! docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -Xq --single-transaction --set=ON_ERROR_STOP=1 >"$POSTCHECK_LOG" 2>&1 <<'SQL'
do $checks$
declare
  rel text;
  orphan_count bigint;
begin
  if (select count(*) from public.mtp_tasks where is_active) <> 105
     or (select count(*) from public.mtp_tasks where not is_active) <> 0
     or (select count(*) from public.mtp_subtasks where is_active) <> 17
     or (select count(*) from public.mtp_subtasks where not is_active) <> 0
     or (select count(*) from public.mtp_events where is_active) <> 6
     or (select count(*) from public.mtp_events where not is_active) <> 0
     or (select count(*) from public.mtp_event_windows where is_active) <> 15
     or (select count(*) from public.mtp_event_windows where not is_active) <> 0
     or (select count(*) from public.mtp_task_attachments where is_active) <> 0
     or (select count(*) from public.mtp_task_attachments where not is_active) <> 0
     or (select count(*) from public.mtp_import_staging) <> 0
     or (select count(*) from public.mtp_import_rejects) <> 0
     or (select count(*) from public.mtp_import_batches where status='succeeded') <> 1
     or (select count(*) from public.mtp_import_batches where status='running') <> 0
     or (select count(*) from public.mtp_import_batches where status in ('partial','failed','expired')) <> 0 then
    raise exception 'accepted L0b aggregate state differs';
  end if;
  if (select count(*) from public.mtp_line_accounts) <> 1
     or (select count(*) from public.mtp_line_events) <> 5
     or (select count(*) from public.mtp_line_link_codes) <> 1
     or (select count(*) from public.mtp_line_mutations) <> 17
     or (select count(*) from public.mtp_line_snapshots) <> 1 then
    raise exception 'LINE aggregate state differs';
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments') and c.relkind='r' and c.relrowsecurity) <> 9 then
    raise exception 'L0b RLS inventory differs';
  end if;
  if (select count(*) from pg_catalog.pg_policies where schemaname='public' and tablename in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments')) <> 9 then
    raise exception 'L0b policy inventory differs';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mtp_import_claim','mtp_import_heartbeat','mtp_import_stage','mtp_import_finalize','mtp_import_abort','mtp_import_purge_staging') and p.prosecdef and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']) <> 6 then
    raise exception 'L0b importer function security contract differs';
  end if;
  if to_regclass('public.mtp_task_dependencies') is not null
     or to_regclass('public.mtp_task_external_refs') is not null
     or to_regclass('public.mtp_mutation_receipts') is not null
     or to_regclass('public.mtp_notes') is not null
     or to_regclass('public.mtp_note_assets') is not null
     or to_regclass('public.mtp_planner_settings') is not null
     or exists(select 1 from pg_catalog.pg_namespace where nspname='private')
     or exists(select 1 from storage.buckets where id='mtp-private')
     or exists(select 1 from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname like 'mtp_private_owner_%') then
    raise exception 'pre-L1 restore unexpectedly contains L1 objects';
  end if;
  for rel in
    select c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='owner_id' and not a.attisdropped
    where n.nspname='public' and c.relname in (
      'mtp_line_accounts','mtp_line_events','mtp_line_link_codes','mtp_line_mutations','mtp_line_snapshots',
      'mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'
    )
  loop
    execute format('select count(*) from public.%I t left join auth.users u on u.id=t.owner_id where t.owner_id is not null and u.id is null', rel) into orphan_count;
    if orphan_count <> 0 then raise exception 'owner orphan detected'; end if;
  end loop;
end;
$checks$;
SQL
then
  echo "::error::Restored catalog/RLS/aggregate/owner checks failed; private diagnostics were withheld and deleted"
  exit 1
fi

# Deterministic catalog fingerprints must match the read-only Production preflight.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq -F $'\t' --set=ON_ERROR_STOP=1 >"$FINGERPRINTS" <<'SQL'
with parts as (
  select case when c.relname like 'mtp_line_%' then 'LINE' when c.relname like 'aicc_%' then 'AICC' when c.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments') then 'L0B' end as scope,
         'REL|'||n.nspname||'|'||c.relname||'|'||c.relkind::text||'|'||c.relrowsecurity::text||'|'||c.relforcerowsecurity::text as part
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and (c.relname like 'mtp_line_%' or c.relname like 'aicc_%' or c.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
  union all
  select case when c.relname like 'mtp_line_%' then 'LINE' when c.relname like 'aicc_%' then 'AICC' else 'L0B' end,
         'COL|'||n.nspname||'|'||c.relname||'|'||a.attnum::text||'|'||a.attname||'|'||pg_catalog.format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'')
  from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname='public' and a.attnum>0 and not a.attisdropped and (c.relname like 'mtp_line_%' or c.relname like 'aicc_%' or c.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
  union all
  select case when p.tablename like 'mtp_line_%' then 'LINE' when p.tablename like 'aicc_%' then 'AICC' else 'L0B' end,
         'POL|'||p.schemaname||'|'||p.tablename||'|'||p.policyname||'|'||p.cmd||'|'||array_to_string(p.roles,',')||'|'||coalesce(p.qual,'')||'|'||coalesce(p.with_check,'')
  from pg_catalog.pg_policies p where p.schemaname='public' and (p.tablename like 'mtp_line_%' or p.tablename like 'aicc_%' or p.tablename in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
  union all
  select case when p.proname like 'mtp_line_%' then 'LINE' when p.proname like 'aicc_%' then 'AICC' else 'L0B' end,
         'FUN|'||n.nspname||'|'||p.proname||'|'||pg_catalog.pg_get_function_identity_arguments(p.oid)||'|'||p.prosecdef::text||'|'||p.provolatile::text
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'mtp_line_%' or p.proname like 'aicc_%' or p.proname in ('mtp_import_claim','mtp_import_heartbeat','mtp_import_stage','mtp_import_finalize','mtp_import_abort','mtp_import_purge_staging','mtp_reject_detail_ok','mtp_nfc','mtp_netstring','mtp_canon_source_id'))
  union all
  select case when g.table_name like 'mtp_line_%' then 'LINE' when g.table_name like 'aicc_%' then 'AICC' else 'L0B' end,
         'GRANT|'||g.table_schema||'|'||g.table_name||'|'||g.grantee||'|'||g.privilege_type||'|'||g.is_grantable
  from information_schema.role_table_grants g where g.table_schema='public' and (g.table_name like 'mtp_line_%' or g.table_name like 'aicc_%' or g.table_name in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
)
select scope,count(*),md5(string_agg(part,E'\n' order by part)) from parts where scope is not null group by scope order by scope;
SQL

grep -Fxq $'AICC\t463\t'"$EXPECTED_AICC_FINGERPRINT" "$FINGERPRINTS"
grep -Fxq $'L0B\t234\t'"$EXPECTED_L0B_FINGERPRINT" "$FINGERPRINTS"
grep -Fxq $'LINE\t127\t'"$EXPECTED_LINE_FINGERPRINT" "$FINGERPRINTS"

docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq -F $'\t' --set=ON_ERROR_STOP=1 >"$INDEX_FINGERPRINTS" <<'SQL'
with idx as (
  select case when t.relname like 'mtp_line_%' then 'LINE' else 'L0B' end as scope,
         i.relname as index_name, pg_catalog.pg_get_indexdef(i.oid) as index_def,
         x.indisvalid,x.indisready,x.indisunique
  from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid join pg_catalog.pg_class t on t.oid=x.indrelid join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and (t.relname like 'mtp_line_%' or t.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
)
select scope,count(*),md5(string_agg(index_name||'|'||index_def||'|'||indisvalid::text||'|'||indisready::text||'|'||indisunique::text,E'\n' order by index_name)) from idx group by scope order by scope;
SQL

grep -Fxq $'L0B\t26\t'"$EXPECTED_L0B_INDEX_FINGERPRINT" "$INDEX_FINGERPRINTS"
grep -Fxq $'LINE\t11\t'"$EXPECTED_LINE_INDEX_FINGERPRINT" "$INDEX_FINGERPRINTS"

{
  echo "## L1B B-2 fresh post-import isolated restore"
  echo
  echo "- Backup stamp: \`$EXPECTED_BACKUP_STAMP\`"
  echo "- Artifact ID: \`$EXPECTED_ARTIFACT_ID\`"
  echo "- Encrypted archive SHA-256: \`$EXPECTED_ARCHIVE_SHA256\`"
  echo "- PostgreSQL server version number: \`$SERVER_VERSION_NUM\`"
  echo "- Target network mode: **NONE**"
  echo "- Published database port: **NONE**"
  echo "- Encrypted artifact / internal SQL hash verification: **VERIFIED**"
  echo "- Transactional roles -> schema -> data restore: **VERIFIED**"
  echo "- Exact backup COPY/restored row-count reconciliation: **VERIFIED**"
  echo "- Accepted L0b aggregate state 105/17/6/15/0 and zero tombstones/rejects/staging: **VERIFIED**"
  echo "- LINE aggregate 1/5/1/17/1: **VERIFIED**"
  echo "- L0b RLS/policies/importer functions and owner-orphan checks: **VERIFIED**"
  echo "- LINE/L0b/AICC catalog and LINE/L0b index fingerprints: **VERIFIED**"
  echo "- L1A/L1B/private Storage objects absent: **VERIFIED**"
  echo "- Production connection used: **NO**"
  echo "- Plaintext SQL/log artifact uploaded: **NO**"
} >> "$GITHUB_STEP_SUMMARY"

printf 'L1B_B2_RAW_CORE_COMPLETE\n'
