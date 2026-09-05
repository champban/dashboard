#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/ops/l1-targeted-apply.sh"
# This check is OFFLINE and runs before even fixture bootstrap. No arbitrary
# DATABASE_URL, libpq environment override, or Production target is accepted.
bash "$RUNNER" --check-fixture-target
L0B="$ROOT_DIR/supabase/migrations/20260820032749_l0b_data_foundation.sql"
L1A="$ROOT_DIR/supabase/migrations/20260825011714_l1a_direct_todo.sql"
L1B="$ROOT_DIR/supabase/migrations/20260825011716_l1b_planner_parity.sql"
STORAGE="$ROOT_DIR/supabase/operations/l1b_private_storage.sql"
L1A_SOURCE="$ROOT_DIR/supabase/contracts/l1a_direct_todo.sql"
L1B_SOURCE="$ROOT_DIR/supabase/contracts/l1b_planner_parity.sql"
STORAGE_SOURCE="$ROOT_DIR/supabase/contracts/l1b_private_storage.sql"
PSQL=(env PGPASSWORD=postgres PGPASSFILE=/dev/null PGCONNECT_TIMEOUT=5
  psql -h 127.0.0.1 -p 5432 -U postgres -d l1b_promotion_test -w -X
  -v ON_ERROR_STOP=1)

[[ "$(sha256sum "$L1A" | awk '{print $1}')" == "6e2df4dba24376a34acab308f20022bab9fb011efc12a7c0efb6568d618931a7" ]]
[[ "$(sha256sum "$L1B" | awk '{print $1}')" == "264ea46b0706071bd30db5063453b5d41735d4cf71e9bfb84859d1e438c8e778" ]]
[[ "$(sha256sum "$STORAGE" | awk '{print $1}')" == "9b80f536de31f79d1138b16b40dfd5794f09ad03883efd365738475259e8a93e" ]]
cmp -s "$L1A" "$L1A_SOURCE"
cmp -s "$L1B" "$L1B_SOURCE"
cmp -s "$STORAGE" "$STORAGE_SOURCE"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

expect_offline_refusal() {
  local marker="$1"; shift
  if "$@" >"$TMP_DIR/offline.log" 2>&1; then
    echo "offline refusal unexpectedly succeeded: $marker" >&2; exit 1
  fi
  grep -Fxq "L1_RUNNER_REFUSED:$marker" "$TMP_DIR/offline.log"
}
expect_offline_refusal unit_or_fault bash "$RUNNER" --render unknown
expect_offline_refusal arguments bash "$RUNNER" --render l1a --fail-after-ledger
expect_offline_refusal target env DATABASE_URL=postgresql://invalid.invalid/forbidden bash "$RUNNER" --fixture l1a
expect_offline_refusal target env DATABASE_URL=postgresql://invalid.invalid/forbidden bash "${BASH_SOURCE[0]}"
for variable in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSFILE PGPASSWORD; do
  expect_offline_refusal pg_override env "$variable=refused-before-connect" bash "$RUNNER" --fixture l1a
done
for unit in l1a l1b storage; do
  env -u DATABASE_URL bash "$RUNNER" --render "$unit" >"$TMP_DIR/$unit.render.sql"
  echo "L1_RUNNER_RENDER_SHA256:$unit $(sha256sum "$TMP_DIR/$unit.render.sql" | awk '{print $1}')"
done
echo "L1_RUNNER_OFFLINE_GUARDS:PASS"
echo "L1_RUNNER_SHA256:$(sha256sum "$RUNNER" | awk '{print $1}')"

"${PSQL[@]}" --single-transaction -f - <<'SQL'
do $$
begin
  if pg_catalog.current_database()<>'l1b_promotion_test' or current_user<>'postgres'
     or pg_catalog.current_setting('server_version_num')::integer/10000<>17 then
    raise exception 'fixture PostgreSQL17 identity mismatch';
  end if;
