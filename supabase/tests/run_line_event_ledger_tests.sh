#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the throwaway PostgreSQL service}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
create extension if not exists pgcrypto;

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

-- Supabase's service_role bypasses RLS. Make the throwaway PostgreSQL role match
-- that runtime property so direct maintenance/setup statements exercise the
-- same access model rather than being silently filtered by RLS.
alter role service_role bypassrls;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
SQL

"${PSQL[@]}" -f "$ROOT_DIR/supabase/migrations/20260802090000_line_confirmed_mutations.sql"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/migrations/20260817150000_line_webhook_event_reliability.sql"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/line_event_ledger.test.sql"

# Genuine two-session claim test against PostgreSQL. Session 1 holds the insert
# transaction open; session 2 blocks on the unique key, then must return busy.
"${PSQL[@]}" -c "delete from public.mtp_line_events where event_id = 'sql-concurrent-event'" >/dev/null

first_output="$(mktemp)"
second_output="$(mktemp)"
cleanup() {
  rm -f "$first_output" "$second_output"
}
trap cleanup EXIT

stdbuf -oL psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 >"$first_output" <<'SQL' &
begin;
set local role service_role;
select decision from public.mtp_claim_line_event('sql-concurrent-event', null, 30);
select pg_catalog.pg_sleep(4);
commit;
SQL
first_pid=$!

for _ in $(seq 1 50); do
  if grep -qx 'claimed' "$first_output"; then
    break
  fi
  sleep 0.1
done

if ! grep -qx 'claimed' "$first_output"; then
  echo "first concurrent session did not obtain the claim" >&2
  wait "$first_pid" || true
  exit 1
fi

psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 >"$second_output" <<'SQL' &
set role service_role;
select decision from public.mtp_claim_line_event('sql-concurrent-event', null, 30);
SQL
second_pid=$!

wait "$first_pid"
wait "$second_pid"

claimed_count="$(cat "$first_output" "$second_output" | grep -c '^claimed$' || true)"
busy_count="$(cat "$first_output" "$second_output" | grep -c '^busy$' || true)"

if [[ "$claimed_count" != "1" || "$busy_count" != "1" ]]; then
  echo "concurrent claim mismatch: claimed=$claimed_count busy=$busy_count" >&2
  echo "session 1:" >&2
  cat "$first_output" >&2
  echo "session 2:" >&2
  cat "$second_output" >&2
  exit 1
fi

echo "LINE event ledger real PostgreSQL concurrency: PASS (claimed=1, busy=1)"
