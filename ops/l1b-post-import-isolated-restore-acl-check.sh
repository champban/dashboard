#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

validate_pins() {
  [[ "${EXPECTED_AICC_ACL_PARTS:-}" == '305' ]] || return 1
  [[ "${EXPECTED_AICC_ACL_FINGERPRINT:-}" == 'e2aeb59ccf1b7cf4fd3d32799d1e91c6' ]] || return 1
  [[ "${EXPECTED_L0B_ACL_PARTS:-}" == '115' ]] || return 1
  [[ "${EXPECTED_L0B_ACL_FINGERPRINT:-}" == 'a7b43c7a3182cc06b53f14f704f901f6' ]] || return 1
  [[ "${EXPECTED_LINE_ACL_PARTS:-}" == '77' ]] || return 1
  [[ "${EXPECTED_LINE_ACL_FINGERPRINT:-}" == '0b129a7637de9960d951052734eb1731' ]] || return 1
  [[ "${EXPECTED_POSTGRES_DEFAULT_ACL_PARTS:-}" == '17' ]] || return 1
  [[ "${EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT:-}" == '16bc8ea823eb83d037b1307f647fe1a3' ]] || return 1
}

if [[ "${1:-}" == '--selftest' ]]; then
  export EXPECTED_AICC_ACL_PARTS='305'
  export EXPECTED_AICC_ACL_FINGERPRINT='e2aeb59ccf1b7cf4fd3d32799d1e91c6'
  export EXPECTED_L0B_ACL_PARTS='115'
  export EXPECTED_L0B_ACL_FINGERPRINT='a7b43c7a3182cc06b53f14f704f901f6'
  export EXPECTED_LINE_ACL_PARTS='77'
  export EXPECTED_LINE_ACL_FINGERPRINT='0b129a7637de9960d951052734eb1731'
  export EXPECTED_POSTGRES_DEFAULT_ACL_PARTS='17'
  export EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT='16bc8ea823eb83d037b1307f647fe1a3'
  validate_pins

  selftest_dir="$(mktemp -d)"
  trap 'rm -rf -- "$selftest_dir"' EXIT
  printf 'AICC\t305\te2aeb59ccf1b7cf4fd3d32799d1e91c6\nL0B\t115\ta7b43c7a3182cc06b53f14f704f901f6\nLINE\t77\t0b129a7637de9960d951052734eb1731\n' > "$selftest_dir/acl.tsv"
  printf '17\t16bc8ea823eb83d037b1307f647fe1a3\n' > "$selftest_dir/default.tsv"
  grep -Fxq $'AICC\t'"$EXPECTED_AICC_ACL_PARTS"$'\t'"$EXPECTED_AICC_ACL_FINGERPRINT" "$selftest_dir/acl.tsv"
  grep -Fxq $'L0B\t'"$EXPECTED_L0B_ACL_PARTS"$'\t'"$EXPECTED_L0B_ACL_FINGERPRINT" "$selftest_dir/acl.tsv"
  grep -Fxq $'LINE\t'"$EXPECTED_LINE_ACL_PARTS"$'\t'"$EXPECTED_LINE_ACL_FINGERPRINT" "$selftest_dir/acl.tsv"
  grep -Fxq "$EXPECTED_POSTGRES_DEFAULT_ACL_PARTS"$'\t'"$EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT" "$selftest_dir/default.tsv"

  EXPECTED_LINE_ACL_PARTS='78'
  if validate_pins >/dev/null 2>&1; then
    echo 'ACL selftest accepted a tampered pin' >&2
    exit 1
  fi
  echo 'L1B B-2 ACL verifier selftest: PASS'
  exit 0
fi

if [[ $# -ne 0 ]]; then
  echo "usage: $0 [--selftest]" >&2
  exit 2
fi

: "${LOCAL_DB_PASSWORD:?LOCAL_DB_PASSWORD is required}"
: "${ISOLATED_DB_CONTAINER:?ISOLATED_DB_CONTAINER is required}"
: "${WORK_DIR:?WORK_DIR is required}"
validate_pins

case "$WORK_DIR" in
  "${RUNNER_TEMP:?RUNNER_TEMP is required}"/l1b-b2.*) ;;
  *) echo '::error::ACL verifier work directory is outside the reviewed runner boundary'; exit 1 ;;
esac

ACL_FINGERPRINTS="$WORK_DIR/acl-fingerprints.tsv"
DEFAULT_ACL_FINGERPRINT="$WORK_DIR/default-acl-fingerprint.tsv"