end;
$$;
create schema l1_runner_fixture;
create table l1_runner_fixture.sentinel(id boolean primary key check(id));
comment on table l1_runner_fixture.sentinel is 'disposable-pg17-l1-runner-qualification-v1';
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text unique,
  rollback text[]
);
insert into supabase_migrations.schema_migrations(version,statements,name)
values ('00000000000000',array['select 1;'],'disposable_fixture_baseline');
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
      select 'F|'||n.nspname||'|'||p.proname||'|'||pg_catalog.pg_get_functiondef(p.oid)||'|'||coalesce(p.proacl::text,'')
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
      union all
      select 'A|'||n.nspname||'|'||c.relname||'|'||a.attname||'|'||a.atttypid::text||'|'||a.attnotnull::text||'|'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'')
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where n.nspname in ('public','private') and c.relname like 'mtp_%' and a.attnum>0 and not a.attisdropped
      union all
      select 'C|'||n.nspname||'|'||c.relname||'|'||con.conname||'|'||pg_catalog.pg_get_constraintdef(con.oid)
      from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid=con.conrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relname like 'mtp_%'
      union all
      select 'T|'||n.nspname||'|'||c.relname||'|'||pg_catalog.pg_get_triggerdef(t.oid)
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relname like 'mtp_%' and not t.tgisinternal
    ) select md5(coalesce(string_agg(x,E'\n' order by x),'')) from p;"
}

ledger_fingerprint() {
  "${PSQL[@]}" -Atqc "select md5(coalesce(string_agg(pg_catalog.to_jsonb(m)::text,E'\n' order by version),'')) from supabase_migrations.schema_migrations m"
}

expect_atomic_failure() {
  local unit="$1" fault="$2" code="$3" marker="$4" before_catalog before_ledger
  before_catalog="$(catalog_fingerprint)"; before_ledger="$(ledger_fingerprint)"
  if bash "$RUNNER" --fixture "$unit" "$fault" >"$TMP_DIR/atomic.log" 2>&1; then
    echo "$unit $fault unexpectedly committed" >&2; exit 1
  fi
  grep -q "$code:.*$marker" "$TMP_DIR/atomic.log"
  [[ "$before_catalog" == "$(catalog_fingerprint)" ]]
  [[ "$before_ledger" == "$(ledger_fingerprint)" ]]
  echo "L1_RUNNER_ATOMIC_ROLLBACK:$unit:$fault:PASS"
}

expect_render_failure() {
  local unit="$1" setup="$2" code="$3" marker="$4" before_catalog before_ledger
  before_catalog="$(catalog_fingerprint)"; before_ledger="$(ledger_fingerprint)"
  # Setup is deliberately uncommitted fixture-only state. The real rendered
  # package must reject it; psql rolls back BOTH setup and the package together.
  if "${PSQL[@]}" -v VERBOSITY=verbose --single-transaction -c "$setup" -f "$TMP_DIR/$unit.render.sql" >"$TMP_DIR/collision.log" 2>&1; then
    echo "$unit expected guard failure unexpectedly committed" >&2; exit 1
  fi
  grep -q "$code:.*$marker" "$TMP_DIR/collision.log"
  [[ "$before_catalog" == "$(catalog_fingerprint)" ]]
  [[ "$before_ledger" == "$(ledger_fingerprint)" ]]
  echo "L1_RUNNER_GUARD:$unit:$marker:PASS"
}

assert_ledger() {
  local version="$1" name="$2" source_hash="$3" expected_count="$4"
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from supabase_migrations.schema_migrations")" == "$expected_count" ]]
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from supabase_migrations.schema_migrations where version='$version' and name='$name' and cardinality(statements)=1 and encode(sha256(convert_to(statements[1],'UTF8')),'hex')='$source_hash' and created_by is null and idempotency_key is null and rollback is null")" == 1 ]]
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from supabase_migrations.schema_migrations where version='00000000000000' and name='disposable_fixture_baseline' and statements=array['select 1;']")" == 1 ]]
  echo "L1_RUNNER_EXACT_LEDGER:$version:PASS"
}

