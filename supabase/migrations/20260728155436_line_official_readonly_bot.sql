-- Read-only LINE Official Account bridge for My Todo Planner.
--
-- Google Drive remains the primary planner backup. The browser publishes only a
-- reduced task snapshot after a successful Drive reconciliation; notes,
-- descriptions, attachments, OAuth tokens, and configuration never enter these
-- tables.

create table public.mtp_line_snapshots (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version = 1),
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object')
    check (octet_length(snapshot::text) <= 262144),
  data_updated_at timestamptz,
  drive_saved_at timestamptz,
  source text not null check (source in ('full', 'mobile')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mtp_line_link_codes (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index mtp_line_link_codes_available_idx
  on public.mtp_line_link_codes (expires_at)
  where used_at is null;

create table public.mtp_line_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  line_user_id text not null unique
    check (char_length(line_user_id) between 1 and 128),
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.mtp_line_snapshots enable row level security;
alter table public.mtp_line_link_codes enable row level security;
alter table public.mtp_line_accounts enable row level security;

create policy "owners read their LINE snapshot"
  on public.mtp_line_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners create their LINE snapshot"
  on public.mtp_line_snapshots
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "owners update their LINE snapshot"
  on public.mtp_line_snapshots
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners read their LINE link code"
  on public.mtp_line_link_codes
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners create their LINE link code"
  on public.mtp_line_link_codes
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "owners update their LINE link code"
  on public.mtp_line_link_codes
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners delete their LINE link code"
  on public.mtp_line_link_codes
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners read their LINE account"
  on public.mtp_line_accounts
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on table public.mtp_line_snapshots from anon;
revoke all on table public.mtp_line_link_codes from anon;
revoke all on table public.mtp_line_accounts from anon;

grant select, insert, update on table public.mtp_line_snapshots to authenticated;
grant select, insert, update, delete on table public.mtp_line_link_codes to authenticated;
grant select on table public.mtp_line_accounts to authenticated;
grant select on table public.mtp_line_snapshots to service_role;
grant select, update on table public.mtp_line_accounts to service_role;

-- Claiming a code and changing the LINE mapping must be one transaction. The
-- Edge Function is the only caller; authenticated browser clients cannot call
-- this SECURITY DEFINER function.
create or replace function public.mtp_claim_line_link(
  p_code_hash text,
  p_line_user_id text
)
returns table (status text, owner_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_owner_id uuid;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or char_length(coalesce(p_line_user_id, '')) not between 1 and 128 then
    return query select 'invalid_request'::text, null::uuid;
    return;
  end if;

  -- Serialise claims from the same LINE user, while the row lock below
  -- serialises two requests trying to consume the same one-time code.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_line_user_id, 0)
  );

  select c.owner_id
    into v_owner_id
    from public.mtp_line_link_codes as c
   where c.code_hash = p_code_hash
     and c.used_at is null
     and c.expires_at > pg_catalog.now()
   for update;

  if v_owner_id is null then
    return query select 'invalid_or_expired'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1
      from public.mtp_line_accounts as a
     where a.line_user_id = p_line_user_id
       and a.owner_id <> v_owner_id
  ) then
    return query select 'line_in_use'::text, null::uuid;
    return;
  end if;

  insert into public.mtp_line_accounts (
    owner_id, line_user_id, linked_at, last_seen_at
  )
  values (
    v_owner_id, p_line_user_id, pg_catalog.now(), pg_catalog.now()
  )
  on conflict (owner_id) do update
    set line_user_id = excluded.line_user_id,
        linked_at = pg_catalog.now(),
        last_seen_at = pg_catalog.now();

  update public.mtp_line_link_codes
     set used_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where mtp_line_link_codes.owner_id = v_owner_id;

  return query select 'linked'::text, v_owner_id;
end;
$$;

revoke all on function public.mtp_claim_line_link(text, text) from public;
revoke all on function public.mtp_claim_line_link(text, text) from anon;
revoke all on function public.mtp_claim_line_link(text, text) from authenticated;
grant execute on function public.mtp_claim_line_link(text, text) to service_role;