# Output is written only to runner-private files and compared by exact digest.
docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$ACL_FINGERPRINTS" <<'SQL'
with target_tables as (
  select c.oid,
         case
           when c.relname like 'mtp_line_%' then 'LINE'
           when c.relname like 'aicc_%' then 'AICC'
           else 'L0B'
         end as scope
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind in ('r','p','S')
    and (
      c.relname like 'mtp_line_%'
      or c.relname like 'aicc_%'
      or c.relname in (
        'mtp_import_batches','mtp_import_chunks','mtp_import_staging',
        'mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events',
        'mtp_event_windows','mtp_task_attachments'
      )
    )
), target_functions as (
  select p.oid,
         case
           when p.proname like 'aicc_%' then 'AICC'
           when p.proname like 'mtp_line_%'
             or p.proname in (
               'mtp_claim_line_link','mtp_claim_line_event',
               'mtp_finish_line_event','mtp_cleanup_line_events'
             ) then 'LINE'
           else 'L0B'
         end as scope
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (
      p.proname like 'aicc_%'
      or p.proname like 'mtp_line_%'
      or p.proname in (
        'mtp_claim_line_link','mtp_claim_line_event',
        'mtp_finish_line_event','mtp_cleanup_line_events',
        'mtp_import_claim','mtp_import_heartbeat','mtp_import_stage',
        'mtp_import_finalize','mtp_import_abort','mtp_import_purge_staging',
        'mtp_reject_detail_ok','mtp_nfc','mtp_netstring','mtp_canon_source_id'
      )
    )
), parts as (
  select t.scope,
         'RELMETA|'||n.nspname||'|'||c.relname||'|'||c.relkind::text||'|'||
         pg_catalog.pg_get_userbyid(c.relowner)||'|'||c.relrowsecurity::text||'|'||
         c.relforcerowsecurity::text as part
  from target_tables t
  join pg_catalog.pg_class c on c.oid=t.oid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  union all
  select t.scope,
         'RELACL|'||n.nspname||'|'||c.relname||'|'||
         pg_catalog.pg_get_userbyid(x.grantor)||'|'||
         pg_catalog.pg_get_userbyid(x.grantee)||'|'||x.privilege_type||'|'||
         x.is_grantable::text
  from target_tables t
  join pg_catalog.pg_class c on c.oid=t.oid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl,pg_catalog.acldefault(
      case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner
    ))
  ) x
  union all
  select t.scope,
         'COLACL|'||n.nspname||'|'||c.relname||'|'||a.attname||'|'||
         pg_catalog.pg_get_userbyid(x.grantor)||'|'||
         pg_catalog.pg_get_userbyid(x.grantee)||'|'||x.privilege_type||'|'||
         x.is_grantable::text
  from target_tables t
  join pg_catalog.pg_class c on c.oid=t.oid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid
    and a.attnum>0 and not a.attisdropped and a.attacl is not null
  cross join lateral pg_catalog.aclexplode(a.attacl) x
  union all
  select f.scope,
         'FUNMETA|'||n.nspname||'|'||p.proname||'|'||
         pg_catalog.pg_get_function_identity_arguments(p.oid)||'|'||
         pg_catalog.pg_get_userbyid(p.proowner)||'|'||p.prosecdef::text||'|'||
         p.provolatile::text||'|'||coalesce(array_to_string(p.proconfig,','),'')
  from target_functions f
  join pg_catalog.pg_proc p on p.oid=f.oid
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  union all
  select f.scope,
         'FUNACL|'||n.nspname||'|'||p.proname||'|'||
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
select scope,count(*),md5(string_agg(part,E'\n' order by part))
from parts group by scope order by scope;
SQL
chmod 600 "$ACL_FINGERPRINTS"

grep -Fxq $'AICC\t'"$EXPECTED_AICC_ACL_PARTS"$'\t'"$EXPECTED_AICC_ACL_FINGERPRINT" "$ACL_FINGERPRINTS"
grep -Fxq $'L0B\t'"$EXPECTED_L0B_ACL_PARTS"$'\t'"$EXPECTED_L0B_ACL_FINGERPRINT" "$ACL_FINGERPRINTS"
grep -Fxq $'LINE\t'"$EXPECTED_LINE_ACL_PARTS"$'\t'"$EXPECTED_LINE_ACL_FINGERPRINT" "$ACL_FINGERPRINTS"

docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U supabase_admin -d postgres -XAtq -F $'\t' \
  --set=ON_ERROR_STOP=1 >"$DEFAULT_ACL_FINGERPRINT" <<'SQL'
with parts as (
  select 'ROW|'||coalesce(n.nspname,'<global>')||'|'||d.defaclobjtype::text as part
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
  where d.defaclrole='postgres'::regrole
    and (d.defaclnamespace=0 or n.nspname='public')
  union all
  select 'ACL|'||coalesce(n.nspname,'<global>')||'|'||d.defaclobjtype::text||'|'||
         pg_catalog.pg_get_userbyid(x.grantor)||'|'||
         pg_catalog.pg_get_userbyid(x.grantee)||'|'||x.privilege_type||'|'||
         x.is_grantable::text
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral pg_catalog.aclexplode(d.defaclacl) x
  where d.defaclrole='postgres'::regrole
    and (d.defaclnamespace=0 or n.nspname='public')
)
select count(*),md5(coalesce(string_agg(part,E'\n' order by part),'')) from parts;
SQL
chmod 600 "$DEFAULT_ACL_FINGERPRINT"

grep -Fxq "$EXPECTED_POSTGRES_DEFAULT_ACL_PARTS"$'\t'"$EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT" "$DEFAULT_ACL_FINGERPRINT"

echo 'L1B_B2_BASE_ACL_VERIFICATION_COMPLETE'
