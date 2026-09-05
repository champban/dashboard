#!/usr/bin/env bash
set -euo pipefail

# Qualification only: no Production connection mode. --render is OFFLINE and
# emits a fixed transaction body, not permission to apply it. A future operator
# must separately qualify the target/authority and use psql -X -v
# ON_ERROR_STOP=1 --single-transaction -f with these exact reviewed bytes.
# Each unit is atomic separately; committed earlier units are NOT rolled back
# by a later unit's failure. Never automatically retry an ambiguous commit.
refuse() { printf 'L1_RUNNER_REFUSED:%s\n' "$1" >&2; exit 64; }
check_fixture_target() {
  [[ "${DATABASE_URL-}" == 'postgresql://postgres:postgres@127.0.0.1:5432/l1b_promotion_test' ]] || refuse target
  local variable
  while IFS= read -r variable; do
    [[ "$variable" != PG* ]] || refuse pg_override
  done < <(compgen -e)
}

mode="${1-}"
case "$mode" in
  --check-fixture-target)
    [[ "$#" == 1 ]] || refuse arguments
    check_fixture_target
    exit 0
    ;;
  --render) [[ "$#" == 2 ]] || refuse arguments ;;
  --fixture) [[ "$#" == 2 || "$#" == 3 ]] || refuse arguments; check_fixture_target ;;
  *) refuse mode ;;
esac

unit="$2"
fault="${3-}"
case "$unit:$fault" in
  l1a:|l1b:|storage:|l1a:--fail-before-ledger|l1b:--fail-before-ledger|l1a:--fail-after-ledger|l1b:--fail-after-ledger|storage:--fail-before-commit) ;;
  *) refuse unit_or_fault ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$unit" in
  l1a)
    relative=supabase/migrations/20260825011714_l1a_direct_todo.sql
    contract=supabase/contracts/l1a_direct_todo.sql
    source_hash=6e2df4dba24376a34acab308f20022bab9fb011efc12a7c0efb6568d618931a7
    version=20260825011714; migration_name=l1a_direct_todo
    ;;
  l1b)
    relative=supabase/migrations/20260825011716_l1b_planner_parity.sql
    contract=supabase/contracts/l1b_planner_parity.sql
    source_hash=264ea46b0706071bd30db5063453b5d41735d4cf71e9bfb84859d1e438c8e778
    version=20260825011716; migration_name=l1b_planner_parity
    ;;
  storage)
    relative=supabase/operations/l1b_private_storage.sql
    contract=supabase/contracts/l1b_private_storage.sql
    source_hash=9b80f536de31f79d1138b16b40dfd5794f09ad03883efd365738475259e8a93e
    ;;
esac

# The sentinel preserves all trailing newlines through command substitution.
# Validate this snapshot, then use ONLY it for both DDL and ledger content.
# Source pins also exclude transaction-control or psql meta-command additions.
snapshot="$(cat -- "$ROOT_DIR/$relative" || exit; printf x)"
snapshot="${snapshot%x}"
[[ "$(printf '%s' "$snapshot" | sha256sum | awk '{print $1}')" == "$source_hash" ]] || refuse source_hash
cmp -s <(printf '%s' "$snapshot") "$ROOT_DIR/$contract" || refuse contract_parity
readonly snapshot source_hash unit
quote_tag='$l1_frozen_source$'
[[ "$snapshot" != *"$quote_tag"* ]] || refuse quote_collision

render_prerequisite() {
  local prior_version="$1" prior_name="$2" prior_hash="$3"
  cat <<SQL
do \$l1_guard\$
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='$prior_version' and name='$prior_name'
      and pg_catalog.cardinality(statements)=1
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(statements[1],'UTF8')),'hex')='$prior_hash'
  ) then
    raise exception using errcode='L1R02',message='l1_runner_prerequisite_mismatch';
  end if;
end;
\$l1_guard\$;
SQL
}

