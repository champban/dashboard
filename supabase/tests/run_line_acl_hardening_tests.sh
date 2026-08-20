#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the throwaway PostgreSQL 17 service}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACL_MIGRATION="$ROOT_DIR/supabase/migrations/20260820083714_line_acl_default_privilege_hardening.sql"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1)

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

-- Reproduce the broad postgres defaults verified on the target Supabase
-- project. Packet A must close these defaults and the ACLs already inherited
-- by mtp_line_* without changing an existing aicc_* object.
alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to public, anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
SQL

# Apply the real repository chain in timestamp order. L0b remains unapplied in
# Production; including it here proves Packet A composes safely with the exact
# future source chain without activating any provider or copying any data.
for migration in \
  20260728155436_line_official_readonly_bot.sql \
  20260730031026_line_task_details_snapshot_v2.sql \
  20260801090000_line_snapshot_v3_events.sql \
  20260802090000_line_confirmed_mutations.sql \
  20260817150000_line_webhook_event_reliability.sql \
  20260820032749_l0b_data_foundation.sql
do
  "${PSQL[@]}" -f "$ROOT_DIR/supabase/migrations/$migration"
done

"${PSQL[@]}" <<'SQL'
-- Existing out-of-scope canary: it intentionally inherits the simulated broad
-- defaults before Packet A. Its ACL and row must remain untouched.
create table public.aicc_acl_packet_a_canary (
  id integer primary key,
  marker text not null
);
insert into public.aicc_acl_packet_a_canary(id, marker)
values (1, 'unchanged-by-packet-a');

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.mtp_line_snapshots(
  owner_id, schema_version, snapshot, source, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000001', 3,
  '{"tasks":[],"events":[],"marker":"packet-a"}'::jsonb,
  'full', '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'
);
insert into public.mtp_line_link_codes(
  owner_id, code_hash, expires_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000001', repeat('a', 64),
  '2026-08-21T00:00:00Z', '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'
);
insert into public.mtp_line_accounts(
  owner_id, line_user_id, linked_at, last_seen_at
) values (
  '00000000-0000-4000-8000-000000000001', 'packet-a-line-owner-1',
  '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'
);
insert into public.mtp_line_mutations(
  id, owner_id, operation, status, expires_at, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '{"action":"add","type":"personal","title":"Packet A fixture"}'::jsonb,
  'confirmed', '2026-08-21T00:00:00Z',
  '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'
);
insert into public.mtp_line_events(
  event_id, owner_id, status, attempt_count, received_at,
  processing_started_at, processed_at, updated_at
) values (
  'packet-a-event-1', '00000000-0000-4000-8000-000000000001',
  'processed', 1, '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z',
  '2026-08-20T00:00:01Z', '2026-08-20T00:00:01Z'
);
SQL

# Repeatability is a release invariant: a forward-fix/retry must converge to
# the same ACL without data DML or duplicate-object errors.
"${PSQL[@]}" -f "$ACL_MIGRATION"
"${PSQL[@]}" -f "$ACL_MIGRATION"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/line_acl_hardening.test.sql"

echo "LINE ACL/default-privilege PostgreSQL 17 gate: PASS"
