#!/usr/bin/env python3
"""Inject final count, role-independent catalog, stages, and review reconciliation."""
from __future__ import annotations
import pathlib, sys
COUNT_CHECKER_BLOB='39acfa0b950c5ec9365f46623d416d4cbc882e52'
def replace_once(payload,old,new,label):
    count=payload.count(old)
    if count!=1: raise SystemExit(f"Review-check injection anchor {label!r} count is {count}, expected 1")
    return payload.replace(old,new,1)
def main():
    if len(sys.argv)!=3: print(f'usage: {sys.argv[0]} INPUT_CORE OUTPUT_CORE',file=sys.stderr); return 2
    source=pathlib.Path(sys.argv[1]); output=pathlib.Path(sys.argv[2])
    if source.is_symlink() or not source.is_file(): raise SystemExit('input core is absent or unsafe')
    if output.exists() or output.is_symlink(): raise SystemExit('output core path already exists or is unsafe')
    payload=source.read_text(encoding='utf-8',errors='strict')
    old_cleanup=r'''STACK_STARTED=0
ISOLATED_STARTED=0

cleanup() {
  rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || true
  unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  if [[ "$ISOLATED_STARTED" == '1' ]]; then
    docker rm -f -- "$ISOLATED_DB_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ "$STACK_STARTED" == '1' && -d "$LOCAL_PROJECT" ]]; then
    (cd "$LOCAL_PROJECT" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  case "${WORK_DIR:-}" in
    "$RUNNER_TEMP"/l1b-b2.*) rm -rf -- "$WORK_DIR" ;;
    *) ;;
  esac
}
trap cleanup EXIT
'''
    new_cleanup=r'''STACK_STARTED=0
ISOLATED_STARTED=0
CLEANUP_DONE=0
declare -a project_containers=()
declare -a bootstrap_volume_names=()

cleanup_resources() {
  local cleanup_rc=0 name
  if [[ "$CLEANUP_DONE" == '1' ]]; then return 0; fi
  CLEANUP_DONE=1

  case "${BACKUP_PASSPHRASE_FILE:-}" in
    "$RUNNER_TEMP"/l1b-b2-passphrase)
      rm -f -- "$BACKUP_PASSPHRASE_FILE" >/dev/null 2>&1 || cleanup_rc=1
      [[ ! -e "$BACKUP_PASSPHRASE_FILE" && ! -L "$BACKUP_PASSPHRASE_FILE" ]] || cleanup_rc=1
      ;;
    *) cleanup_rc=1 ;;
  esac
  unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

  if ! docker info >/dev/null 2>&1; then cleanup_rc=1; fi
  if docker inspect "$ISOLATED_DB_CONTAINER" >/dev/null 2>&1; then
    docker rm -f -- "$ISOLATED_DB_CONTAINER" >/dev/null 2>&1 || cleanup_rc=1
  fi
  if docker inspect "$ISOLATED_DB_CONTAINER" >/dev/null 2>&1; then cleanup_rc=1; fi

  if [[ "$STACK_STARTED" == '1' && -d "$LOCAL_PROJECT" ]]; then
    (cd "$LOCAL_PROJECT" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  for name in "${project_containers[@]}"; do
    if docker inspect "$name" >/dev/null 2>&1; then
      docker rm -f -- "$name" >/dev/null 2>&1 || cleanup_rc=1
    fi
    if docker inspect "$name" >/dev/null 2>&1; then cleanup_rc=1; fi
  done
  for name in "${bootstrap_volume_names[@]}"; do
    if docker volume inspect "$name" >/dev/null 2>&1; then
      docker volume rm "$name" >/dev/null 2>&1 || cleanup_rc=1
    fi
    if docker volume inspect "$name" >/dev/null 2>&1; then cleanup_rc=1; fi
  done

  case "${WORK_DIR:-}" in
    "$RUNNER_TEMP"/l1b-b2.*)
      rm -rf -- "$WORK_DIR" >/dev/null 2>&1 || cleanup_rc=1
      [[ ! -e "$WORK_DIR" && ! -L "$WORK_DIR" ]] || cleanup_rc=1
      ;;
    *) cleanup_rc=1 ;;
  esac
  return "$cleanup_rc"
}
cleanup_on_exit() {
  local rc=$?
  trap - EXIT ERR
  if ! cleanup_resources; then
    printf '::error::L1B_B2_DISPOSABLE_CLEANUP_FAILED\n' >&2
    exit 96
  fi
  exit "$rc"
}
trap cleanup_on_exit EXIT
'''
    payload=replace_once(payload,old_cleanup,new_cleanup,'fail-closed-disposable-cleanup')
    payload=replace_once(payload,'(cd "$LOCAL_PROJECT" && supabase start >"$WORK_DIR/start.log" 2>&1)\nSTACK_STARTED=1\n\nBOOTSTRAP_IMAGE_ID=','(cd "$LOCAL_PROJECT" && supabase start >"$WORK_DIR/start.log" 2>&1)\nSTACK_STARTED=1\nmapfile -t bootstrap_volume_names < <(\n  docker inspect "$BOOTSTRAP_DB_CONTAINER" --format \'{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}\' |\n    sed \'/^$/d\' | LC_ALL=C sort -u\n)\n[[ "${#bootstrap_volume_names[@]}" -ge 1 ]]\n\nBOOTSTRAP_IMAGE_ID=','capture-bootstrap-volumes')
    old_count=r'''# Exact row-count reconciliation against the encrypted B-1 data dump.
if ! docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq -F $'\t' --set=ON_ERROR_STOP=1 >"$ACTUAL_COUNTS" 2>&1 <<'SQL'
select 'auth.users',count(*) from auth.users
union all select 'public.mtp_line_accounts',count(*) from public.mtp_line_accounts
union all select 'public.mtp_line_events',count(*) from public.mtp_line_events
union all select 'public.mtp_line_link_codes',count(*) from public.mtp_line_link_codes
union all select 'public.mtp_line_mutations',count(*) from public.mtp_line_mutations
union all select 'public.mtp_line_snapshots',count(*) from public.mtp_line_snapshots
union all select 'public.mtp_import_batches',count(*) from public.mtp_import_batches
union all select 'public.mtp_import_chunks',count(*) from public.mtp_import_chunks
union all select 'public.mtp_import_staging',count(*) from public.mtp_import_staging
union all select 'public.mtp_import_rejects',count(*) from public.mtp_import_rejects
union all select 'public.mtp_tasks',count(*) from public.mtp_tasks
union all select 'public.mtp_subtasks',count(*) from public.mtp_subtasks
union all select 'public.mtp_events',count(*) from public.mtp_events
union all select 'public.mtp_event_windows',count(*) from public.mtp_event_windows
union all select 'public.mtp_task_attachments',count(*) from public.mtp_task_attachments
order by 1;
SQL
then
  echo "::error::Restored aggregate query failed"; exit 1
fi
chmod 600 "$ACTUAL_COUNTS"
python3 "$CHECKER" compare "$EXPECTED_COUNTS" "$ACTUAL_COUNTS"
'''
    new_count=rf'''# Exact row-count reconciliation against the encrypted B-1 data dump.
l1b_b2_set_stage 'exact-count'
COUNT_CHECKER="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-count-check.py"
COUNT_SQL="$EXTRACT_DIR/l1b-b2-exact-count-check.sql"
if [[ ! -f "$COUNT_CHECKER" || -L "$COUNT_CHECKER" ]]; then echo "::error::Pinned exact count checker is absent or unsafe"; exit 1; fi
if [[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$COUNT_CHECKER")" != '{COUNT_CHECKER_BLOB}' ]]; then echo "::error::Pinned exact count checker differs from the reviewed Git blob"; exit 1; fi
python3 "$COUNT_CHECKER" generate-sql "$EXPECTED_COUNTS" "$COUNT_SQL"
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -Xq --single-transaction --set=ON_ERROR_STOP=1 --file /l1b-restore/l1b-b2-exact-count-check.sql >"$ACTUAL_COUNTS" 2>&1; then echo "::error::Restored exact aggregate assertions failed; private diagnostics were withheld and deleted"; exit 1; fi
chmod 600 "$ACTUAL_COUNTS"
'''
    payload=replace_once(payload,old_count,new_count,'exact-count-reconciliation')
    payload=replace_once(payload,'# Validate accepted post-import state, RLS/policies/functions, owner integrity,\n# and absence of L1/mtp-private. No row content is emitted.\n',"# Validate accepted post-import state, RLS/policies/functions, owner integrity,\n# and absence of L1/mtp-private. No row content is emitted.\nl1b_b2_set_stage 'postcheck'\n",'postcheck-stage')
    payload=replace_once(payload,'# Deterministic catalog fingerprints must match the read-only Production preflight.\n',"# Deterministic catalog fingerprints must match the read-only Production preflight.\nl1b_b2_set_stage 'catalog'\n",'catalog-stage')
    old_grant=r'''  union all
  select case when g.table_name like 'mtp_line_%' then 'LINE' when g.table_name like 'aicc_%' then 'AICC' else 'L0B' end,
         'GRANT|'||g.table_schema||'|'||g.table_name||'|'||g.grantee||'|'||g.privilege_type||'|'||g.is_grantable
  from information_schema.role_table_grants g where g.table_schema='public' and (g.table_name like 'mtp_line_%' or g.table_name like 'aicc_%' or g.table_name in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
'''
    new_grant=r'''  union all
  select g.scope,'GRANT|'||g.table_schema||'|'||g.table_name||'|'||g.grantee||'|'||g.privilege_type||'|'||g.is_grantable
  from (
    select case when c.relname like 'mtp_line_%' then 'LINE' when c.relname like 'aicc_%' then 'AICC' else 'L0B' end as scope,n.nspname as table_schema,c.relname as table_name,case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,acl.privilege_type,case when coalesce(pg_catalog.pg_has_role(nullif(acl.grantee,0),c.relowner,'USAGE'),false) or acl.is_grantable then 'YES' else 'NO' end as is_grantable
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r'::"char",c.relowner))) acl
    where n.nspname='public' and c.relkind in ('r','v','f','p')
      and acl.privilege_type in ('INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
      and (c.relname like 'mtp_line_%' or c.relname like 'aicc_%' or c.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
      and (pg_catalog.pg_has_role('postgres',acl.grantor,'USAGE') or coalesce(pg_catalog.pg_has_role('postgres',nullif(acl.grantee,0),'USAGE'),false) or acl.grantee=0)
  ) g
'''
    payload=replace_once(payload,old_grant,new_grant,'role-independent-catalog-grants')
    old_catalog=("grep -Fxq $'AICC\\t463\\t'\"$EXPECTED_AICC_FINGERPRINT\" \"$FINGERPRINTS\"\n" "grep -Fxq $'L0B\\t234\\t'\"$EXPECTED_L0B_FINGERPRINT\" \"$FINGERPRINTS\"\n" "grep -Fxq $'LINE\\t127\\t'\"$EXPECTED_LINE_FINGERPRINT\" \"$FINGERPRINTS\"\n\n")
    new_catalog=("l1b_b2_assert_triplet catalog AICC 463 \"$EXPECTED_AICC_FINGERPRINT\" \"$FINGERPRINTS\"\n" "l1b_b2_assert_triplet catalog L0B 234 \"$EXPECTED_L0B_FINGERPRINT\" \"$FINGERPRINTS\"\n" "l1b_b2_assert_triplet catalog LINE 127 \"$EXPECTED_LINE_FINGERPRINT\" \"$FINGERPRINTS\"\n\n" "l1b_b2_set_stage 'index'\n\n")
    payload=replace_once(payload,old_catalog,new_catalog,'catalog-assertions')
    old_index=("grep -Fxq $'L0B\\t26\\t'\"$EXPECTED_L0B_INDEX_FINGERPRINT\" \"$INDEX_FINGERPRINTS\"\n" "grep -Fxq $'LINE\\t11\\t'\"$EXPECTED_LINE_INDEX_FINGERPRINT\" \"$INDEX_FINGERPRINTS\"\n")
    new_index=("l1b_b2_assert_triplet index L0B 26 \"$EXPECTED_L0B_INDEX_FINGERPRINT\" \"$INDEX_FINGERPRINTS\"\n" "l1b_b2_assert_triplet index LINE 11 \"$EXPECTED_LINE_INDEX_FINGERPRINT\" \"$INDEX_FINGERPRINTS\"\n")
    payload=replace_once(payload,old_index,new_index,'index-assertions'); anchor=new_index
    injected=anchor+r'''

: "${L1B_B2_PATCHED_REVIEW_CHECKER:?Patched review checker path is required}"
: "${L1B_B2_PATCHED_REVIEW_CHECKER_BLOB:?Patched review checker blob is required}"
REVIEW_CHECKER="$L1B_B2_PATCHED_REVIEW_CHECKER"
if [[ ! -f "$REVIEW_CHECKER" || -L "$REVIEW_CHECKER" ]]; then echo "::error::Pinned stdin-safe B-2 review checker is absent or unsafe"; exit 1; fi
if [[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$REVIEW_CHECKER")" != "$L1B_B2_PATCHED_REVIEW_CHECKER_BLOB" ]]; then echo "::error::Pinned stdin-safe B-2 review checker differs from the frozen derived blob"; exit 1; fi
LOCAL_DB_PASSWORD="$LOCAL_DB_PASSWORD" ISOLATED_DB_CONTAINER="$ISOLATED_DB_CONTAINER" WORK_DIR="$WORK_DIR" L1B_B2_PATCHED_BASE_ACL_CHECKER="${L1B_B2_PATCHED_BASE_ACL_CHECKER:?}" L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB="${L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB:?}" bash "$REVIEW_CHECKER"
'''
    payload=replace_once(payload,anchor,injected,'review-check-call')
    payload=replace_once(payload,'{\n  echo "## L1B B-2 fresh post-import isolated restore"','if ! cleanup_resources; then\n  printf \'::error::L1B_B2_DISPOSABLE_CLEANUP_FAILED\\n\' >&2\n  exit 96\nfi\n\n{\n  echo "## L1B B-2 fresh post-import isolated restore"','cleanup-before-summary')
    payload=replace_once(payload,'  echo "- Exact backup COPY/restored row-count reconciliation: **VERIFIED**"\n','  echo "- Exact backup COPY/restored row-count reconciliation: **VERIFIED (SQL-side assertions)**"\n','count-summary')
    old_completion=r'''  echo "- Plaintext SQL/log artifact uploaded: **NO**"
} >> "$GITHUB_STEP_SUMMARY"

printf 'L1B_B2_RAW_CORE_COMPLETE\n'
'''
    new_completion=r'''  echo "- Plaintext SQL/log artifact uploaded: **NO**"
  echo "- Disposable containers, inherited database volume and plaintext work directory removed: **VERIFIED**"
} >> "$GITHUB_STEP_SUMMARY"

trap - EXIT
printf 'L1B_B2_CHILD_RESTORE_COMPLETE\n'
'''
    payload=replace_once(payload,old_completion,new_completion,'child-completion-after-core-cleanup')
    payload=replace_once(payload,'  echo "- LINE/L0b/AICC catalog and LINE/L0b index fingerprints: **VERIFIED**"\n','  echo "- LINE/L0b/AICC catalog and LINE/L0b index fingerprints: **VERIFIED**"\n' '  echo "- Role-independent catalog grant inventory: **VERIFIED**"\n' '  echo "- Privacy-safe fixed-stage diagnostics: **VERIFIED**"\n' '  echo "- Heredoc-backed docker exec stdin transport: **VERIFIED**"\n' '  echo "- Raw ACL/default ACL and complete L0b function inventory: **VERIFIED**"\n' '  echo "- Effective privileges plus complete runtime-role membership graph: **VERIFIED**"\n' '  echo "- Exact AICC dump/restored row-count reconciliation: **VERIFIED**"\n' '  echo "- Complete public application foreign-key relationships: **VERIFIED**"\n' '  echo "- mtp-private bucket, policies and storage.objects rows absent: **VERIFIED**"\n','summary')
    if 'information_schema.role_table_grants' in payload: raise SystemExit('role-dependent catalog grant view remains in executed derived core')
    recovery_marker='L1B fresh post-import B-2 isolated restore:'+' PASS'
    if recovery_marker in payload: raise SystemExit('child restore emits final recovery PASS before entrypoint cleanup')
    output.write_text(payload,encoding='utf-8',newline='\n'); output.chmod(0o700); return 0
if __name__=='__main__': raise SystemExit(main())