expect_source_rerun_failure() {
  local source="$1" code="$2" marker="$3" before_catalog before_ledger
  before_catalog="$(catalog_fingerprint)"; before_ledger="$(ledger_fingerprint)"
  # Retain the original frozen-SQL fail-closed rerun proof as well as the new
  # runner collision guard. Neither source nor historical ledger may change.
  if "${PSQL[@]}" -v VERBOSITY=verbose --single-transaction -f "$source" >"$TMP_DIR/source-rerun.log" 2>&1; then
    echo "frozen source rerun unexpectedly succeeded" >&2; exit 1
  fi
  grep -q "$code:.*$marker" "$TMP_DIR/source-rerun.log"
  [[ "$before_catalog" == "$(catalog_fingerprint)" ]]
  [[ "$before_ledger" == "$(ledger_fingerprint)" ]]
}

assert_absent() {
  local expr="$1" label="$2"
  local v
  v="$("${PSQL[@]}" -Atqc "$expr")"
  [[ "$v" == "0" ]] || { echo "unexpected object after rollback: $label=$v" >&2; exit 1; }
}

expect_render_failure l1a "insert into supabase_migrations.schema_migrations(version,statements,name) values ('20260825011714',array['mismatched fixture source'],'wrong_name')" L1R01 l1_runner_ledger_collision
expect_render_failure l1a "insert into supabase_migrations.schema_migrations(version,statements,name) values ('11111111111111',array['mismatched fixture source'],'l1a_direct_todo')" L1R01 l1_runner_ledger_collision
expect_render_failure l1b 'select 1;' L1R02 l1_runner_prerequisite_mismatch
expect_render_failure storage 'select 1;' L1R02 l1_runner_prerequisite_mismatch
expect_atomic_failure l1a --fail-before-ledger L1R91 l1_runner_injected_before_ledger
expect_atomic_failure l1a --fail-after-ledger L1R92 l1_runner_injected_after_ledger
assert_absent "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_task_dependencies','mtp_task_external_refs','mtp_mutation_receipts')" "L1A tables"
assert_absent "select count(*) from pg_catalog.pg_namespace where nspname='private'" "private schema"

bash "$RUNNER" --fixture l1a
assert_ledger 20260825011714 l1a_direct_todo 6e2df4dba24376a34acab308f20022bab9fb011efc12a7c0efb6568d618931a7 2
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1a_direct_todo.test.sql"

# Deterministic trigger-guard READ COMMITTED concurrency proof.  Session one adds A -> B and
# holds the owner-scoped transaction lock.  Session two attempts C -> A against
# existing B -> C: it must wait, refresh its snapshot after session one commits,
# and then receive the preserved L1D01 dependency_cycle error.
OWNER1=30000000-0000-4000-8000-000000000003
OWNER2=40000000-0000-4000-8000-000000000004
A=31000000-0000-4000-8000-000000000001
B=31000000-0000-4000-8000-000000000002
C=31000000-0000-4000-8000-000000000003
D=41000000-0000-4000-8000-000000000001
E=41000000-0000-4000-8000-000000000002
"${PSQL[@]}" -v o1="$OWNER1" -v o2="$OWNER2" -v a="$A" -v b="$B" -v c="$C" -v d="$D" -v e="$E" <<'SQL'
insert into auth.users(id) values (:'o1'),(:'o2') on conflict do nothing;
insert into public.mtp_tasks(owner_id,id,task_kind,source_key,source_id_legacy,title,record_origin,content_hash)
values
  (:'o1',:'a','personal','cycle-a','cycle-a','A','direct',decode(repeat('01',32),'hex')),
  (:'o1',:'b','personal','cycle-b','cycle-b','B','direct',decode(repeat('02',32),'hex')),
  (:'o1',:'c','personal','cycle-c','cycle-c','C','direct',decode(repeat('03',32),'hex')),
  (:'o2',:'d','personal','cycle-d','cycle-d','D','direct',decode(repeat('04',32),'hex')),
  (:'o2',:'e','personal','cycle-e','cycle-e','E','direct',decode(repeat('05',32),'hex'));
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id)
values (:'o1',:'b',:'c');
SQL

trigger_s1_fifo="$TMP_DIR/trigger-session1.sql"
mkfifo "$trigger_s1_fifo"
PGAPPNAME=l1b-trigger-cycle-session1 "${PSQL[@]}" -v o="$OWNER1" -v a="$A" -v b="$B" <"$trigger_s1_fifo" >"$TMP_DIR/session1.log" 2>&1 &
s1=$!
exec 8>"$trigger_s1_fifo"
cat >&8 <<'SQL'
begin;
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id) values (:'o',:'a',:'b');
SQL

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks where locktype='advisory' and granted and objid = (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER1',0) & 4294967295)::oid")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks where locktype='advisory' and granted and objid = (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER1',0) & 4294967295)::oid")" == "1" ]]

