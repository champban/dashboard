\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002')
on conflict do nothing;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from pg_catalog.pg_tables
   where schemaname = 'public' and tablename in (
     'mtp_task_dependencies','mtp_task_external_refs','mtp_mutation_receipts'
   );
  if v_count <> 3 then raise exception 'expected three L1A tables, got %', v_count; end if;

  if exists (
    select 1 from (values
      ('mtp_task_dependencies'),('mtp_task_external_refs'),('mtp_mutation_receipts')
    ) as t(table_name)
    where not exists (
      select 1 from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t.table_name and c.relrowsecurity
    )
  ) then raise exception 'L1A table lacks RLS'; end if;

  select count(*) into v_count from information_schema.columns
   where table_schema = 'public' and table_name = 'mtp_tasks'
     and column_name in (
       'record_origin','description','start_date','assignee','project','progress',
       'recurrence_rule','is_recurring','location_text','task_notes','pinned',
       'original_due_date','delay_label','milestone','milestone_at','completed_at',
       'source_created_at','renewed_from_task_id'
     );
  if v_count <> 18 then raise exception 'task operational column set incomplete: %', v_count; end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='mtp_event_windows'
       and column_name='id' and data_type='uuid' and is_nullable='NO'
  ) then raise exception 'event window stable UUID missing'; end if;

  if exists (
    select 1 from (values ('anon'),('service_role')) as r(role_name)
    cross join (values
      ('mtp_task_dependencies'),('mtp_task_external_refs'),('mtp_mutation_receipts')
    ) as t(table_name)
    cross join (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
      ('REFERENCES'),('TRIGGER'),('MAINTAIN')
    ) as p(privilege_name)
    where pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,p.privilege_name)
  ) then raise exception 'anon/service_role L1A table privilege leaked'; end if;

  if exists (
    select 1 from (values
      ('mtp_tasks'),('mtp_subtasks'),('mtp_events'),('mtp_event_windows'),
      ('mtp_task_attachments'),('mtp_task_dependencies'),
      ('mtp_task_external_refs'),('mtp_mutation_receipts')
    ) as t(table_name)
    where pg_catalog.has_table_privilege(
      'authenticated','public.'||t.table_name,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    )
  ) then raise exception 'authenticated direct L1A table write leaked'; end if;

  if not pg_catalog.has_table_privilege('authenticated','public.mtp_task_dependencies','SELECT')
     or not pg_catalog.has_table_privilege('authenticated','public.mtp_task_external_refs','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.mtp_mutation_receipts','SELECT') then
    raise exception 'L1A read privilege matrix mismatch';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'mtp_task_create_v1','mtp_task_update_v1','mtp_task_delete_v1'
    ) and (p.prosecdef
      or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('public',p.oid,'EXECUTE'))
  ) then raise exception 'public L1A wrapper privilege/security mismatch'; end if;

  select count(*) into v_count from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'mtp_task_create_v1','mtp_task_update_v1','mtp_task_delete_v1'
  ) and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE');
  if v_count <> 3 then raise exception 'authenticated wrapper execute mismatch: %', v_count; end if;

  select count(*) into v_count from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in (
    'mtp_l1_task_create','mtp_l1_task_update','mtp_l1_task_delete'
  ) and p.prosecdef
    and p.proconfig @> array['search_path=""']
    and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('public',p.oid,'EXECUTE');
  if v_count <> 3 then raise exception 'private L1A core security mismatch: %', v_count; end if;
end;
$$;

-- Direct writes remain impossible even for an authenticated owner.
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$
begin
  begin
    insert into public.mtp_tasks(
      owner_id,task_kind,source_key,source_id_legacy,title,record_origin,content_hash
    ) values (
      '10000000-0000-4000-8000-000000000001','personal','forged','forged','forged',
      'direct',pg_catalog.decode(repeat('00',32),'hex')
    );
    raise exception 'authenticated direct insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.mtp_task_create_v1(
  '11000000-0000-4000-8000-000000000001',
  'work',
  '{"title":"L1 source task","status_text":"todo","category":"Other","priority":"High","due_date":"2026-08-31","description":"contract fixture","start_date":"2026-08-24","assignee":"Owner","project":"L1","progress":10,"is_recurring":false,"pinned":true,"milestone":true}'::jsonb,
  'aaaaaaaa-0000-4000-8000-000000000001'
) as create_result \gset
select pg_catalog.set_config('mtp.test.create_result', :'create_result', false);

-- Identical retry returns the stored receipt and does not create a second row.
select public.mtp_task_create_v1(
  '11000000-0000-4000-8000-000000000001',
  'work',
  '{"title":"L1 source task","status_text":"todo","category":"Other","priority":"High","due_date":"2026-08-31","description":"contract fixture","start_date":"2026-08-24","assignee":"Owner","project":"L1","progress":10,"is_recurring":false,"pinned":true,"milestone":true}'::jsonb,
  'aaaaaaaa-0000-4000-8000-000000000001'
) as create_retry_result \gset
select pg_catalog.set_config('mtp.test.create_retry_result', :'create_retry_result', false);

