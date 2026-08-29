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

[[ "$(sha256sum "$L1A" | awk '{print $1}')" == "d9a8764f801935b37eea3d8077fcfa83ce5b8646475e465c8cd4677e6d289cbf" ]]
[[ "$(sha256sum "$L1B" | awk '{print $1}')" == "9980557bd01830a36da3da35a7de6f3e418a4b0fb82db1431e6d736f74ee88d4" ]]
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

"${PSQL[@]}" -v o="$OWNER1" -v a="$A" -v b="$B" >"$TMP_DIR/session1.log" 2>&1 <<'SQL' &
begin;
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id) values (:'o',:'a',:'b');
select pg_catalog.pg_sleep(3);
commit;
SQL
s1=$!

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks where locktype='advisory' and granted and objid = (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER1',0) & 4294967295)::oid")" == "1" ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_locks where locktype='advisory' and granted and objid = (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER1',0) & 4294967295)::oid")" == "1" ]]

set +e
"${PSQL[@]}" -v o="$OWNER1" -v c="$C" -v a="$A" >"$TMP_DIR/session2.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id) values (:'o',:'c',:'a');
SQL
s2=$!
set -e

for _ in {1..100}; do
  [[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where wait_event_type='Lock' and wait_event='advisory'")" -ge 1 ]] && break
  sleep 0.05
done
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_catalog.pg_stat_activity where wait_event_type='Lock' and wait_event='advisory'")" -ge 1 ]]

# A different owner derives a different key and completes while OWNER1 is held.
[[ "$("${PSQL[@]}" -Atqc "select (pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER1',0) <> pg_catalog.hashtextextended('mtp_l1_dependency_graph:$OWNER2',0))::int")" == "1" ]]
"${PSQL[@]}" -v o="$OWNER2" -v d="$D" -v e="$E" <<'SQL'
set lock_timeout = '500ms';
insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id) values (:'o',:'d',:'e');
SQL

wait "$s1"
if wait "$s2"; then echo "same-owner cycle unexpectedly committed" >&2; exit 1; fi
grep -q 'dependency_cycle' "$TMP_DIR/session2.log"
grep -q 'L1D01' "$TMP_DIR/session2.log"
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.mtp_task_dependencies where owner_id='$OWNER1' and is_active and (task_id,depends_on_task_id) in (('$A','$B'),('$C','$A'))")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "with recursive reach(start_id,task_id,path,cycle) as (select task_id,depends_on_task_id,array[task_id,depends_on_task_id],task_id=depends_on_task_id from public.mtp_task_dependencies where owner_id='$OWNER1' and is_active union all select r.start_id,d.depends_on_task_id,r.path||d.depends_on_task_id,d.depends_on_task_id=any(r.path) from reach r join public.mtp_task_dependencies d on d.owner_id='$OWNER1' and d.task_id=r.task_id and d.is_active where not r.cycle) select count(*) from reach where cycle")" == "0" ]]

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