set +e
PGAPPNAME=l1b-trigger-cycle-session2 "${PSQL[@]}" -v o="$OWNER1" -v c="$C" -v a="$A" >"$TMP_DIR/session2.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id) values (:'o',:'c',:'a');
SQL
s2=$!
set -e

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-trigger-cycle-session2' and wait_event_type='Lock' and wait_event='advisory'")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-trigger-cycle-session2' and wait_event_type='Lock' and wait_event='advisory'")" == "1" ]]

# A different owner derives a different key and completes while OWNER1 is held.
[[ "$("${PSQL[@]}" -Atqc "select (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER1',0) <> pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER2',0))::int")" == "1" ]]
"${PSQL[@]}" -v o="$OWNER2" -v d="$D" -v e="$E" <<'SQL'
set lock_timeout = '500ms';
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id) values (:'o',:'d',:'e');
SQL

# The same-owner waiter and distinct-owner probe have both completed while
# session one still owns its transaction-scoped advisory lock. Release it only
# now so the proof does not depend on runner timing.
printf '%s\n' 'commit;' >&8
exec 8>&-
wait "$s1"
if wait "$s2"; then echo "same-owner cycle unexpectedly committed" >&2; exit 1; fi
grep -q 'dependency_cycle' "$TMP_DIR/session2.log"
grep -q 'L1D01' "$TMP_DIR/session2.log"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER1' and is_active and (task_id,depends_on_task_id) in (('$A','$B'),('$C','$A'))")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "with recursive reach(start_id,task_id,path,cycle) as (select task_id,depends_on_task_id,array[task_id,depends_on_task_id],task_id=depends_on_task_id from public.mtp_task_dependencies where owner_id='$OWNER1' and is_active union all select r.start_id,d.depends_on_task_id,r.path||d.depends_on_task_id,d.depends_on_task_id=any(r.path) from reach r join public.mtp_task_dependencies d on d.owner_id='$OWNER1' and d.task_id=r.task_id and d.is_active where not r.cycle) select count(*) from reach where cycle")" == "0" ]]

expect_render_failure l1a 'select 1;' L1R01 l1_runner_ledger_collision
expect_source_rerun_failure "$L1A" 42701 record_origin

expect_render_failure l1b "update supabase_migrations.schema_migrations set statements=array['mismatched fixture source'] where version='20260825011714'" L1R02 l1_runner_prerequisite_mismatch
expect_render_failure l1b "insert into supabase_migrations.schema_migrations(version,statements,name) values ('20260825011716',array['mismatched fixture source'],'wrong_name')" L1R01 l1_runner_ledger_collision
expect_atomic_failure l1b --fail-before-ledger L1R91 l1_runner_injected_before_ledger
expect_atomic_failure l1b --fail-after-ledger L1R92 l1_runner_injected_after_ledger
assert_absent "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_notes','mtp_note_assets','mtp_planner_settings')" "L1B tables"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('mtp_task_dependencies','mtp_task_external_refs','mtp_mutation_receipts')")" == "3" ]]

bash "$RUNNER" --fixture l1b
assert_ledger 20260825011716 l1b_planner_parity 264ea46b0706071bd30db5063453b5d41735d4cf71e9bfb84859d1e438c8e778 3