do $$
begin
  begin
    perform public.mtp_task_create_v1(
      '11000000-0000-4000-8000-000000000001','work',
      '{"title":"different request"}'::jsonb,
      'aaaaaaaa-0000-4000-8000-000000000001'
    );
    raise exception 'conflicting idempotency reuse unexpectedly succeeded';
  exception when sqlstate 'L1I01' then null;
  end;
  begin
    perform public.mtp_task_create_v1(
      '11000000-0000-4000-8000-000000000009','personal',
      '{"title":"invalid","progress":101}'::jsonb,
      'aaaaaaaa-0000-4000-8000-000000000009'
    );
    raise exception 'invalid progress unexpectedly succeeded';
  exception when sqlstate 'L1P01' then null;
  end;
  begin
    perform public.mtp_task_create_v1(
      '11000000-0000-4000-8000-000000000010','personal',
      '{"title":"invalid","owner_id":"20000000-0000-4000-8000-000000000002"}'::jsonb,
      'aaaaaaaa-0000-4000-8000-000000000010'
    );
    raise exception 'unknown/forged owner field unexpectedly succeeded';
  exception when sqlstate 'L1P01' then null;
  end;
  begin
    perform public.mtp_task_create_v1(
      null,'personal','{"title":"invalid"}'::jsonb,
      'aaaaaaaa-0000-4000-8000-000000000011'
    );
    raise exception 'null canonical task UUID unexpectedly succeeded';
  exception when sqlstate 'L1P01' then null;
  end;
  begin
    perform public.mtp_task_create_v1(
      '11000000-0000-4000-8000-000000000012','personal',
      '{"title":"invalid","pinned":null}'::jsonb,
      'aaaaaaaa-0000-4000-8000-000000000012'
    );
    raise exception 'null non-nullable boolean unexpectedly succeeded';
  exception when sqlstate 'L1P01' then null;
  end;
end;
$$;

select public.mtp_task_update_v1(
  '11000000-0000-4000-8000-000000000001',1,
  '{"status_text":"inprogress","progress":55,"project":"L1A"}'::jsonb,
  'bbbbbbbb-0000-4000-8000-000000000001'
) as update_result \gset
select pg_catalog.set_config('mtp.test.update_result', :'update_result', false);

select public.mtp_task_update_v1(
  '11000000-0000-4000-8000-000000000001',1,
  '{"status_text":"inprogress","progress":55,"project":"L1A"}'::jsonb,
  'bbbbbbbb-0000-4000-8000-000000000001'
) as update_retry_result \gset
select pg_catalog.set_config('mtp.test.update_retry_result', :'update_retry_result', false);

do $$
begin
  begin
    perform public.mtp_task_create_v1(
      '11000000-0000-4000-8000-000000000001','personal',
      '{"title":"cross-owner UUID collision"}'::jsonb,
      'cccccccc-0000-4000-8000-000000000002'
    );
    raise exception 'cross-owner UUID collision unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mtp_task_update_v1(
      '11000000-0000-4000-8000-000000000001',1,
      '{"progress":60}'::jsonb,
      'bbbbbbbb-0000-4000-8000-000000000002'
    );
    raise exception 'stale update unexpectedly succeeded';
  exception when sqlstate 'L1V01' then null;
  end;
end;
$$;

reset role;

do $$
declare
  v_task public.mtp_tasks;
