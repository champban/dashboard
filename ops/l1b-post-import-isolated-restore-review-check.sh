#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BASE_ACL_CHECKER_BLOB='457d4ffa2543557e2c2e9488a0518a1f1881ea48'
AICC_CHECKER_BLOB='33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2'

validate_review_pins() {
  [[ "${EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS:-}" == '60' ]] || return 1
  [[ "${EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT:-}" == '96034c21cbd679dccb46eb2b8b2bf328' ]] || return 1
  [[ "${EXPECTED_AICC_EFFECTIVE_PARTS:-}" == '1455' ]] || return 1
  [[ "${EXPECTED_AICC_EFFECTIVE_FINGERPRINT:-}" == '19e50eb28495f638d0ffde9b47b11f38' ]] || return 1
  [[ "${EXPECTED_L0B_EFFECTIVE_PARTS:-}" == '1917' ]] || return 1
  [[ "${EXPECTED_L0B_EFFECTIVE_FINGERPRINT:-}" == '49a6233ebecc46bc50261de316257f5b' ]] || return 1
  [[ "${EXPECTED_LINE_EFFECTIVE_PARTS:-}" == '588' ]] || return 1
  [[ "${EXPECTED_LINE_EFFECTIVE_FINGERPRINT:-}" == '20ff81c4f39a3f9355b8faa628a60e89' ]] || return 1
  [[ "${EXPECTED_RUNTIME_EFFECTIVE_PARTS:-}" == '15' ]] || return 1
  [[ "${EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT:-}" == 'a4c8b4e52e6c0ead388f34e35d5db958' ]] || return 1
  [[ "${EXPECTED_RUNTIME_ROLE_GRAPH_PARTS:-}" == '3' ]] || return 1
  [[ "${EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT:-}" == '9089adf4b82402903109f41ebc1aa10e' ]] || return 1
  [[ "${EXPECTED_AUTH_FK_PARTS:-}" == '10' ]] || return 1
  [[ "${EXPECTED_AUTH_FK_FINGERPRINT:-}" == 'fb000e29b0a4c3aacd97a6e3a8f96766' ]] || return 1
  [[ "${EXPECTED_PUBLIC_APP_FK_PARTS:-}" == '57' ]] || return 1
  [[ "${EXPECTED_PUBLIC_APP_FK_FINGERPRINT:-}" == '08f4cf522b2bc18b50e3edc984946947' ]] || return 1
  [[ "${EXPECTED_AICC_ROW_COUNT_PARTS:-}" == '8' ]] || return 1
  [[ "${EXPECTED_AICC_ROW_COUNT_FINGERPRINT:-}" == 'b6c67dcf199bba386c2d67c5b0d62624' ]] || return 1
}

if [[ "${1:-}" == '--selftest' ]]; then
  export EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS='60'
  export EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT='96034c21cbd679dccb46eb2b8b2bf328'
  export EXPECTED_AICC_EFFECTIVE_PARTS='1455'
  export EXPECTED_AICC_EFFECTIVE_FINGERPRINT='19e50eb28495f638d0ffde9b47b11f38'
  export EXPECTED_L0B_EFFECTIVE_PARTS='1917'
  export EXPECTED_L0B_EFFECTIVE_FINGERPRINT='49a6233ebecc46bc50261de316257f5b'
  export EXPECTED_LINE_EFFECTIVE_PARTS='588'
  export EXPECTED_LINE_EFFECTIVE_FINGERPRINT='20ff81c4f39a3f9355b8faa628a60e89'
  export EXPECTED_RUNTIME_EFFECTIVE_PARTS='15'
  export EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT='a4c8b4e52e6c0ead388f34e35d5db958'
  export EXPECTED_RUNTIME_ROLE_GRAPH_PARTS='3'
  export EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT='9089adf4b82402903109f41ebc1aa10e'
  export EXPECTED_AUTH_FK_PARTS='10'
  export EXPECTED_AUTH_FK_FINGERPRINT='fb000e29b0a4c3aacd97a6e3a8f96766'
  export EXPECTED_PUBLIC_APP_FK_PARTS='57'
  export EXPECTED_PUBLIC_APP_FK_FINGERPRINT='08f4cf522b2bc18b50e3edc984946947'
  export EXPECTED_AICC_ROW_COUNT_PARTS='8'
  export EXPECTED_AICC_ROW_COUNT_FINGERPRINT='b6c67dcf199bba386c2d67c5b0d62624'
  validate_review_pins

  selftest_dir="$(mktemp -d)"
  trap 'rm -rf -- "$selftest_dir"' EXIT
  cat > "$selftest_dir/effective.tsv" <<'EOF'
