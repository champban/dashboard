#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the throwaway PostgreSQL service}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20260820032749_l0b_data_foundation.sql"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1)
CANONICAL_VECTORS="$(<"$ROOT_DIR/test/vectors/l0b-canonical.json")"
CHUNK_VECTORS="$(<"$ROOT_DIR/test/vectors/l0b-chunk-bytes.json")"

bash "$ROOT_DIR/supabase/tests/static_l0b_data_foundation.sh"

"${PSQL[@]}" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;
alter role service_role bypassrls;

-- Reproduce the broad defaults still present on the target Supabase project.
-- The migration must close these grants per object instead of passing only
-- because stock PostgreSQL starts with narrower table/sequence privileges.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
SQL

"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" \
  -v canonical_vectors="$CANONICAL_VECTORS" \
  -v chunk_vectors="$CHUNK_VECTORS" \
  -f "$ROOT_DIR/supabase/tests/l0b_data_foundation.test.sql"