# Deterministic RPC-entry lock-order proof. Session one replaces F's children
# with F -> G, then the test driver holds its stdin FIFO open while it owns the
# advisory lock. Session two attempts H -> F against existing G -> H. It must
# wait for the advisory lock before acquiring H's task row lock, then reject the
# completed cycle only after the driver explicitly commits session one.
OWNER3=50000000-0000-4000-8000-000000000005
OWNER4=60000000-0000-4000-8000-000000000006
F=51000000-0000-4000-8000-000000000001
G=51000000-0000-4000-8000-000000000002
H=51000000-0000-4000-8000-000000000003
I=61000000-0000-4000-8000-000000000001
J=61000000-0000-4000-8000-000000000002
"${PSQL[@]}" -v o3="$OWNER3" -v o4="$OWNER4" -v f="$F" -v g="$G" -v h="$H" -v i="$I" -v j="$J" <<'SQL'
insert into auth.users(id) values (:'o3'),(:'o4') on conflict do nothing;
insert into public.mtp_tasks(owner_id,id,task_kind,source_key,source_id_legacy,title,record_origin,content_hash)
values
  (:'o3',:'f','personal','rpc-cycle-f','rpc-cycle-f','F','direct',decode(repeat('06',32),'hex')),
  (:'o3',:'g','personal','rpc-cycle-g','rpc-cycle-g','G','direct',decode(repeat('07',32),'hex')),
  (:'o3',:'h','personal','rpc-cycle-h','rpc-cycle-h','H','direct',decode(repeat('08',32),'hex')),
  (:'o4',:'i','personal','rpc-cycle-i','rpc-cycle-i','I','direct',decode(repeat('09',32),'hex')),
  (:'o4',:'j','personal','rpc-cycle-j','rpc-cycle-j','J','direct',decode(repeat('0a',32),'hex'));
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id)
values (:'o3',:'g',:'h');
SQL

rpc_s1_fifo="$TMP_DIR/rpc-session1.sql"
mkfifo "$rpc_s1_fifo"
PGAPPNAME=l1b-rpc-cycle-session1 "${PSQL[@]}" -v o="$OWNER3" -v f="$F" -v g="$G" <"$rpc_s1_fifo" >"$TMP_DIR/rpc-session1.log" 2>&1 &
rpc_s1=$!
exec 9>"$rpc_s1_fifo"
cat >&9 <<'SQL'
begin;
select pg_catalog.set_config('request.jwt.claim.sub',:'o',true);
set local role authenticated;
select public.mtp_task_children_replace_v1(
  :'f',1,
  pg_catalog.jsonb_build_object(
    'subtasks','[]'::jsonb,
    'dependencies',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id',:'g','ordinal',0))
  ),
  'f8000000-0000-4000-8000-000000000001'
);
SQL

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks where locktype='advisory' and granted and objid = (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER3',0) & 4294967295)::oid")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks where locktype='advisory' and granted and objid = (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER3',0) & 4294967295)::oid")" == "1" ]]

set +e
PGAPPNAME=l1b-rpc-cycle-session2 "${PSQL[@]}" -v o="$OWNER3" -v h="$H" -v f="$F" >"$TMP_DIR/rpc-session2.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
begin;
select pg_catalog.set_config('request.jwt.claim.sub',:'o',true);
set local role authenticated;
select public.mtp_task_children_replace_v1(
  :'h',1,
  pg_catalog.jsonb_build_object(
    'subtasks','[]'::jsonb,
    'dependencies',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id',:'f','ordinal',0))
  ),
  'f8000000-0000-4000-8000-000000000002'
);
commit;
SQL
rpc_s2=$!
set -e

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-rpc-cycle-session2' and wait_event_type='Lock' and wait_event='advisory'")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-rpc-cycle-session2' and wait_event_type='Lock' and wait_event='advisory'")" == "1" ]]

# A NOWAIT probe can lock H while session two is waiting. This proves the RPC
# has not taken its per-task row lock before the owner advisory lock.
if ! "${PSQL[@]}" -v o="$OWNER3" -v h="$H" >"$TMP_DIR/rpc-row-probe.log" 2>&1 <<'SQL'
begin;
select id from public.mtp_tasks where owner_id=:'o' and id=:'h' for update nowait;
rollback;
SQL
then
  echo "waiting RPC acquired task row before owner advisory lock" >&2
  exit 1
fi

