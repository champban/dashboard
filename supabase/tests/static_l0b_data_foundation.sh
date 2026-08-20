#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20260820032749_l0b_data_foundation.sql"

[[ "$(grep -Ec '^create table public\.mtp_' "$MIGRATION")" == "9" ]]
! grep -Eiq 'on all (tables|sequences|functions) in schema public' "$MIGRATION"
! grep -Eiq 'grant .*\b(insert|update|delete|truncate|references|trigger|maintain)\b.*authenticated' "$MIGRATION"
! grep -Eiq 'grant .* on table .* to service_role' "$MIGRATION"
! grep -Eiq '\b(line_ref|l0bDataFoundation|mtp_line_mutations)\b' "$MIGRATION"
! grep -Eiq 'delete from public\.(mtp_tasks|mtp_subtasks|mtp_events|mtp_event_windows|mtp_task_attachments)' "$MIGRATION"
! grep -Eiq '\b(SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_DETAIL|PG_EXCEPTION_CONTEXT|CONSTRAINT_NAME)\b' "$MIGRATION"

for sequence in mtp_import_staging_id_seq mtp_import_rejects_id_seq; do
  for role in public anon authenticated service_role; do
    grep -Eiq "revoke all on sequence public\.${sequence} from ${role};" "$MIGRATION"
  done
done

for table in mtp_import_batches mtp_import_chunks mtp_import_staging mtp_import_rejects mtp_tasks mtp_subtasks mtp_events mtp_event_windows mtp_task_attachments; do
  revoke_line="$(grep -Ein "revoke all on table public\.${table} from service_role;" "$MIGRATION" | cut -d: -f1)"
  grant_line="$(grep -Ein "grant .* on table public\.${table} to authenticated;" "$MIGRATION" | cut -d: -f1 || true)"
  [[ -n "$revoke_line" ]]
  [[ -z "$grant_line" || "$revoke_line" -lt "$grant_line" ]]
done

event_window_block="$(sed -n '/create table public\.mtp_event_windows (/,/);/p' "$MIGRATION")"
! grep -Eiq '^  (id|source_key|source_id_legacy|place|loc) ' <<<"$event_window_block"
event_block="$(sed -n '/create table public\.mtp_events (/,/);/p' "$MIGRATION")"
! grep -Eiq '^  (start_date|end_date) ' <<<"$event_block"
subtask_block="$(sed -n '/create table public\.mtp_subtasks (/,/);/p' "$MIGRATION")"
! grep -Eiq '^  (title|status_text) ' <<<"$subtask_block"
grep -Eq '^  text text not null check \(char_length\(text\) <= 4000\),' <<<"$subtask_block"
! grep -Eiq 'ordinal.*<=' <<<"$subtask_block"
! grep -Eiq 'window_end.*>=.*window_start' <<<"$event_window_block"

echo "L0b static SQL/scope gate: PASS"