AICC	1455	19e50eb28495f638d0ffde9b47b11f38
L0B	1917	49a6233ebecc46bc50261de316257f5b
LINE	588	20ff81c4f39a3f9355b8faa628a60e89
RUNTIME	15	a4c8b4e52e6c0ead388f34e35d5db958
EOF
  printf 'ROLE_GRAPH\t3\t9089adf4b82402903109f41ebc1aa10e\n' > "$selftest_dir/role-graph.tsv"
  printf '10\tfb000e29b0a4c3aacd97a6e3a8f96766\n' > "$selftest_dir/auth-fk.tsv"
  printf '57\t08f4cf522b2bc18b50e3edc984946947\n' > "$selftest_dir/fk.tsv"
  printf '60\t96034c21cbd679dccb46eb2b8b2bf328\n' > "$selftest_dir/functions.tsv"
  printf '8\tb6c67dcf199bba386c2d67c5b0d62624\n' > "$selftest_dir/aicc.tsv"
  printf '0\n' > "$selftest_dir/storage.tsv"

  grep -Fxq $'AICC\t1455\t19e50eb28495f638d0ffde9b47b11f38' "$selftest_dir/effective.tsv"
  grep -Fxq $'L0B\t1917\t49a6233ebecc46bc50261de316257f5b' "$selftest_dir/effective.tsv"
  grep -Fxq $'LINE\t588\t20ff81c4f39a3f9355b8faa628a60e89' "$selftest_dir/effective.tsv"
  grep -Fxq $'RUNTIME\t15\ta4c8b4e52e6c0ead388f34e35d5db958' "$selftest_dir/effective.tsv"
  grep -Fxq $'ROLE_GRAPH\t3\t9089adf4b82402903109f41ebc1aa10e' "$selftest_dir/role-graph.tsv"
  grep -Fxq $'10\tfb000e29b0a4c3aacd97a6e3a8f96766' "$selftest_dir/auth-fk.tsv"
  grep -Fxq $'57\t08f4cf522b2bc18b50e3edc984946947' "$selftest_dir/fk.tsv"
  grep -Fxq $'60\t96034c21cbd679dccb46eb2b8b2bf328' "$selftest_dir/functions.tsv"
  grep -Fxq $'8\tb6c67dcf199bba386c2d67c5b0d62624' "$selftest_dir/aicc.tsv"
  grep -Fxq '0' "$selftest_dir/storage.tsv"

  EXPECTED_RUNTIME_ROLE_GRAPH_PARTS='4'
  if validate_review_pins >/dev/null 2>&1; then
    echo 'Review checker accepted a tampered runtime role-graph pin' >&2
    exit 1
  fi
  export EXPECTED_RUNTIME_ROLE_GRAPH_PARTS='3'
  EXPECTED_AICC_ROW_COUNT_FINGERPRINT='00000000000000000000000000000000'
  if validate_review_pins >/dev/null 2>&1; then
    echo 'Review checker accepted a tampered AICC row-count pin' >&2
    exit 1
  fi
  export EXPECTED_AICC_ROW_COUNT_FINGERPRINT='b6c67dcf199bba386c2d67c5b0d62624'
  EXPECTED_AUTH_FK_FINGERPRINT='00000000000000000000000000000000'
  if validate_review_pins >/dev/null 2>&1; then
    echo 'Review checker accepted a tampered Auth foreign-key pin' >&2
    exit 1
  fi
  export EXPECTED_AUTH_FK_FINGERPRINT='fb000e29b0a4c3aacd97a6e3a8f96766'
  EXPECTED_PUBLIC_APP_FK_FINGERPRINT='00000000000000000000000000000000'
  if validate_review_pins >/dev/null 2>&1; then
    echo 'Review checker accepted a tampered foreign-key pin' >&2
    exit 1
  fi
  printf '1\n' > "$selftest_dir/storage.tsv"
  if grep -Fxq '0' "$selftest_dir/storage.tsv"; then
    echo 'Review checker accepted an mtp-private object row' >&2
    exit 1
  fi
  echo 'L1B B-2 independent-review remediation selftest: PASS'
  exit 0