# A different owner derives a different key and completes through the same RPC
# while OWNER3 is held.
[[ "$("${PSQL[@]}" -Atqc "select (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER3',0) <> pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER4',0))::int")" == "1" ]]
"${PSQL[@]}" -v o="$OWNER4" -v i="$I" -v j="$J" <<'SQL'
begin;
select pg_catalog.set_config('request.jwt.claim.sub',:'o',true);
set local lock_timeout = '500ms';
set local role authenticated;
select public.mtp_task_children_replace_v1(
  :'i',1,
  pg_catalog.jsonb_build_object(
    'subtasks','[]'::jsonb,
    'dependencies',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id',:'j','ordinal',0))
  ),
  'f8000000-0000-4000-8000-000000000003'
);
commit;
SQL

# The waiter, NOWAIT row probe, and distinct-owner RPC have all completed.
# Release session one only now; EOF lets psql exit after the explicit commit.
printf '%s\n' 'commit;' >&9
exec 9>&-
wait "$rpc_s1"
if wait "$rpc_s2"; then echo "same-owner RPC cycle unexpectedly committed" >&2; exit 1; fi
grep -q 'dependency_cycle' "$TMP_DIR/rpc-session2.log"
grep -q 'L1D01' "$TMP_DIR/rpc-session2.log"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER3' and is_active and (task_id,depends_on_task_id) in (('$F','$G'),('$H','$F'))")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "with recursive reach(start_id,task_id,path,cycle) as (select task_id,depends_on_task_id,array[task_id,depends_on_task_id],task_id=depends_on_task_id from public.mtp_task_dependencies where owner_id='$OWNER3' and is_active union all select r.start_id,d.depends_on_task_id,r.path||d.depends_on_task_id,d.depends_on_task_id=any(r.path) from reach r join public.mtp_task_dependencies d on d.owner_id='$OWNER3' and d.task_id=r.task_id and d.is_active where not r.cycle) select count(*) from reach where cycle")" == "0" ]]

# Mixed direct reactivation-versus-RPC lock-order proof. A privileged direct
# session first locks an inactive dependency tuple. The RPC takes the graph
# transaction lock and waits to replace that tombstone with a serialized
# INSERT. Direct reactivation must fail immediately with L1D02 without trying
# to acquire the graph lock; the RPC must then complete without 40P01.
OWNER5=70000000-0000-4000-8000-000000000007
K=71000000-0000-4000-8000-000000000001
L=71000000-0000-4000-8000-000000000002
"${PSQL[@]}" -v o="$OWNER5" -v k="$K" -v l="$L" <<'SQL'
insert into auth.users(id) values (:'o') on conflict do nothing;
insert into public.mtp_tasks(owner_id,id,task_kind,source_key,source_id_legacy,title,record_origin,content_hash)
values
  (:'o',:'k','personal','mixed-cycle-k','mixed-cycle-k','K','direct',decode(repeat('0b',32),'hex')),
  (:'o',:'l','personal','mixed-cycle-l','mixed-cycle-l','L','direct',decode(repeat('0c',32),'hex'));
insert into public.mtp_task_dependencies(
  owner_id,task_id,depends_on_task_id,is_active,source_deleted_at
) values (:'o',:'k',:'l',false,pg_catalog.now());
SQL

mixed_direct_fifo="$TMP_DIR/mixed-direct-session.sql"
mkfifo "$mixed_direct_fifo"
PGAPPNAME=l1b-mixed-direct-update "${PSQL[@]}" -v o="$OWNER5" -v k="$K" -v l="$L" <"$mixed_direct_fifo" >"$TMP_DIR/mixed-direct.log" 2>&1 &
mixed_direct=$!
exec 7>"$mixed_direct_fifo"
cat >&7 <<'SQL'
\set VERBOSITY verbose
begin;
select 1 from public.mtp_task_dependencies
 where owner_id=:'o' and task_id=:'k' and depends_on_task_id=:'l'
 for update;
SQL

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-mixed-direct-update' and state='idle in transaction'")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-mixed-direct-update' and state='idle in transaction'")" == "1" ]]

