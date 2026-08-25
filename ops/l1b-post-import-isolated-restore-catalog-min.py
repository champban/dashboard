#!/usr/bin/env python3
"""Replace the role-sensitive catalog grant source in the B-2 derived core."""
from __future__ import annotations
import argparse
from pathlib import Path

OLD = r'''  select case when g.table_name like 'mtp_line_%' then 'LINE' when g.table_name like 'aicc_%' then 'AICC' else 'L0B' end,
         'GRANT|'||g.table_schema||'|'||g.table_name||'|'||g.grantee||'|'||g.privilege_type||'|'||g.is_grantable
  from information_schema.role_table_grants g where g.table_schema='public' and (g.table_name like 'mtp_line_%' or g.table_name like 'aicc_%' or g.table_name in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
'''
NEW = r'''  select case when c.relname like 'mtp_line_%' then 'LINE' when c.relname like 'aicc_%' then 'AICC' else 'L0B' end,
         'GRANT|'||n.nspname||'|'||c.relname||'|'||
         case when x.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(x.grantee) end||'|'||
         x.privilege_type||'|'||
         case when x.is_grantable or (x.grantee<>0 and pg_catalog.pg_has_role(x.grantee,c.relowner,'USAGE')) then 'YES' else 'NO' end
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r'::"char",c.relowner))) x
  where n.nspname='public' and c.relkind in ('r','v','f','p')
    and x.privilege_type<>'MAINTAIN'
    and (c.relname like 'mtp_line_%' or c.relname like 'aicc_%' or c.relname in ('mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects','mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'))
'''
MARKER = "# Deterministic catalog fingerprints must match the read-only Production preflight.\n"
STAGE = "printf 'L1B_B2_STAGE=CATALOG_QUERY\\n'\n"

def patch(payload: str) -> str:
    if payload.count(OLD) != 1 or payload.count(MARKER) != 1:
        raise ValueError("catalog patch anchor count differs")
    payload = payload.replace(OLD, NEW, 1)
    return payload.replace(MARKER, STAGE + MARKER, 1)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?")
    parser.add_argument("output", nargs="?")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        sample = MARKER + OLD
        result = patch(sample)
        assert OLD not in result and NEW in result and result.count(STAGE) == 1
        print("L1B B-2 minimal catalog patch selftest: PASS")
        return 0
    if not args.source or not args.output:
        parser.error("source and output are required")
    source, output = Path(args.source), Path(args.output)
    if source.is_symlink() or not source.is_file() or output.exists() or output.is_symlink():
        raise SystemExit("catalog patch path is absent or unsafe")
    output.write_text(patch(source.read_text(encoding="utf-8", errors="strict")), encoding="utf-8", newline="\n")
    output.chmod(0o700)
    print("L1B_B2_CATALOG_FIXES=2")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
