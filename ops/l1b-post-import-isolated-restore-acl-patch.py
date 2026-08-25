#!/usr/bin/env python3
"""Inject final count and review reconciliation into stdin-safe B-2 core."""

from __future__ import annotations

import pathlib
import sys

COUNT_CHECKER_BLOB = "39acfa0b950c5ec9365f46623d416d4cbc882e52"


def replace_once(payload: str, old: str, new: str, label: str) -> str:
    count = payload.count(old)
    if count != 1:
        raise SystemExit(
            f"Review-check injection anchor {label!r} count is {count}, expected 1"
        )
    return payload.replace(old, new, 1)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} INPUT_CORE OUTPUT_CORE", file=sys.stderr)
        return 2

    source = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    if source.is_symlink() or not source.is_file():
        raise SystemExit("input core is absent or unsafe")
    if output.exists() or output.is_symlink():
        raise SystemExit("output core path already exists or is unsafe")

    payload = source.read_text(encoding="utf-8", errors="strict")

    old_count_block = r'''# Exact row-count reconciliation against the encrypted B-1 data dump.
if ! docker exec --interactive --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -XAtq -F $'\t' --set=ON_ERROR_STOP=1 >"$ACTUAL_COUNTS" <<'SQL'
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
    new_count_block = rf'''# Exact row-count reconciliation against the encrypted B-1 data dump.
# Generate fixed SQL assertions from the reviewed relation/count inventory and
# evaluate them directly inside the disposable target. This avoids a second
# formatter-mediated TSV transport while preserving exact dump-derived counts.
COUNT_CHECKER="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-count-check.py"
COUNT_SQL="$EXTRACT_DIR/l1b-b2-exact-count-check.sql"
if [[ ! -f "$COUNT_CHECKER" || -L "$COUNT_CHECKER" ]]; then
  echo "::error::Pinned exact count checker is absent or unsafe"
  exit 1
fi
if [[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$COUNT_CHECKER")" != '{COUNT_CHECKER_BLOB}' ]]; then
  echo "::error::Pinned exact count checker differs from the reviewed Git blob"
  exit 1
fi
python3 "$COUNT_CHECKER" generate-sql "$EXPECTED_COUNTS" "$COUNT_SQL"
if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" "$ISOLATED_DB_CONTAINER" \
  psql -h /var/run/postgresql -U "$LOCAL_DB_ADMIN" -d postgres -Xq \
  --single-transaction --set=ON_ERROR_STOP=1 \
  --file /l1b-restore/l1b-b2-exact-count-check.sql >"$ACTUAL_COUNTS" 2>&1; then
  echo "::error::Restored exact aggregate assertions failed; private diagnostics were withheld and deleted"
  exit 1
fi
chmod 600 "$ACTUAL_COUNTS"
'''
    payload = replace_once(
        payload,
        old_count_block,
        new_count_block,
        "exact-count-reconciliation",
    )

    anchor = (
        "grep -Fxq $'LINE\\t11\\t'\"$EXPECTED_LINE_INDEX_FINGERPRINT\" "
        "\"$INDEX_FINGERPRINTS\"\n"
    )
    injected = anchor + r'''
: "${L1B_B2_PATCHED_REVIEW_CHECKER:?Patched review checker path is required}"
: "${L1B_B2_PATCHED_REVIEW_CHECKER_BLOB:?Patched review checker blob is required}"
REVIEW_CHECKER="$L1B_B2_PATCHED_REVIEW_CHECKER"
if [[ ! -f "$REVIEW_CHECKER" || -L "$REVIEW_CHECKER" ]]; then
  echo "::error::Pinned stdin-safe B-2 review checker is absent or unsafe"
  exit 1
fi
if [[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$REVIEW_CHECKER")" != "$L1B_B2_PATCHED_REVIEW_CHECKER_BLOB" ]]; then
  echo "::error::Pinned stdin-safe B-2 review checker differs from the frozen derived blob"
  exit 1
fi
LOCAL_DB_PASSWORD="$LOCAL_DB_PASSWORD" \
ISOLATED_DB_CONTAINER="$ISOLATED_DB_CONTAINER" \
WORK_DIR="$WORK_DIR" \
L1B_B2_PATCHED_BASE_ACL_CHECKER="${L1B_B2_PATCHED_BASE_ACL_CHECKER:?}" \
L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB="${L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB:?}" \
  bash "$REVIEW_CHECKER"
'''
    payload = replace_once(payload, anchor, injected, "review-check-call")
    payload = replace_once(
        payload,
        '  echo "- Exact backup COPY/restored row-count reconciliation: **PASS**"\n',
        '  echo "- Exact backup COPY/restored row-count reconciliation: **PASS (SQL-side assertions)**"\n',
        "count-summary",
    )
    payload = replace_once(
        payload,
        '  echo "- LINE/L0b/AICC catalog and LINE/L0b index fingerprints: **PASS**"\n',
        '  echo "- LINE/L0b/AICC catalog and LINE/L0b index fingerprints: **PASS**"\n'
        '  echo "- Heredoc-backed docker exec stdin transport: **PASS**"\n'
        '  echo "- Raw ACL/default ACL and complete L0b function inventory: **PASS**"\n'
        '  echo "- Effective privileges plus complete runtime-role membership graph: **PASS**"\n'
        '  echo "- Exact AICC dump/restored row-count reconciliation: **PASS**"\n'
        '  echo "- Complete public application foreign-key relationships: **PASS**"\n'
        '  echo "- mtp-private bucket, policies and storage.objects rows absent: **PASS**"\n',
        "summary",
    )

    output.write_text(payload, encoding="utf-8", newline="\n")
    output.chmod(0o700)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