fi

if [[ $# -ne 0 ]]; then
  echo "usage: $0 [--selftest]" >&2
  exit 2
fi

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${LOCAL_DB_PASSWORD:?LOCAL_DB_PASSWORD is required}"
: "${ISOLATED_DB_CONTAINER:?ISOLATED_DB_CONTAINER is required}"
: "${WORK_DIR:?WORK_DIR is required}"
validate_review_pins

case "$WORK_DIR" in
  "$RUNNER_TEMP"/l1b-b2.*) ;;
  *) echo '::error::Review checker work directory is outside the reviewed runner boundary'; exit 1 ;;
esac

BASE_ACL_CHECKER="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-acl-check.sh"
AICC_CHECKER="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-aicc-check.py"
for file in "$BASE_ACL_CHECKER" "$AICC_CHECKER"; do
  if [[ ! -f "$file" || -L "$file" ]]; then
    echo '::error::A pinned B-2 review input is absent or unsafe'
    exit 1
  fi
done
[[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$BASE_ACL_CHECKER")" == "$BASE_ACL_CHECKER_BLOB" ]]
[[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$AICC_CHECKER")" == "$AICC_CHECKER_BLOB" ]]

# Preserve the existing raw relation/column/function/default-ACL proof first.
bash "$BASE_ACL_CHECKER"

FUNCTION_FINGERPRINT="$WORK_DIR/l0b-all-function-acl.tsv"
PRIVATE_OBJECT_COUNT="$WORK_DIR/mtp-private-object-count.tsv"
EFFECTIVE_FINGERPRINTS="$WORK_DIR/effective-privilege-fingerprints.tsv"
ROLE_GRAPH_FINGERPRINT="$WORK_DIR/runtime-role-graph-fingerprint.tsv"
FK_FINGERPRINT="$WORK_DIR/public-app-fk-fingerprint.tsv"
AUTH_FK_FINGERPRINT="$WORK_DIR/auth-fk-fingerprint.tsv"
AICC_EXPECTED_COUNTS="$WORK_DIR/aicc-expected-counts.tsv"
AICC_ACTUAL_COUNTS="$WORK_DIR/aicc-actual-counts.tsv"
AICC_CHECK_LOG="$WORK_DIR/aicc-count-check.log"

docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$FUNCTION_FINGERPRINT" <<'SQL'
with target_functions as (
  select p.oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'mtp_%'
    and p.proname not like 'mtp_line_%'
    and p.proname not in (
      'mtp_claim_line_link','mtp_claim_line_event',
      'mtp_finish_line_event','mtp_cleanup_line_events'
    )
), parts as (
  select 'FUNMETA|'||n.nspname||'|'||p.proname||'|'||
         pg_catalog.pg_get_function_identity_arguments(p.oid)||'|'||
         pg_catalog.pg_get_userbyid(p.proowner)||'|'||p.prosecdef::text||'|'||
         p.provolatile::text||'|'||coalesce(array_to_string(p.proconfig,','),'') as part
  from target_functions f
  join pg_catalog.pg_proc p on p.oid=f.oid
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  union all
  select 'FUNACL|'||n.nspname||'|'||p.proname||'|'||
         pg_catalog.pg_get_function_identity_arguments(p.oid)||'|'||
         pg_catalog.pg_get_userbyid(x.grantor)||'|'||
         pg_catalog.pg_get_userbyid(x.grantee)||'|'||x.privilege_type||'|'||
         x.is_grantable::text
  from target_functions f
  join pg_catalog.pg_proc p on p.oid=f.oid
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))
  ) x
)
select count(*),md5(string_agg(part,E'\n' order by part)) from parts;
SQL
chmod 600 "$FUNCTION_FINGERPRINT"
grep -Fxq "$EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS"$'\t'"$EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT" "$FUNCTION_FINGERPRINT"

