\set ON_ERROR_STOP on

-- Exact privilege matrix, including PostgreSQL 17 MAINTAIN.
do $$
declare
  v record;
  v_expected boolean;
  v_actual boolean;
begin
  for v in
    select *
      from (values
        ('anon'), ('authenticated'), ('service_role')
      ) as r(role_name)
      cross join (values
        ('mtp_line_accounts'),
        ('mtp_line_events'),
        ('mtp_line_link_codes'),
        ('mtp_line_mutations'),
        ('mtp_line_snapshots')
      ) as t(table_name)
      cross join (values
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
        ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
      ) as p(privilege_name)
  loop
    v_expected := case
      when v.role_name = 'authenticated'
        and v.table_name = 'mtp_line_accounts'
        and v.privilege_name = 'SELECT' then true
      when v.role_name = 'authenticated'
        and v.table_name = 'mtp_line_link_codes'
        and v.privilege_name in ('SELECT', 'INSERT', 'UPDATE') then true
      when v.role_name = 'authenticated'
        and v.table_name = 'mtp_line_mutations'
        and v.privilege_name = 'SELECT' then true
      when v.role_name = 'authenticated'
        and v.table_name = 'mtp_line_snapshots'
        and v.privilege_name in ('SELECT', 'INSERT', 'UPDATE') then true
      when v.role_name = 'service_role'
        and v.table_name = 'mtp_line_accounts'
        and v.privilege_name in ('SELECT', 'UPDATE') then true
      when v.role_name = 'service_role'
        and v.table_name = 'mtp_line_mutations'
        and v.privilege_name in ('SELECT', 'INSERT', 'UPDATE') then true
      when v.role_name = 'service_role'
        and v.table_name = 'mtp_line_events'
        and v.privilege_name in ('SELECT', 'UPDATE') then true
      when v.role_name = 'service_role'
        and v.table_name = 'mtp_line_snapshots'
        and v.privilege_name = 'SELECT' then true
      else false
    end;
    v_actual := pg_catalog.has_table_privilege(
      v.role_name,
      'public.' || v.table_name,
      v.privilege_name
    );
    if v_actual is distinct from v_expected then
      raise exception 'unexpected %.% % privilege for %: expected %, got %',
        'public', v.table_name, v.privilege_name, v.role_name,
        v_expected, v_actual;
    end if;
  end loop;
end;
$$;

-- Authenticated mutation completion is column-limited even after applying the
-- migration twice. No other mutable column may inherit UPDATE.
do $$
declare
  v record;
  v_expected boolean;
  v_actual boolean;
begin
  for v in
    select a.attname as column_name
      from pg_catalog.pg_attribute as a
     where a.attrelid = 'public.mtp_line_mutations'::regclass
       and a.attnum > 0
       and not a.attisdropped
  loop
    v_expected := v.column_name in (
      'status', 'error_code', 'applied_at', 'updated_at'
    );
    v_actual := pg_catalog.has_column_privilege(
      'authenticated',
      'public.mtp_line_mutations',
      v.column_name,
      'UPDATE'
    );
    if v_actual is distinct from v_expected then
      raise exception 'unexpected authenticated UPDATE privilege on mutation column %',
        v.column_name;
    end if;
  end loop;
end;
$$;

-- Only service_role executes the four LINE SECURITY DEFINER entry points.
do $$
declare
  v record;
  v_actual boolean;
begin
  for v in
    select *
      from (values
        ('anon'), ('authenticated'), ('service_role')
      ) as r(role_name)
      cross join (values
        ('public.mtp_claim_line_link(text,text)'),
        ('public.mtp_claim_line_event(text,uuid,integer)'),
        ('public.mtp_finish_line_event(text,integer,text,text)'),
        ('public.mtp_cleanup_line_events(timestamp with time zone)')
      ) as f(signature)
  loop
    v_actual := pg_catalog.has_function_privilege(
      v.role_name, v.signature, 'EXECUTE'
    );
    if v_actual is distinct from (v.role_name = 'service_role') then
      raise exception 'unexpected EXECUTE on % for %', v.signature, v.role_name;
    end if;
  end loop;
end;
$$;

-- RLS policy inventory is unchanged and every mtp_line_* table stays enabled.
do $$
declare
  v_count integer;
begin
  if exists (
    select 1
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'mtp_line_accounts', 'mtp_line_events', 'mtp_line_link_codes',
         'mtp_line_mutations', 'mtp_line_snapshots'
       )
       and not c.relrowsecurity
  ) then
    raise exception 'Packet A disabled RLS on an mtp_line_* table';
  end if;

  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename in (
       'mtp_line_accounts', 'mtp_line_events', 'mtp_line_link_codes',
       'mtp_line_mutations', 'mtp_line_snapshots'
     );
  if v_count <> 10 then
    raise exception 'expected ten unchanged LINE policies, got %', v_count;
  end if;
end;
$$;

-- Migration is ACL-only: all synthetic pre-migration rows and exact markers
-- remain unchanged. The existing out-of-scope aicc canary keeps its prior ACL.
do $$
declare
  v record;