begin
  select * into strict v_task from public.mtp_tasks
   where owner_id='10000000-0000-4000-8000-000000000001'
     and id='11000000-0000-4000-8000-000000000001';
  if v_task.record_origin <> 'direct' or v_task.first_seen_batch_id is not null
     or v_task.last_seen_batch_id is not null or v_task.version <> 2
     or v_task.progress <> 55 or v_task.project <> 'L1A'
     or v_task.status_text <> 'inprogress' then
    raise exception 'direct task row/update mismatch';
  end if;
  if pg_catalog.current_setting('mtp.test.create_result')::jsonb
       <> pg_catalog.current_setting('mtp.test.create_retry_result')::jsonb then
    raise exception 'create retry result drift';
  end if;
  if pg_catalog.current_setting('mtp.test.update_result')::jsonb
       <> pg_catalog.current_setting('mtp.test.update_retry_result')::jsonb then
    raise exception 'update retry result drift';
  end if;
  if (select count(*) from public.mtp_tasks where id='11000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'idempotent create duplicated task';
  end if;
  if (select count(*) from public.mtp_mutation_receipts
       where owner_id='10000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'failed/retried mutations leaked receipts';
  end if;
end;
$$;

-- The other owner cannot read or mutate the task and receives the same bounded
-- not-available result as a nonexistent entity.
select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
set role authenticated;
select count(*) as other_owner_visible from public.mtp_tasks
 where id='11000000-0000-4000-8000-000000000001' \gset
select pg_catalog.set_config('mtp.test.other_owner_visible', :'other_owner_visible', false);
do $$
begin
  begin
    perform public.mtp_task_update_v1(
      '11000000-0000-4000-8000-000000000001',2,
      '{"progress":99}'::jsonb,
      'cccccccc-0000-4000-8000-000000000001'
    );
    raise exception 'cross-owner update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  if pg_catalog.current_setting('mtp.test.other_owner_visible')::integer <> 0 then
    raise exception 'cross-owner SELECT exposed task';
  end if;
  if exists (select 1 from public.mtp_mutation_receipts
              where owner_id='20000000-0000-4000-8000-000000000002') then
    raise exception 'cross-owner failed request retained receipt';
  end if;
end;
$$;

-- Dependency graph rejects self-edges and cycles. Rows are inserted as the
-- database owner because dependency mutation RPCs are outside this first slice.
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.mtp_task_create_v1(
  '11000000-0000-4000-8000-000000000002','personal','{"title":"Dependency B"}'::jsonb,
  'dddddddd-0000-4000-8000-000000000002'
);
select public.mtp_task_create_v1(
  '11000000-0000-4000-8000-000000000003','personal','{"title":"Dependency C"}'::jsonb,
  'dddddddd-0000-4000-8000-000000000003'
);
reset role;

insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id,ordinal)
values
 ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',0),
 ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003',0);

do $$
begin
  begin
    insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id)
    values ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001');
    raise exception 'dependency cycle unexpectedly succeeded';
  exception when sqlstate 'L1D01' then null;
  end;
  begin
    insert into public.mtp_task_dependencies(owner_id,task_id,depends_on_task_id)
    values ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003');
    raise exception 'dependency self-edge unexpectedly succeeded';
  exception when sqlstate 'L1D01' then null;
  end;
end;
$$;

-- Event-window UUID survives reorder/update; ordinal is no longer identity.
insert into public.mtp_events(
  id,owner_id,source_key,source_id_legacy,title,record_origin,
  first_seen_batch_id,last_seen_batch_id,content_hash
) values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','L1E:fixture','fixture','Event fixture',
  'direct',null,null,pg_catalog.decode(repeat('11',32),'hex')
);
insert into public.mtp_event_windows(
  owner_id,event_id,ordinal,window_start,window_end,record_origin,
  first_seen_batch_id,last_seen_batch_id,content_hash
) values (
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',0,'2026-08-24','2026-08-25',
  'direct',null,null,pg_catalog.decode(repeat('22',32),'hex')
) returning id as window_id \gset
select pg_catalog.set_config('mtp.test.window_id', :'window_id', false);
update public.mtp_event_windows set ordinal=5,id=extensions.gen_random_uuid()
 where owner_id='10000000-0000-4000-8000-000000000001'
   and event_id='12000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.mtp_event_windows
     where owner_id='10000000-0000-4000-8000-000000000001'
       and event_id='12000000-0000-4000-8000-000000000001'
       and ordinal=5
       and id=pg_catalog.current_setting('mtp.test.window_id')::uuid
  ) then raise exception 'event window stable UUID changed during reorder'; end if;
end;
$$;

-- Store only a digest of the random opaque reference.
insert into public.mtp_task_external_refs(owner_id,task_id,provider,opaque_ref_hash)
values (
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001','line',
  extensions.digest(pg_catalog.convert_to('opaque-fixture-token','UTF8'),'sha256')
);

-- Tombstone and retry. No hard delete occurs.
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.mtp_task_delete_v1(
  '11000000-0000-4000-8000-000000000001',2,
  'eeeeeeee-0000-4000-8000-000000000001'
) as delete_result \gset
select pg_catalog.set_config('mtp.test.delete_result', :'delete_result', false);
select public.mtp_task_delete_v1(
  '11000000-0000-4000-8000-000000000001',2,
  'eeeeeeee-0000-4000-8000-000000000001'
) as delete_retry_result \gset
select pg_catalog.set_config('mtp.test.delete_retry_result', :'delete_retry_result', false);
reset role;

do $$
declare
  v_task public.mtp_tasks;
begin
  select * into strict v_task from public.mtp_tasks
   where owner_id='10000000-0000-4000-8000-000000000001'
     and id='11000000-0000-4000-8000-000000000001';
  if v_task.is_active or v_task.source_deleted_at is null or v_task.version <> 3 then
    raise exception 'task delete did not create one versioned tombstone';
  end if;
  if pg_catalog.current_setting('mtp.test.delete_result')::jsonb
       <> pg_catalog.current_setting('mtp.test.delete_retry_result')::jsonb then
    raise exception 'delete retry result drift';
  end if;
  if (select count(*) from public.mtp_mutation_receipts
       where owner_id='10000000-0000-4000-8000-000000000001'
         and entity_id='11000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'task mutation receipt count mismatch';
  end if;
end;
$$;

\echo 'L1A PostgreSQL 17 schema / RLS / idempotency / conflict gate: PASS'
