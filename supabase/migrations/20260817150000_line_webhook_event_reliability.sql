-- Persistent LINE webhook event ledger for redelivery-safe processing.
--
-- This migration is additive and is intentionally not applied by source merge.
-- Production application requires a separate Owner-approved migration gate and
-- a recoverable Supabase backup/export.

create table if not exists public.mtp_line_events (
  event_id text primary key
    check (char_length(event_id) between 1 and 200),
  owner_id uuid references auth.users(id) on delete cascade,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed')),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  last_error_code text
    check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists mtp_line_events_status_updated_idx
  on public.mtp_line_events (status, updated_at);
create index if not exists mtp_line_events_received_idx
  on public.mtp_line_events (received_at);

alter table public.mtp_line_events enable row level security;
revoke all on table public.mtp_line_events from anon;
revoke all on table public.mtp_line_events from authenticated;
grant select, insert, update, delete on table public.mtp_line_events to service_role;

-- Keep the mutation draft itself idempotent across a crash after INSERT but
-- before the event ledger reaches processed. The event ledger is retained only
-- for a bounded period, so this audit key deliberately has no foreign key.
alter table public.mtp_line_mutations
  add column if not exists source_event_id text
    check (source_event_id is null or char_length(source_event_id) between 1 and 200);

create unique index if not exists mtp_line_mutations_source_event_uidx
  on public.mtp_line_mutations (source_event_id)
  where source_event_id is not null;

comment on column public.mtp_line_mutations.source_event_id is
  'Stable LINE webhook event identity used to prevent duplicate mutation drafts.';

-- The pre-L0a table grant allowed authenticated users to update every column.
-- Restrict browser clients to the four queue-completion fields actually written
-- by line-sync.js. In particular, clients cannot squat source_event_id values or
-- rewrite operation/owner/expiry fields.
revoke update on table public.mtp_line_mutations from authenticated;
grant update (status, error_code, applied_at, updated_at)
  on table public.mtp_line_mutations to authenticated;

-- Atomically claim one event. A currently-processing event is owned by one
-- invocation until its lease becomes stale. Failed and stale attempts may be
-- reclaimed; processed events are permanent duplicates until retention cleanup.
create or replace function public.mtp_claim_line_event(
  p_event_id text,
  p_owner_id uuid default null,
  p_stale_after_seconds integer default 30
)
returns table (decision text, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_inserted integer := 0;
  v_status text;
  v_attempt_count integer;
  v_processing_started_at timestamptz;
begin
  if char_length(coalesce(p_event_id, '')) not between 1 and 200
     or p_stale_after_seconds is null
     or p_stale_after_seconds not between 30 and 3600 then
    return query select 'invalid_request'::text, 0::integer;
    return;
  end if;

  insert into public.mtp_line_events (
    event_id,
    owner_id,
    status,
    attempt_count,
    processing_started_at,
    updated_at
  )
  values (
    p_event_id,
    p_owner_id,
    'processing',
    1,
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return query select 'claimed'::text, 1::integer;
    return;
  end if;

  select e.status, e.attempt_count, e.processing_started_at
    into v_status, v_attempt_count, v_processing_started_at
    from public.mtp_line_events as e
   where e.event_id = p_event_id
   for update;

  if not found then
    return query select 'claim_race'::text, 0::integer;
    return;
  end if;

  if v_status = 'processed' then
    return query select 'duplicate_processed'::text, v_attempt_count;
    return;
  end if;

  if v_status = 'processing'
     and v_processing_started_at is not null
     and v_processing_started_at > (
       pg_catalog.now()
       - pg_catalog.make_interval(secs => p_stale_after_seconds)
     ) then
    return query select 'busy'::text, v_attempt_count;
    return;
  end if;

  update public.mtp_line_events as e
     set owner_id = coalesce(p_owner_id, e.owner_id),
         status = 'processing',
         attempt_count = e.attempt_count + 1,
         last_error_code = null,
         processing_started_at = pg_catalog.now(),
         processed_at = null,
         updated_at = pg_catalog.now()
   where e.event_id = p_event_id
  returning e.attempt_count into v_attempt_count;

  return query
    select case
      when v_status = 'failed' then 'claimed_retry'::text
      else 'claimed_stale'::text
    end,
    v_attempt_count;
end;
$$;

revoke all on function public.mtp_claim_line_event(text, uuid, integer) from public;
revoke all on function public.mtp_claim_line_event(text, uuid, integer) from anon;
revoke all on function public.mtp_claim_line_event(text, uuid, integer) from authenticated;
grant execute on function public.mtp_claim_line_event(text, uuid, integer) to service_role;

-- Finish only the attempt that still owns the processing lease. An older worker
-- cannot overwrite the state of a newer retry.
create or replace function public.mtp_finish_line_event(
  p_event_id text,
  p_attempt_count integer,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_status not in ('processed', 'failed')
     or p_attempt_count < 1 then
    return false;
  end if;

  update public.mtp_line_events as e
     set status = p_status,
         last_error_code = case
           when p_status = 'failed' then pg_catalog.substr(
             coalesce(nullif(p_error_code, ''), 'event_processing_failed'),
             1,
             80
           )
           else null
         end,
         processed_at = case
           when p_status = 'processed' then pg_catalog.now()
           else null
         end,
         updated_at = pg_catalog.now()
   where e.event_id = p_event_id
     and e.status = 'processing'
     and e.attempt_count = p_attempt_count;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.mtp_finish_line_event(text, integer, text, text) from public;
revoke all on function public.mtp_finish_line_event(text, integer, text, text) from anon;
revoke all on function public.mtp_finish_line_event(text, integer, text, text) from authenticated;
grant execute on function public.mtp_finish_line_event(text, integer, text, text) to service_role;

-- Retention is intentionally outside the webhook critical path. Call this from
-- a separately approved scheduled/maintenance job; only terminal rows are
-- eligible for deletion.
create or replace function public.mtp_cleanup_line_events(
  p_before timestamptz default (pg_catalog.now() - interval '30 days')
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint := 0;
begin
  delete from public.mtp_line_events as e
   where e.status in ('processed', 'failed')
     and e.updated_at < p_before;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.mtp_cleanup_line_events(timestamptz) from public;
revoke all on function public.mtp_cleanup_line_events(timestamptz) from anon;
revoke all on function public.mtp_cleanup_line_events(timestamptz) from authenticated;
grant execute on function public.mtp_cleanup_line_events(timestamptz) to service_role;