begin
  if (select snapshot->>'marker' from public.mtp_line_snapshots
       where owner_id = '00000000-0000-4000-8000-000000000001')
       is distinct from 'packet-a'
     or (select line_user_id from public.mtp_line_accounts
          where owner_id = '00000000-0000-4000-8000-000000000001')
          is distinct from 'packet-a-line-owner-1'
     or (select code_hash from public.mtp_line_link_codes
          where owner_id = '00000000-0000-4000-8000-000000000001')
          is distinct from repeat('a', 64)
     or (select operation->>'title' from public.mtp_line_mutations
          where id = '10000000-0000-4000-8000-000000000001')
          is distinct from 'Packet A fixture'
     or (select status from public.mtp_line_events
          where event_id = 'packet-a-event-1') is distinct from 'processed'
     or (select marker from public.aicc_acl_packet_a_canary where id = 1)
          is distinct from 'unchanged-by-packet-a' then
    raise exception 'Packet A changed pre-existing synthetic row content';
  end if;

  for v in
    select *
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
      cross join (values
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
        ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
      ) as p(privilege_name)
  loop
    if not pg_catalog.has_table_privilege(
      v.role_name,
      'public.aicc_acl_packet_a_canary',
      v.privilege_name
    ) then
      raise exception 'Packet A changed existing aicc canary % privilege for %',
        v.privilege_name, v.role_name;
    end if;
  end loop;
end;
$$;

-- Future postgres-owned objects receive no implicit API-role or PUBLIC access.
create table public.mtp_acl_packet_a_probe(id bigint);
create sequence public.mtp_acl_packet_a_probe_seq;
create function public.mtp_acl_packet_a_probe_fn()
returns integer language sql as $$ select 1 $$;

do $$
declare
  v record;
begin
  for v in
    select *
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
      cross join (values
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
        ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
      ) as p(privilege_name)
  loop
    if pg_catalog.has_table_privilege(
      v.role_name, 'public.mtp_acl_packet_a_probe', v.privilege_name
    ) then
      raise exception 'future table default leaked % to %',
        v.privilege_name, v.role_name;
    end if;
  end loop;

  for v in
    select *
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
      cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(privilege_name)
  loop
    if pg_catalog.has_sequence_privilege(
      v.role_name, 'public.mtp_acl_packet_a_probe_seq', v.privilege_name
    ) then
      raise exception 'future sequence default leaked % to %',
        v.privilege_name, v.role_name;
    end if;
  end loop;

  for v in select * from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
  loop
    if pg_catalog.has_function_privilege(
      v.role_name, 'public.mtp_acl_packet_a_probe_fn()', 'EXECUTE'
    ) then
      raise exception 'future function default leaked EXECUTE to %', v.role_name;
    end if;
  end loop;
end;
$$;

-- Effective owner-scoped behavior: owner reads work; non-owner reads are empty;
-- denied operations fail even when an RLS policy happens to exist.
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001',
  false
);
set role authenticated;

do $$
begin
  if (select pg_catalog.count(*) from public.mtp_line_snapshots) <> 1
     or (select pg_catalog.count(*) from public.mtp_line_accounts) <> 1
     or (select pg_catalog.count(*) from public.mtp_line_link_codes) <> 1
     or (select pg_catalog.count(*) from public.mtp_line_mutations) <> 1 then
    raise exception 'authenticated owner cannot read expected LINE rows';
  end if;

  begin
    delete from public.mtp_line_link_codes
     where owner_id = '00000000-0000-4000-8000-000000000001';
    raise exception 'authenticated unexpectedly deleted a LINE link code';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.mtp_line_accounts(owner_id, line_user_id)
    values ('00000000-0000-4000-8000-000000000002', 'denied-account');
    raise exception 'authenticated unexpectedly inserted a LINE account';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform pg_catalog.count(*) from public.mtp_line_events;
    raise exception 'authenticated unexpectedly read the LINE event ledger';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

update public.mtp_line_mutations
   set status = 'applied',
       error_code = 'packet_a_test',
       applied_at = '2026-08-20T00:00:02Z',
       updated_at = '2026-08-20T00:00:02Z'
 where id = '10000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    update public.mtp_line_mutations
       set operation = '{"action":"delete"}'::jsonb
     where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'authenticated unexpectedly changed mutation operation';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',
  false
);
set role authenticated;
do $$
begin
  if (select pg_catalog.count(*) from public.mtp_line_snapshots) <> 0
     or (select pg_catalog.count(*) from public.mtp_line_accounts) <> 0
     or (select pg_catalog.count(*) from public.mtp_line_link_codes) <> 0
     or (select pg_catalog.count(*) from public.mtp_line_mutations) <> 0 then
    raise exception 'RLS exposed owner-1 rows to owner-2';
  end if;
end;
$$;
reset role;

-- service_role still reaches the supported SECURITY DEFINER path without a
-- direct mtp_line_link_codes table grant.
insert into public.mtp_line_link_codes(
  owner_id, code_hash, expires_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000002', repeat('b', 64),
  pg_catalog.now() + interval '1 hour', pg_catalog.now(), pg_catalog.now()
);
set role service_role;
do $$
declare
  v_status text;
  v_owner uuid;
begin
  select status, owner_id into v_status, v_owner
    from public.mtp_claim_line_link(
      repeat('b', 64), 'packet-a-line-owner-2'
    );
  if v_status <> 'linked'
     or v_owner <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'service_role LINE link RPC no longer works';
  end if;
end;
$$;
reset role;

-- Packet A does not rewrite the already reviewed L0b object ACLs.
do $$
begin
  if not pg_catalog.has_table_privilege(
    'authenticated', 'public.mtp_tasks', 'SELECT'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.mtp_import_claim(bytea,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Packet A changed an existing L0b grant';
  end if;
end;
$$;
