-- Packet A: close RISK-L0A-ACL-1 at source for postgres-owned defaults and
-- existing mtp_line_* objects. This migration changes ACLs only: it performs
-- no data DML, policy replacement, cleanup, backfill, or L0b activation.
--
-- The target project also has provider-owned supabase_admin default ACLs.
-- Production postgres cannot alter those defaults, so that residual must be
-- handled through a separately approved Supabase provider-setting gate before
-- this migration is applied. Do not claim this source file closes that gate.

begin;

do $$
declare
  v_missing text;
begin
  select pg_catalog.string_agg(r.role_name, ', ' order by r.role_name)
    into v_missing
    from (values
      ('postgres'), ('anon'), ('authenticated'), ('service_role')
    ) as r(role_name)
   where not exists (
     select 1 from pg_catalog.pg_roles as p where p.rolname = r.role_name
   );
  if v_missing is not null then
    raise exception 'line ACL hardening missing required roles: %', v_missing;
  end if;

  select pg_catalog.string_agg(t.table_name, ', ' order by t.table_name)
    into v_missing
    from (values
      ('mtp_line_accounts'),
      ('mtp_line_events'),
      ('mtp_line_link_codes'),
      ('mtp_line_mutations'),
      ('mtp_line_snapshots')
    ) as t(table_name)
   where not exists (
     select 1
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t.table_name
        and c.relkind in ('r', 'p')
   );
  if v_missing is not null then
    raise exception 'line ACL hardening missing required tables: %', v_missing;
  end if;

  select pg_catalog.string_agg(f.signature, ', ' order by f.signature)
    into v_missing
    from (values
      ('public.mtp_claim_line_link(text,text)'),
      ('public.mtp_claim_line_event(text,uuid,integer)'),
      ('public.mtp_finish_line_event(text,integer,text,text)'),
      ('public.mtp_cleanup_line_events(timestamp with time zone)')
    ) as f(signature)
   where pg_catalog.to_regprocedure(f.signature) is null;
  if v_missing is not null then
    raise exception 'line ACL hardening missing required functions: %', v_missing;
  end if;
end;
$$;

-- Existing Supabase projects historically auto-granted new public objects.
-- Make every future postgres-owned grant explicit instead. These statements
-- are intentionally repeatable and do not alter existing aicc_* objects.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated, service_role;
-- PostgreSQL's built-in PUBLIC EXECUTE default is global. A per-schema REVOKE
-- cannot remove it, so close it at the owning-role level, then remove the
-- target project's explicit public-schema grants to the API roles below.
alter default privileges for role postgres
  revoke all privileges on functions from public;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated, service_role;

-- Remove inherited broad table ACLs before restoring the exact browser and
-- Edge Function contracts verified against line-sync.js and line-todo-webhook.
revoke all privileges on table
  public.mtp_line_accounts,
  public.mtp_line_events,
  public.mtp_line_link_codes,
  public.mtp_line_mutations,
  public.mtp_line_snapshots
from public, anon, authenticated, service_role;

-- L0a deliberately left these four authenticated column grants after revoking
-- table-level UPDATE. Clear them so a repeated Packet A application rebuilds
-- the same ACL from zero rather than depending on earlier catalog state.
revoke update (status, error_code, applied_at, updated_at)
  on table public.mtp_line_mutations from authenticated;

-- Authenticated browser contract. RLS remains the ownership boundary.
grant select on table public.mtp_line_accounts to authenticated;
grant select, insert, update on table public.mtp_line_link_codes to authenticated;
grant select on table public.mtp_line_mutations to authenticated;
grant update (status, error_code, applied_at, updated_at)
  on table public.mtp_line_mutations to authenticated;
grant select, insert, update on table public.mtp_line_snapshots to authenticated;

-- Current service-role contract. SECURITY DEFINER RPCs perform link claiming,
-- ledger claiming/finalization, and cleanup as their owner; their caller does
-- not need direct INSERT/DELETE grants on those tables.
grant select, update on table public.mtp_line_accounts to service_role;
grant select, insert, update on table public.mtp_line_mutations to service_role;
grant select, update on table public.mtp_line_events to service_role;
grant select on table public.mtp_line_snapshots to service_role;

revoke all privileges on function public.mtp_claim_line_link(text, text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.mtp_claim_line_event(text, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.mtp_finish_line_event(text, integer, text, text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.mtp_cleanup_line_events(timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.mtp_claim_line_link(text, text) to service_role;
grant execute on function public.mtp_claim_line_event(text, uuid, integer) to service_role;
grant execute on function public.mtp_finish_line_event(text, integer, text, text) to service_role;
grant execute on function public.mtp_cleanup_line_events(timestamptz) to service_role;

commit;
