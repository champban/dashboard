#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACT="$ROOT_DIR/supabase/contracts/l1a_direct_todo.sql"

[[ -f "$CONTRACT" ]]
[[ ! -e "$ROOT_DIR/supabase/migrations/20260824_l1a_direct_todo.sql" ]]

grep -Fq 'THIS IS NOT A MIGRATION' "$CONTRACT"
grep -Fq "add column record_origin text not null default 'import'" "$CONTRACT"
grep -Fq 'add column id uuid not null default extensions.gen_random_uuid()' "$CONTRACT"
grep -Fq 'create table public.mtp_task_dependencies' "$CONTRACT"
grep -Fq 'create table public.mtp_task_external_refs' "$CONTRACT"
grep -Fq 'create table public.mtp_mutation_receipts' "$CONTRACT"
grep -Fq 'opaque_ref_hash bytea' "$CONTRACT"
! grep -Eiq '\b(raw_line|line_user_id|line_message|message_text|service_role_key)\b' "$CONTRACT"

for rpc in mtp_task_create_v1 mtp_task_update_v1 mtp_task_delete_v1; do
  grep -Eq "create function public\.${rpc}\(" "$CONTRACT"
  grep -Eq "revoke all on function public\.${rpc}\(.*\) from public, anon, authenticated, service_role;" "$CONTRACT"
  grep -Eq "grant execute on function public\.${rpc}\(.*\) to authenticated;" "$CONTRACT"
done

[[ "$(grep -Ec '^create function private\.mtp_l1_task_(create|update|delete)\(' "$CONTRACT")" == "3" ]]
[[ "$(grep -Ec '^security definer$' "$CONTRACT")" == "4" ]]
[[ "$(grep -Fxc "set search_path = ''" "$CONTRACT")" -ge "12" ]]

! grep -Eiq 'grant .* on table .* to (anon|service_role)' "$CONTRACT"
! grep -Eiq 'grant .*(insert|update|delete|truncate|references|trigger|maintain).*authenticated' "$CONTRACT"
! grep -Eiq 'delete from public\.(mtp_tasks|mtp_subtasks|mtp_events|mtp_event_windows|mtp_task_attachments)' "$CONTRACT"
! grep -Eiq 'drop (table|schema)|truncate table|alter table .* disable row level security' "$CONTRACT"
! grep -Eiq 'on all (tables|sequences|functions) in schema public' "$CONTRACT"

echo "L1A static source/scope gate: PASS"