# Evaluate direct effective privileges and the direct membership option surface.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$EFFECTIVE_FINGERPRINTS" <<'SQL'
with runtime_roles(role_name) as (
  values ('anon'::text),('authenticated'::text),('service_role'::text)
), target_relations as (
  select c.oid,c.relkind,n.nspname,c.relname,
         case when c.relname like 'mtp_line_%' then 'LINE'
              when c.relname like 'aicc_%' then 'AICC'
              else 'L0B' end as scope
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind in ('r','p','S')
    and (c.relname like 'mtp_line_%' or c.relname like 'aicc_%' or c.relname in (
      'mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects',
      'mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'
    ))
), target_functions as (
  select p.oid,n.nspname,p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
         case when p.proname like 'aicc_%' then 'AICC'
              when p.proname like 'mtp_line_%' or p.proname in (
                'mtp_claim_line_link','mtp_claim_line_event',
                'mtp_finish_line_event','mtp_cleanup_line_events'
              ) then 'LINE' else 'L0B' end as scope
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (p.proname like 'aicc_%' or p.proname like 'mtp_%')
), parts as (
  select t.scope,
         'TABLE|'||r.role_name||'|'||t.nspname||'|'||t.relname||'|'||p.privilege||'|'||
         pg_catalog.has_table_privilege(r.role_name,t.oid,p.privilege)::text as part
  from target_relations t cross join runtime_roles r
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
  where t.relkind in ('r','p')
  union all
  select t.scope,
         'SEQUENCE|'||r.role_name||'|'||t.nspname||'|'||t.relname||'|'||p.privilege||'|'||
         pg_catalog.has_sequence_privilege(r.role_name,t.oid,p.privilege)::text
  from target_relations t cross join runtime_roles r
  cross join (values ('USAGE'),('SELECT'),('UPDATE')) p(privilege)
  where t.relkind='S'
  union all
  select t.scope,
         'COLUMN|'||r.role_name||'|'||t.nspname||'|'||t.relname||'|'||a.attname||'|'||p.privilege||'|'||
         pg_catalog.has_column_privilege(r.role_name,t.oid,a.attnum,p.privilege)::text
  from target_relations t
  join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
  cross join runtime_roles r
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
  where t.relkind in ('r','p')
  union all
  select f.scope,
         'FUNCTION|'||r.role_name||'|'||f.nspname||'|'||f.proname||'|'||f.args||'|EXECUTE|'||
         pg_catalog.has_function_privilege(r.role_name,f.oid,'EXECUTE')::text
  from target_functions f cross join runtime_roles r
), runtime_parts as (
  select 'ROLE|'||r.rolname||'|'||r.rolsuper::text||'|'||r.rolinherit::text||'|'||
         r.rolcreaterole::text||'|'||r.rolcreatedb::text||'|'||r.rolcanlogin::text||'|'||
         r.rolreplication::text||'|'||r.rolbypassrls::text as part
  from pg_catalog.pg_roles r where r.rolname in (select role_name from runtime_roles)
  union all
  select 'MEMBERSHIP|'||pg_catalog.pg_get_userbyid(m.roleid)||'|'||
         pg_catalog.pg_get_userbyid(m.member)||'|'||pg_catalog.pg_get_userbyid(m.grantor)||'|'||
         m.admin_option::text||'|'||m.inherit_option::text||'|'||m.set_option::text
  from pg_catalog.pg_auth_members m
  where pg_catalog.pg_get_userbyid(m.roleid) in (select role_name from runtime_roles)
     or pg_catalog.pg_get_userbyid(m.member) in (select role_name from runtime_roles)
  union all
  select 'SCHEMA|'||role_name||'|USAGE|'||pg_catalog.has_schema_privilege(role_name,'public','USAGE')::text
  from runtime_roles
  union all
  select 'SCHEMA|'||role_name||'|CREATE|'||pg_catalog.has_schema_privilege(role_name,'public','CREATE')::text
  from runtime_roles
), grouped as (
  select scope,count(*) as parts,md5(string_agg(part,E'\n' order by part)) as fingerprint
  from parts group by scope
  union all
  select 'RUNTIME',count(*),md5(string_agg(part,E'\n' order by part)) from runtime_parts
)
select scope,parts,fingerprint from grouped order by scope;
SQL
chmod 600 "$EFFECTIVE_FINGERPRINTS"
grep -Fxq $'AICC\t'"$EXPECTED_AICC_EFFECTIVE_PARTS"$'\t'"$EXPECTED_AICC_EFFECTIVE_FINGERPRINT" "$EFFECTIVE_FINGERPRINTS"
grep -Fxq $'L0B\t'"$EXPECTED_L0B_EFFECTIVE_PARTS"$'\t'"$EXPECTED_L0B_EFFECTIVE_FINGERPRINT" "$EFFECTIVE_FINGERPRINTS"
grep -Fxq $'LINE\t'"$EXPECTED_LINE_EFFECTIVE_PARTS"$'\t'"$EXPECTED_LINE_EFFECTIVE_FINGERPRINT" "$EFFECTIVE_FINGERPRINTS"
grep -Fxq $'RUNTIME\t'"$EXPECTED_RUNTIME_EFFECTIVE_PARTS"$'\t'"$EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT" "$EFFECTIVE_FINGERPRINTS"

