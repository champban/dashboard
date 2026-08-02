create table public.mtp_line_mutations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation jsonb not null check (jsonb_typeof(operation) = 'object')
    check (octet_length(operation::text) <= 4096),
  status text not null default 'draft'
    check (status in ('draft','confirmed','cancelled','applied','rejected')),
  error_code text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  confirmed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mtp_line_mutations enable row level security;
create policy "owners read LINE mutations" on public.mtp_line_mutations
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners update LINE mutations" on public.mtp_line_mutations
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
revoke all on public.mtp_line_mutations from anon;
grant select, update on public.mtp_line_mutations to authenticated;
grant select, insert, update on public.mtp_line_mutations to service_role;