set +e
PGAPPNAME=l1b-mixed-rpc "${PSQL[@]}" -v o="$OWNER5" -v k="$K" -v l="$L" >"$TMP_DIR/mixed-rpc.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
begin;
select pg_catalog.set_config('request.jwt.claim.sub',:'o',true);
set local role authenticated;
select public.mtp_task_children_replace_v1(
  :'k',1,
  pg_catalog.jsonb_build_object(
    'subtasks','[]'::jsonb,
    'dependencies',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id',:'l','ordinal',0))
  ),
  'f8000000-0000-4000-8000-000000000004'
);
commit;
SQL
mixed_rpc=$!
set -e

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-mixed-rpc' and wait_event_type='Lock' and coalesce(wait_event,'') <> 'advisory'")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where application_name='l1b-mixed-rpc' and wait_event_type='Lock' and coalesce(wait_event,'') <> 'advisory'")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks l join pg_catalog.pg_stat_activity a on a.pid=l.pid where a.application_name='l1b-mixed-rpc' and l.locktype='advisory' and l.granted and l.objid=(pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER5',0) & 4294967295)::oid")" == "1" ]]

cat >&7 <<'SQL'
update public.mtp_task_dependencies
   set is_active=true,source_deleted_at=null
 where owner_id=:'o' and task_id=:'k' and depends_on_task_id=:'l';
commit;
SQL
exec 7>&-
if wait "$mixed_direct"; then echo "direct dependency update without owner lock unexpectedly succeeded" >&2; exit 1; fi
grep -q 'dependency_lock_required' "$TMP_DIR/mixed-direct.log"
grep -q 'L1D02' "$TMP_DIR/mixed-direct.log"
wait "$mixed_rpc"
if grep -q '40P01' "$TMP_DIR/mixed-direct.log" "$TMP_DIR/mixed-rpc.log"; then
  echo "mixed direct UPDATE and RPC produced a deadlock" >&2
  exit 1
fi
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER5' and task_id='$K' and depends_on_task_id='$L' and is_active and ordinal=0")" == "1" ]]

# A shared transaction advisory lock cannot authorize direct reactivation.
# Graph topology changes must enter through the serialized INSERT path.
OWNER6=80000000-0000-4000-8000-000000000008
M=81000000-0000-4000-8000-000000000001
N=81000000-0000-4000-8000-000000000002
"${PSQL[@]}" -v o="$OWNER6" -v m="$M" -v n="$N" <<'SQL'
insert into auth.users(id) values (:'o') on conflict do nothing;
insert into public.mtp_tasks(owner_id,id,task_kind,source_key,source_id_legacy,title,record_origin,content_hash)
values
  (:'o',:'m','personal','shared-lock-m','shared-lock-m','M','direct',decode(repeat('0d',32),'hex')),
  (:'o',:'n','personal','shared-lock-n','shared-lock-n','N','direct',decode(repeat('0e',32),'hex'));
insert into public.mtp_task_dependencies(
  owner_id,task_id,depends_on_task_id,is_active,source_deleted_at
) values (:'o',:'m',:'n',false,pg_catalog.now());
SQL
if "${PSQL[@]}" -v o="$OWNER6" -v m="$M" -v n="$N" >"$TMP_DIR/shared-lock-update.log" 2>&1 <<'SQL'
\set VERBOSITY verbose
begin;
select pg_catalog.pg_advisory_xact_lock_shared(
  pg_catalog.hashtextextended('mtp_l1_dependency_graph:' || :'o'::uuid::text, 0)
);
update public.mtp_task_dependencies
   set is_active=true,source_deleted_at=null
 where owner_id=:'o' and task_id=:'m' and depends_on_task_id=:'n';
commit;
SQL
then
  echo "direct dependency update with only a shared owner lock unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'dependency_lock_required' "$TMP_DIR/shared-lock-update.log"
grep -q 'L1D02' "$TMP_DIR/shared-lock-update.log"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER6' and task_id='$M' and depends_on_task_id='$N' and not is_active and ordinal=0")" == "1" ]]

# A caller-controlled marker plus a session-scoped exclusive advisory lock is
# also insufficient. The trigger has no writable marker or lock-lifetime
# heuristic: every direct inactive-to-active UPDATE fails closed.
OWNER7=90000000-0000-4000-8000-000000000009
O=91000000-0000-4000-8000-000000000001
P=91000000-0000-4000-8000-000000000002
"${PSQL[@]}" -v o="$OWNER7" -v p="$P" -v q="$O" <<'SQL'
insert into auth.users(id) values (:'o') on conflict do nothing;
insert into public.mtp_tasks(owner_id,id,task_kind,source_key,source_id_legacy,title,record_origin,content_hash)
values
  (:'o',:'p','personal','session-lock-p','session-lock-p','P','direct',decode(repeat('0f',32),'hex')),
  (:'o',:'q','personal','session-lock-q','session-lock-q','Q','direct',decode(repeat('10',32),'hex'));