# Fingerprint the complete transitive role graph reachable through SET ROLE or
# inheritance edges from each runtime role, including every PG17 membership option.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$ROLE_GRAPH_FINGERPRINT" <<'SQL'
with recursive roots as (
  select r.oid as root_oid,r.rolname as root_name
  from pg_catalog.pg_roles r
  where r.rolname in ('anon','authenticated','service_role')
), walk as (
  select root_oid,root_name,root_oid as role_oid,0 as depth,array[root_oid]::oid[] as path
  from roots
  union all
  select w.root_oid,w.root_name,m.roleid,w.depth+1,w.path||m.roleid
  from walk w
  join pg_catalog.pg_auth_members m on m.member=w.role_oid
  where not m.roleid=any(w.path)
), reachable as (
  select distinct on (root_name,role_oid) root_name,role_oid,depth
  from walk order by root_name,role_oid,depth
), edges as (
  select distinct w.root_name,w.depth+1 as depth,
         pg_catalog.pg_get_userbyid(m.member) as member_role,
         pg_catalog.pg_get_userbyid(m.roleid) as granted_role,
         pg_catalog.pg_get_userbyid(m.grantor) as grantor_role,
         m.admin_option,m.inherit_option,m.set_option
  from walk w
  join pg_catalog.pg_auth_members m on m.member=w.role_oid
  where not m.roleid=any(w.path)
), parts as (
  select 'ROLE|'||x.root_name||'|'||r.rolname||'|'||x.depth::text||'|'||
         r.rolsuper::text||'|'||r.rolinherit::text||'|'||r.rolcreaterole::text||'|'||
         r.rolcreatedb::text||'|'||r.rolcanlogin::text||'|'||r.rolreplication::text||'|'||
         r.rolbypassrls::text||'|'||
         pg_catalog.pg_has_role(x.root_name,r.oid,'MEMBER')::text||'|'||
         pg_catalog.pg_has_role(x.root_name,r.oid,'USAGE')::text||'|'||
         pg_catalog.pg_has_role(x.root_name,r.oid,'SET')::text as part
  from reachable x join pg_catalog.pg_roles r on r.oid=x.role_oid
  union all
  select 'EDGE|'||root_name||'|'||depth::text||'|'||member_role||'|'||granted_role||'|'||
         grantor_role||'|'||admin_option::text||'|'||inherit_option::text||'|'||set_option::text
  from edges
)
select 'ROLE_GRAPH',count(*),md5(string_agg(part,E'\n' order by part)) from parts;
SQL
chmod 600 "$ROLE_GRAPH_FINGERPRINT"
grep -Fxq $'ROLE_GRAPH\t'"$EXPECTED_RUNTIME_ROLE_GRAPH_PARTS"$'\t'"$EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT" "$ROLE_GRAPH_FINGERPRINT"

# Reconcile every frozen AICC COPY section against restored rows and Production.
: >"$AICC_CHECK_LOG"
chmod 600 "$AICC_CHECK_LOG"
if ! python3 "$AICC_CHECKER" extract "$WORK_DIR/extracted/data.sql" "$AICC_EXPECTED_COUNTS" >"$AICC_CHECK_LOG" 2>&1; then
  echo '::error::L1B_B2_AICC_COUNT_CHECK_FAILED stage=aicc-count'
  exit 1
fi
if ! python3 "$AICC_CHECKER" verify "$AICC_EXPECTED_COUNTS" >>"$AICC_CHECK_LOG" 2>&1; then
  echo '::error::L1B_B2_AICC_COUNT_CHECK_FAILED stage=aicc-count'
  exit 1
