#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACT="$ROOT_DIR/supabase/contracts/l1b_planner_parity.sql"
STORAGE="$ROOT_DIR/supabase/contracts/l1b_private_storage.sql"
BRIDGE="$ROOT_DIR/l1-planner.js"

[[ -f "$CONTRACT" ]]
[[ -f "$STORAGE" ]]
[[ ! -e "$ROOT_DIR/supabase/migrations/20260824_l1b_planner_parity.sql" ]]

grep -Fq 'THIS IS NOT A MIGRATION' "$CONTRACT"
grep -Fq 'create table public.mtp_notes' "$CONTRACT"
grep -Fq 'create table public.mtp_note_assets' "$CONTRACT"
grep -Fq 'create table public.mtp_planner_settings' "$CONTRACT"
grep -Fq "storage_bucket = 'mtp-private'" "$CONTRACT"
grep -Fq 'settings_secret_or_local_field' "$CONTRACT"

for rpc in \
  mtp_task_children_replace_v1 mtp_event_put_v1 mtp_event_delete_v1 \
  mtp_note_put_v1 mtp_note_delete_v1 mtp_settings_update_v1 \
  mtp_attachment_put_v1 mtp_attachment_delete_v1; do
  grep -Eq "create function public\.${rpc}\(" "$CONTRACT"
  grep -Eq "revoke all on function public\.${rpc}\(.*\) from public,anon,authenticated,service_role;" "$CONTRACT"
  grep -Eq "grant execute on function public\.${rpc}\(.*\) to authenticated;" "$CONTRACT"
done

grep -Fq "'mtp-private'" "$STORAGE"
grep -Fq 'false,' "$STORAGE"
grep -Fq '5242880' "$STORAGE"
grep -Fq "(storage.foldername(name))[1]=(select auth.uid())::text" "$STORAGE"
[[ "$(grep -Ec '^create policy mtp_private_owner_(select|insert|update|delete)' "$STORAGE")" == "4" ]]

! grep -Eiq 'grant .* on table .* to (anon|service_role)' "$CONTRACT"
! grep -Eiq 'grant .*(insert|update|delete|truncate|references|trigger|maintain).*authenticated' "$CONTRACT"
! grep -Eiq 'delete from public\.|truncate table public\.|drop (table|schema)|disable row level security' "$CONTRACT"
! grep -Eiq 'on all (tables|sequences|functions) in schema public' "$CONTRACT"
! grep -Eiq '\b(service_role_key|access_token|refresh_token|client_secret|raw_line|line_user_id)\b' "$CONTRACT" "$STORAGE"

if [[ -f "$BRIDGE" ]]; then
  grep -Fq "const ENABLED=false" "$BRIDGE"
  ! grep -Eiq 'set(Time|Inter)val\([^)]*(flush|send|rpc|upload)' "$BRIDGE"
fi

echo "L1B static source/storage/scope gate: PASS"