insert into public.mtp_task_dependencies(
  owner_id,task_id,depends_on_task_id,is_active,source_deleted_at,
  version,created_at,updated_at
) values (
  :'o',:'p',:'q',false,pg_catalog.now(),7,
  '2026-01-02T03:04:05Z'::timestamptz,'2026-02-03T04:05:06Z'::timestamptz
);
SQL
if "${PSQL[@]}" -v o="$OWNER7" -v p="$P" -v q="$O" >"$TMP_DIR/session-lock-update.log" 2>&1 <<'SQL'
\set VERBOSITY verbose
begin;
select pg_catalog.pg_advisory_lock(
  pg_catalog.hashtextextended('mtp_l1_dependency_graph:' || :'o'::uuid::text, 0)
);
select pg_catalog.set_config('mtp.dependency_graph_xact_owners',:'o',true);
update public.mtp_task_dependencies
   set is_active=true,source_deleted_at=null
 where owner_id=:'o' and task_id=:'p' and depends_on_task_id=:'q';
select pg_catalog.pg_advisory_unlock(
  pg_catalog.hashtextextended('mtp_l1_dependency_graph:' || :'o'::uuid::text, 0)
);
commit;
SQL
then
  echo "direct dependency update with only a session owner lock unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'dependency_lock_required' "$TMP_DIR/session-lock-update.log"
grep -q 'L1D02' "$TMP_DIR/session-lock-update.log"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER7' and task_id='$P' and depends_on_task_id='$O' and not is_active and ordinal=0 and version=7 and created_at='2026-01-02T03:04:05Z'::timestamptz")" == "1" ]]

"${PSQL[@]}" -v o="$OWNER7" -v p="$P" -v q="$O" <<'SQL'
begin;
select pg_catalog.set_config('request.jwt.claim.sub',:'o',true);
set local role authenticated;
select public.mtp_task_children_replace_v1(
  :'p',1,
  pg_catalog.jsonb_build_object(
    'subtasks','[]'::jsonb,
    'dependencies',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('task_id',:'q','ordinal',1)
    )
  ),
  'f8000000-0000-4000-8000-000000000005'
);
commit;
SQL
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER7' and task_id='$P' and depends_on_task_id='$O' and is_active and ordinal=1 and version=8 and created_at='2026-01-02T03:04:05Z'::timestamptz and updated_at>'2026-02-03T04:05:06Z'::timestamptz")" == "1" ]]

expect_render_failure l1b 'select 1;' L1R01 l1_runner_ledger_collision
expect_source_rerun_failure "$L1B" 42701 display_ordinal

expect_render_failure storage "update supabase_migrations.schema_migrations set statements=array['mismatched fixture source'] where version='20260825011716'" L1R02 l1_runner_prerequisite_mismatch
expect_atomic_failure storage --fail-before-commit L1R93 l1_runner_injected_before_commit
assert_absent "select count(*) from storage.buckets where id='mtp-private'" "mtp-private bucket"
assert_absent "select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname like 'mtp_private_%'" "mtp-private policies"

storage_ledger_before="$(ledger_fingerprint)"
bash "$RUNNER" --fixture storage
[[ "$storage_ledger_before" == "$(ledger_fingerprint)" ]]
echo "L1_RUNNER_STORAGE_NO_LEDGER:PASS"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/l1b_planner_parity.test.sql"
expect_render_failure storage 'select 1;' L1R04 l1_runner_storage_preexisting
expect_source_rerun_failure "$STORAGE" 42710 mtp_private_owner_select

[[ "$("${PSQL[@]}" -Atqc "select count(*) from storage.buckets where id='mtp-private' and public=false and file_size_limit=5242880")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname like 'mtp_private_%'")" == "4" ]]

echo "L1B promotion artifact transactional/fail-closed proof: PASS"