fi
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$AICC_ACTUAL_COUNTS" <<'SQL'
select 'aicc_agent_credentials',count(*)::bigint from public.aicc_agent_credentials
union all select 'aicc_agents',count(*)::bigint from public.aicc_agents
union all select 'aicc_events',count(*)::bigint from public.aicc_events
union all select 'aicc_messages',count(*)::bigint from public.aicc_messages
union all select 'aicc_project_members',count(*)::bigint from public.aicc_project_members
union all select 'aicc_projects',count(*)::bigint from public.aicc_projects
union all select 'aicc_sessions',count(*)::bigint from public.aicc_sessions
union all select 'aicc_tasks',count(*)::bigint from public.aicc_tasks
order by 1;
SQL
chmod 600 "$AICC_ACTUAL_COUNTS"
if ! python3 "$AICC_CHECKER" verify "$AICC_ACTUAL_COUNTS" >>"$AICC_CHECK_LOG" 2>&1; then
  echo '::error::L1B_B2_AICC_COUNT_CHECK_FAILED stage=aicc-count'
  exit 1
fi
if ! python3 "$AICC_CHECKER" compare "$AICC_EXPECTED_COUNTS" "$AICC_ACTUAL_COUNTS" >>"$AICC_CHECK_LOG" 2>&1; then
  echo '::error::L1B_B2_AICC_COUNT_CHECK_FAILED stage=aicc-count'
  exit 1
fi

# Freeze the complete durable Auth FK inventory before validating any rows.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$AUTH_FK_FINGERPRINT" <<'SQL'
with fks as (
  select con.oid,ns.nspname as child_schema,child.relname as child_table,
         con.conname,pns.nspname as parent_schema,parent.relname as parent_table,
         con.confmatchtype,con.condeferrable,con.condeferred,
         pg_catalog.pg_get_constraintdef(con.oid,true) as definition
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class child on child.oid=con.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=child.relnamespace
  join pg_catalog.pg_class parent on parent.oid=con.confrelid
  join pg_catalog.pg_namespace pns on pns.oid=parent.relnamespace
  where con.contype='f' and ns.nspname='auth' and child.relname in (
    'users','identities','sessions','refresh_tokens','mfa_factors',
    'mfa_challenges','mfa_amr_claims','one_time_tokens',
    'webauthn_credentials','webauthn_challenges'
  )
), parts as (
  select child_schema||'|'||child_table||'|'||conname||'|'||parent_schema||'|'||
         parent_table||'|'||confmatchtype::text||'|'||condeferrable::text||'|'||
         condeferred::text||'|'||definition as part
  from fks
)
select count(*),md5(string_agg(part,E'\n' order by part)) from parts;
SQL
chmod 600 "$AUTH_FK_FINGERPRINT"
grep -Fxq "$EXPECTED_AUTH_FK_PARTS"$'\t'"$EXPECTED_AUTH_FK_FINGERPRINT" "$AUTH_FK_FINGERPRINT"

# Freeze the complete public application FK inventory before validating rows.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$FK_FINGERPRINT" <<'SQL'
with fks as (
  select con.oid,ns.nspname as child_schema,child.relname as child_table,
         con.conname,pns.nspname as parent_schema,parent.relname as parent_table,
         con.confmatchtype,con.condeferrable,con.condeferred,
         pg_catalog.pg_get_constraintdef(con.oid,true) as definition
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class child on child.oid=con.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=child.relnamespace
  join pg_catalog.pg_class parent on parent.oid=con.confrelid
  join pg_catalog.pg_namespace pns on pns.oid=parent.relnamespace
  where con.contype='f' and ns.nspname='public'
    and (child.relname like 'mtp_%' or child.relname like 'aicc_%')
), parts as (
  select child_schema||'|'||child_table||'|'||conname||'|'||parent_schema||'|'||
         parent_table||'|'||confmatchtype::text||'|'||condeferrable::text||'|'||
         condeferred::text||'|'||definition as part
  from fks
)
select count(*),md5(string_agg(part,E'\n' order by part)) from parts;
SQL
chmod 600 "$FK_FINGERPRINT"
grep -Fxq "$EXPECTED_PUBLIC_APP_FK_PARTS"$'\t'"$EXPECTED_PUBLIC_APP_FK_FINGERPRINT" "$FK_FINGERPRINT"

