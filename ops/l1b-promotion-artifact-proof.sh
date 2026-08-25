#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable PostgreSQL 17 service}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
L0B="$ROOT_DIR/supabase/migrations/20260820032749_l0b_data_foundation.sql"
L1A="$ROOT_DIR/supabase/migrations/20260825011714_l1a_direct_todo.sql"
L1B="$ROOT_DIR/supabase/migrations/20260825011716_l1b_planner_parity.sql"
STORAGE="$ROOT_DIR/supabase/operations/l1b_private_storage.sql"
L1A_SOURCE="$ROOT_DIR/supabase/contracts/l1a_direct_todo.sql"
L1B_SOURCE="$ROOT_DIR/supabase/contracts/l1b_planner_parity.sql"
STORAGE_SOURCE="$ROOT_DIR/supabase/contracts/l1b_private_storage.sql"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1)

[[ "$(sha256sum "$L1A" | awk '{print $1}')" == "693a73b15aca115c9425267567e5b5fad2a1d43c9fa4ded0caf1420743d0cadb" ]]
[[ "$(sha256sum "$L1B" | awk '{print $1}')" == "c803c45a9d40e5c19182c0e9815a5e310bd3154b6045dbf11473a8ebd2e0ac91" ]]
[[ "$(sha256sum "$STORAGE" | awk '{print $1}')" == "9b80f536de31f79d1138b16b40dfd5794f09ad03883efd365738475259e8a93e" ]]
cmp -s "$L1A" "$L1A_SOURCE"
cmp -s "$L1B" "$L1B_SOURCE"
cmp -s "$STORAGE" "$STORAGE_SOURCE"

"${PSQL[@]}" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
alter role service_role bypassrls;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema if not exists storage;
create table storage.buckets(
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects(
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text)
returns text[] language sql immutable strict
as $$ select pg_catalog.string_to_array(name,'/') $$;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
SQL

"${PSQL[@]}" --single-transaction -f "$L0B"

catalog_fingerprint() {
  "${PSQL[@]}" -Atqc "
    with p as (
      select 'R|'||n.nspname||'|'||c.relname||'|'||c.relkind::text||'|'||c.relrowsecurity::text as x
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where (n.nspname in ('public','private') and c.relname like 'mtp_%')
         or (n.nspname='storage' and c.relname in ('buckets','objects'))
      union all
      select 'F|'||n.nspname||'|'||p.proname||'|'||pg_catalog.pg_get_function_identity_arguments(p.oid)||'|'||p.prosecdef::text
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where (n.nspname in ('public','private') and p.proname like 'mtp_%')
         or (n.nspname='storage' and p.proname='foldername')
      union all
      select 'P|'||schemaname||'|'||tablename||'|'||policyname||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
      from pg_catalog.pg_policies
      where (schemaname='public' and tablename like 'mtp_%')
         or (schemaname='storage' and tablename='objects' and policyname like 'mtp_private_%')
      union all
      select 'B|'||id||'|'||name||'|'||public::text||'|'||coalesce(file_size_limit::text,'')||'|'||coalesce(array_to_string(allowed_mime_types,','),'')
      from storage.buckets where id='mtp-private'
    ) select md5(coalesce(string_agg(x,E'\n' order by x),'')) from p;"
}

make_failure_file() {
  local source="$1" out="$2" marker="$3"
  {
    printf 'begin;\n'
    cat "$source"
    printf '\ndo $$ begin raise exception %s; end $$;\ncommit;\n' "'$marker'"
  } > "$out"
}

assert_absent() {
  local expr="$1" label="$2"
  local v
  v="$("${PSQL[@]}" -Atqc "$expr")"
  [[ "$v" == "0" ]] || { echo "unexpected object after rollback: $label=$v" >&2; exit 1; }
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

make_failure_file "$L1A" "$TMP_DIR/l1a_fail.sql" "forced_l1a_failure"
if "${PSQL[@]}" -f "$TMP_DIR/l1a_fail.sql" >/dev/null 2>&1; then
  echo "L1A failure injection unexpectedly succeeded" >&2; exit 1
fi
assert_absent "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_task_dependencies','mtp_task_external_refs','mtp_mutation_receipts')" "L1A tables"
assert_absent "select count(*) from pg_catalog.pg_namespace where nspname='private'" "private schema"

"${PSQL[@]}" --single-transaction -f "$L1A"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1a_direct_todo.test.sql"
before="$(catalog_fingerprint)"
if "${PSQL[@]}" --single-transaction -f "$L1A" >/dev/null 2>&1; then
  echo "L1A rerun unexpectedly succeeded" >&2; exit 1
fi
after="$(catalog_fingerprint)"
[[ "$before" == "$after" ]] || { echo "L1A failed rerun changed catalog" >&2; exit 1; }

make_failure_file "$L1B" "$TMP_DIR/l1b_fail.sql" "forced_l1b_failure"
if "${PSQL[@]}" -f "$TMP_DIR/l1b_fail.sql" >/dev/null 2>&1; then
  echo "L1B failure injection unexpectedly succeeded" >&2; exit 1
fi
assert_absent "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_notes','mtp_note_assets','mtp_planner_settings')" "L1B tables"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_task_dependencies','mtp_task_external_refs','mtp_mutation_receipts')")" == "3" ]]

"${PSQL[@]}" --single-transaction -f "$L1B"
before="$(catalog_fingerprint)"
if "${PSQL[@]}" --single-transaction -f "$L1B" >/dev/null 2>&1; then
  echo "L1B rerun unexpectedly succeeded" >&2; exit 1
fi
after="$(catalog_fingerprint)"
[[ "$before" == "$after" ]] || { echo "L1B failed rerun changed catalog" >&2; exit 1; }

make_failure_file "$STORAGE" "$TMP_DIR/storage_fail.sql" "forced_storage_failure"
if "${PSQL[@]}" -f "$TMP_DIR/storage_fail.sql" >/dev/null 2>&1; then
  echo "Storage failure injection unexpectedly succeeded" >&2; exit 1
fi
assert_absent "select count(*) from storage.buckets where id='mtp-private'" "mtp-private bucket"
assert_absent "select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname like 'mtp_private_%'" "mtp-private policies"

"${PSQL[@]}" --single-transaction -f "$STORAGE"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1a_direct_todo.test.sql"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1b_planner_parity.test.sql"
before="$(catalog_fingerprint)"
if "${PSQL[@]}" --single-transaction -f "$STORAGE" >/dev/null 2>&1; then
  echo "Storage rerun unexpectedly succeeded" >&2; exit 1
fi
after="$(catalog_fingerprint)"
[[ "$before" == "$after" ]] || { echo "Storage failed rerun changed catalog" >&2; exit 1; }

[[ "$("${PSQL[@]}" -Atqc "select count(*) from storage.buckets where id='mtp-private' and public=false and file_size_limit=5242880")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname like 'mtp_private_%'")" == "4" ]]

echo "L1B promotion artifact transactional/fail-closed proof: PASS"
