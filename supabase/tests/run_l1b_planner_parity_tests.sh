#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the throwaway PostgreSQL 17 service}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
L0B="$ROOT_DIR/supabase/migrations/20260820032749_l0b_data_foundation.sql"
L1A="$ROOT_DIR/supabase/contracts/l1a_direct_todo.sql"
L1B="$ROOT_DIR/supabase/contracts/l1b_planner_parity.sql"
STORAGE="$ROOT_DIR/supabase/contracts/l1b_private_storage.sql"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1)

bash "$ROOT_DIR/supabase/tests/static_l1a_direct_todo.sh"
bash "$ROOT_DIR/supabase/tests/static_l1b_planner_parity.sh"

"${PSQL[@]}" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then
    create role service_role nologin bypassrls;
  end if;
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

-- Minimal throwaway compatibility catalog for the separately frozen Storage
-- contract. It never connects to or represents Production Storage data.
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

"${PSQL[@]}" -f "$L0B"
"${PSQL[@]}" -f "$L1A"
"${PSQL[@]}" -f "$L1B"
"${PSQL[@]}" -f "$STORAGE"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1a_direct_todo.test.sql"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1b_planner_parity.test.sql"