# session_replication_role=replica bypasses FK enforcement during restore. Also
# check every FK whose child belongs to the frozen durable Auth recovery inventory.
# every current public mtp_*/aicc_* FK without printing any row value.
docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -Xq \
  --single-transaction --set=ON_ERROR_STOP=1 <<'SQL'
do $l1b_b2_fk_check$
declare
  fk record;
  child_all_null text;
  child_all_nonnull text;
  join_predicate text;
  violation_predicate text;
  violation_count bigint;
begin
  for fk in
    select con.oid,con.conname,con.conkey,con.confkey,con.confmatchtype,
           con.convalidated,con.conrelid,con.confrelid,
           child_ns.nspname as child_schema,child.relname as child_table,
           parent_ns.nspname as parent_schema,parent.relname as parent_table
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class child on child.oid=con.conrelid
    join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
    join pg_catalog.pg_class parent on parent.oid=con.confrelid
    join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
    where con.contype='f' and (
      (child_ns.nspname='public'
        and (child.relname like 'mtp_%' or child.relname like 'aicc_%'))
      or (child_ns.nspname='auth' and child.relname in (
        'users','identities','sessions','refresh_tokens','mfa_factors',
        'mfa_challenges','mfa_amr_claims','one_time_tokens',
        'webauthn_credentials','webauthn_challenges'
      ))
    )
    order by child_ns.nspname,child.relname,con.conname
  loop
    if not fk.convalidated then
      raise exception 'unvalidated foreign key %.%.%',
        fk.child_schema,fk.child_table,fk.conname;
    end if;
    if fk.confmatchtype='p' then
      raise exception 'unsupported MATCH PARTIAL foreign key %.%.%',
        fk.child_schema,fk.child_table,fk.conname;
    end if;

    select string_agg(format('c.%I IS NULL',child_attr.attname),' AND ' order by key_pos.i),
           string_agg(format('c.%I IS NOT NULL',child_attr.attname),' AND ' order by key_pos.i),
           string_agg(format('c.%I = p.%I',child_attr.attname,parent_attr.attname),' AND ' order by key_pos.i)
      into child_all_null,child_all_nonnull,join_predicate
    from generate_subscripts(fk.conkey,1) key_pos(i)
    join pg_catalog.pg_attribute child_attr
      on child_attr.attrelid=fk.conrelid and child_attr.attnum=fk.conkey[key_pos.i]
    join pg_catalog.pg_attribute parent_attr
      on parent_attr.attrelid=fk.confrelid and parent_attr.attnum=fk.confkey[key_pos.i];

    if child_all_null is null or child_all_nonnull is null or join_predicate is null then
      raise exception 'unable to materialize foreign key %.%.%',
        fk.child_schema,fk.child_table,fk.conname;
    end if;

    if fk.confmatchtype='f' then
      violation_predicate := format(
        '(not ((%s) or (%s))) or ((%s) and not exists (select 1 from %I.%I p where %s))',
        child_all_null,child_all_nonnull,child_all_nonnull,
        fk.parent_schema,fk.parent_table,join_predicate
      );
    else
      violation_predicate := format(
        '(%s) and not exists (select 1 from %I.%I p where %s)',
        child_all_nonnull,fk.parent_schema,fk.parent_table,join_predicate
      );
    end if;

    execute format(
      'select count(*) from %I.%I c where %s',
      fk.child_schema,fk.child_table,violation_predicate
    ) into violation_count;
    if violation_count<>0 then
      raise exception 'foreign key violation %.%.% count=%',
        fk.child_schema,fk.child_table,fk.conname,violation_count;
    end if;
  end loop;
end;
$l1b_b2_fk_check$;
SQL

# Reject orphaned private-object metadata even if the bucket and policy rows are absent.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq \
  --set=ON_ERROR_STOP=1 \
  --command "select count(*) from storage.objects where bucket_id='mtp-private'" \
  >"$PRIVATE_OBJECT_COUNT"
chmod 600 "$PRIVATE_OBJECT_COUNT"
grep -Fxq '0' "$PRIVATE_OBJECT_COUNT"

echo 'L1B_B2_REVIEW_VERIFICATION_COMPLETE'