render_body() {
  # Serialize competing ledger writers before checking absence or prerequisites.
  # No schema creation, repair, upsert, or replacement of historical rows.
  cat <<'SQL'
set local lock_timeout='5s';
set local statement_timeout='120s';
set local search_path=pg_catalog,public,extensions;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
SQL
  if [[ "$unit" != l1a ]]; then
    render_prerequisite 20260825011714 l1a_direct_todo 6e2df4dba24376a34acab308f20022bab9fb011efc12a7c0efb6568d618931a7
  fi
  if [[ "$unit" == storage ]]; then
    render_prerequisite 20260825011716 l1b_planner_parity 264ea46b0706071bd30db5063453b5d41735d4cf71e9bfb84859d1e438c8e778
    cat <<'SQL'
do $l1_guard$
begin
  if exists (select 1 from storage.buckets where id='mtp-private' or name='mtp-private')
     or exists (select 1 from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname like 'mtp_private_%') then
    raise exception using errcode='L1R04',message='l1_runner_storage_preexisting';
  end if;
end;
$l1_guard$;
SQL
  else
    cat <<SQL
do \$l1_guard\$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version='$version' or name='$migration_name') then
    raise exception using errcode='L1R01',message='l1_runner_ledger_collision';
  end if;
end;
\$l1_guard\$;
SQL
  fi
  printf '%s' "$snapshot"
  printf '\n'
  if [[ "$fault" == --fail-before-ledger ]]; then
    printf "do \$l1_fault\$ begin raise exception using errcode='L1R91',message='l1_runner_injected_before_ledger'; end; \$l1_fault\$;\n"
  fi
  if [[ "$unit" != storage ]]; then
    printf "insert into supabase_migrations.schema_migrations(version,statements,name) values ('%s',array[%s" "$version" "$quote_tag"
    printf '%s' "$snapshot"
    printf "%s]::text[],'%s');\n" "$quote_tag" "$migration_name"
  fi
}

# Finish rendering successfully before starting any connection. No unchecked
# process-substitution producer may fail after psql has begun its transaction.
transaction_body="$(set -e; render_body; printf x)"
transaction_body="${transaction_body%x}"
readonly transaction_body
if [[ "$mode" == --render ]]; then
  printf '%s' "$transaction_body"
  exit 0
fi

# Literal arguments and a clean libpq environment prevent URL/PGSERVICE/
# PGHOSTADDR/PGOPTIONS overrides. This credential is ONLY the existing public
# disposable workflow fixture credential; it is never a Production credential.
PSQL=(env -i PATH="$PATH" LC_ALL=C PGPASSWORD=postgres PGPASSFILE=/dev/null
  PGCONNECT_TIMEOUT=5 PGAPPNAME=l1-targeted-fixture
  psql -h 127.0.0.1 -p 5432 -U postgres -d l1b_promotion_test -w -X
  -v ON_ERROR_STOP=1 -v VERBOSITY=verbose)
fixture_guard="$(cat <<'SQL'
do $fixture_guard$
begin
  if pg_catalog.current_database()<>'l1b_promotion_test' or current_user<>'postgres'
     or pg_catalog.current_setting('server_version_num')::integer/10000<>17 then
    raise exception using errcode='L1R03',message='l1_runner_fixture_identity';
  end if;
  if pg_catalog.obj_description('l1_runner_fixture.sentinel'::regclass,'pg_class')
     is distinct from 'disposable-pg17-l1-runner-qualification-v1' then
    raise exception using errcode='L1R03',message='l1_runner_fixture_sentinel';
  end if;
end;
$fixture_guard$;
SQL
)"
after_body='select 1;'
case "$fault" in
  --fail-after-ledger) after_body="do \$l1_fault\$ begin raise exception using errcode='L1R92',message='l1_runner_injected_after_ledger'; end; \$l1_fault\$;" ;;
  --fail-before-commit) after_body="do \$l1_fault\$ begin raise exception using errcode='L1R93',message='l1_runner_injected_before_commit'; end; \$l1_fault\$;" ;;
esac
printf '%s' "$transaction_body" | "${PSQL[@]}" --single-transaction -c "$fixture_guard" -f - -c "$after_body"
printf 'L1_RUNNER_COMMITTED:%s source_sha256=%s\n' "$unit" "$source_hash"
