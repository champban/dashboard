\set ON_ERROR_STOP on

do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_catalog.pg_tables
   where schemaname='public' and tablename in (
     'mtp_notes','mtp_note_assets','mtp_planner_settings'
   );
  if v_count<>3 then raise exception 'expected three L1B tables, got %',v_count; end if;
  if exists (
    select 1 from (values('mtp_notes'),('mtp_note_assets'),('mtp_planner_settings')) as t(name)
     where not exists (
       select 1 from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=t.name and c.relrowsecurity
     )
  ) then raise exception 'L1B table lacks RLS'; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='mtp_event_windows'
       and column_name='display_ordinal' and is_nullable='NO'
  ) then raise exception 'event display ordinal missing'; end if;

  if exists (
    select 1 from (values('anon'),('service_role')) as r(role_name)
    cross join (values('mtp_notes'),('mtp_note_assets'),('mtp_planner_settings')) as t(table_name)
    cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) as p(privilege_name)
     where pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,p.privilege_name)
  ) then raise exception 'anon/service_role L1B table privilege leaked'; end if;
  if exists (
    select 1 from (values('mtp_notes'),('mtp_note_assets'),('mtp_planner_settings')) as t(table_name)
     where pg_catalog.has_table_privilege(
       'authenticated','public.'||t.table_name,
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  ) then raise exception 'authenticated L1B direct table write leaked'; end if;
  if not pg_catalog.has_table_privilege('authenticated','public.mtp_notes','SELECT')
     or not pg_catalog.has_table_privilege('authenticated','public.mtp_note_assets','SELECT')
     or not pg_catalog.has_table_privilege('authenticated','public.mtp_planner_settings','SELECT') then
    raise exception 'authenticated L1B read privilege missing';
  end if;

  select count(*) into v_count from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
     'mtp_task_children_replace_v1','mtp_event_put_v1','mtp_event_delete_v1',
     'mtp_note_put_v1','mtp_note_delete_v1','mtp_settings_update_v1',
     'mtp_attachment_put_v1','mtp_attachment_delete_v1'
   ) and not p.prosecdef
     and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
     and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
     and not pg_catalog.has_function_privilege('public',p.oid,'EXECUTE');
  if v_count<>8 then raise exception 'L1B wrapper privilege mismatch: %',v_count; end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname='mtp_l1b_apply' and p.prosecdef
       and p.proconfig @> array['search_path=""']
       and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
       and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
       and not pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')
  ) then raise exception 'L1B private core security mismatch'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname like 'mtp_l1b_%'
       and p.proname<>'mtp_l1b_apply'
       and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) then raise exception 'authenticated can execute L1B helper directly'; end if;

  if not exists (
    select 1 from storage.buckets
     where id='mtp-private' and public=false and file_size_limit=5242880
  ) then raise exception 'private bucket contract mismatch'; end if;
  select count(*) into v_count from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid=p.polrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='storage' and c.relname='objects'
     and p.polname like 'mtp_private_owner_%';
  if v_count<>4 then raise exception 'private object policy count mismatch: %',v_count; end if;
end;
$$;

-- Authenticated owners cannot bypass RPCs.
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$
begin
  begin
    insert into public.mtp_notes(
      id,owner_id,title,content_html,content_hash
    ) values (
      '13000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000001','forged','',
      pg_catalog.decode(repeat('00',32),'hex')
    );
    raise exception 'authenticated direct note insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Task aggregate children/dependencies are atomic, versioned and idempotent.
select public.mtp_task_children_replace_v1(
  '11000000-0000-4000-8000-000000000002',1,
  '{"subtasks":[{"id":"11100000-0000-4000-8000-000000000001","text":"Stable child","done":false,"ordinal":0}],"dependencies":[{"task_id":"11000000-0000-4000-8000-000000000003","ordinal":0}]}'::jsonb,
  'f1000000-0000-4000-8000-000000000001'
) as children_result \gset
select pg_catalog.set_config('mtp.l1b.children_result',:'children_result',false);
select public.mtp_task_children_replace_v1(
  '11000000-0000-4000-8000-000000000002',1,
  '{"subtasks":[{"id":"11100000-0000-4000-8000-000000000001","text":"Stable child","done":false,"ordinal":0}],"dependencies":[{"task_id":"11000000-0000-4000-8000-000000000003","ordinal":0}]}'::jsonb,
  'f1000000-0000-4000-8000-000000000001'
) as children_retry_result \gset
select pg_catalog.set_config('mtp.l1b.children_retry_result',:'children_retry_result',false);
do $$
begin
  begin
    perform public.mtp_task_children_replace_v1(
      '11000000-0000-4000-8000-000000000002',1,
      '{"subtasks":[],"dependencies":[]}'::jsonb,
      'f1000000-0000-4000-8000-000000000002'
    );
    raise exception 'stale task aggregate replace unexpectedly succeeded';
  exception when sqlstate 'L1V01' then null;
  end;
end;
$$;
select public.mtp_task_children_replace_v1(
  '11000000-0000-4000-8000-000000000002',2,
  '{"subtasks":[],"dependencies":[]}'::jsonb,
  'f1000000-0000-4000-8000-000000000003'
) as children_tombstone_result \gset

-- Event put replaces windows by stable UUID and display order, never ordinal identity.
select public.mtp_event_put_v1(
  '12000000-0000-4000-8000-000000000010',null,
  '{"title":"L1B event","event_type":"work","category":"work","color_hex":"#336699","note_text":"fixture","windows":[{"id":"12100000-0000-4000-8000-000000000001","start":"2026-09-01","end":"2026-09-02","description":"first","location":{"name":"Bangkok"},"display_ordinal":0},{"id":"12100000-0000-4000-8000-000000000002","start":"2026-09-10","end":"2026-09-11","description":"second","display_ordinal":1}]}'::jsonb,
  'f2000000-0000-4000-8000-000000000001'
) as event_create_result \gset
select pg_catalog.set_config('mtp.l1b.event_create_result',:'event_create_result',false);
select public.mtp_event_put_v1(
  '12000000-0000-4000-8000-000000000010',null,
  '{"title":"L1B event","event_type":"work","category":"work","color_hex":"#336699","note_text":"fixture","windows":[{"id":"12100000-0000-4000-8000-000000000001","start":"2026-09-01","end":"2026-09-02","description":"first","location":{"name":"Bangkok"},"display_ordinal":0},{"id":"12100000-0000-4000-8000-000000000002","start":"2026-09-10","end":"2026-09-11","description":"second","display_ordinal":1}]}'::jsonb,
  'f2000000-0000-4000-8000-000000000001'
) as event_create_retry_result \gset
select pg_catalog.set_config('mtp.l1b.event_create_retry_result',:'event_create_retry_result',false);
select public.mtp_event_put_v1(
  '12000000-0000-4000-8000-000000000010',1,
  '{"title":"L1B event updated","event_type":"work","category":"work","color_hex":"#336699","note_text":"fixture","windows":[{"id":"12100000-0000-4000-8000-000000000001","start":"2026-09-03","end":"2026-09-04","description":"first moved","location":{"name":"Bangkok"},"display_ordinal":1}]}'::jsonb,
  'f2000000-0000-4000-8000-000000000002'
) as event_update_result \gset

-- Notes reject executable/base64 content and preserve receipt/version semantics.
select public.mtp_note_put_v1(
  '13000000-0000-4000-8000-000000000001',null,
  '{"title":"Planner note","emoji":"📝","content_html":"<p>Safe note</p>"}'::jsonb,
  'f3000000-0000-4000-8000-000000000001'
) as note_create_result \gset
select pg_catalog.set_config('mtp.l1b.note_create_result',:'note_create_result',false);
select public.mtp_note_put_v1(
  '13000000-0000-4000-8000-000000000001',null,
  '{"title":"Planner note","emoji":"📝","content_html":"<p>Safe note</p>"}'::jsonb,
  'f3000000-0000-4000-8000-000000000001'
) as note_create_retry_result \gset
select pg_catalog.set_config('mtp.l1b.note_create_retry_result',:'note_create_retry_result',false);
do $$
begin
  begin
    perform public.mtp_note_put_v1(
      '13000000-0000-4000-8000-000000000002',null,
      '{"title":"unsafe","content_html":"<img src=data:image/png;base64,AAA>"}'::jsonb,
      'f3000000-0000-4000-8000-000000000002'
    );
    raise exception 'embedded note binary unexpectedly accepted';
  exception when sqlstate 'L1P01' then null;
  end;
  begin
    perform public.mtp_note_put_v1(
      '13000000-0000-4000-8000-000000000003',null,
      '{"title":"unsafe","content_html":"<script>alert(1)</script>"}'::jsonb,
      'f3000000-0000-4000-8000-000000000003'
    );
    raise exception 'active note content unexpectedly accepted';
  exception when sqlstate 'L1P01' then null;
  end;
end;
$$;

-- Settings are allowlisted and reject provider/local/secret fields recursively.
select public.mtp_settings_update_v1(
  null,
  '{"profile":{"name":"Owner","emoji":"👤"},"config":{"themeId":"claude","lang":"EN","gsyncAuto":true},"customTabs":[],"eventTypes":[],"calViews":[],"ganttViews":[],"timelineViews":[],"groupColors":{},"tabOrder":[],"widgetOrder":[]}'::jsonb,
  'f4000000-0000-4000-8000-000000000001'
) as settings_create_result \gset
do $$
begin
  begin
    perform public.mtp_settings_update_v1(
      1,'{"config":{"googleClientId":"forbidden"}}'::jsonb,
      'f4000000-0000-4000-8000-000000000002'
    );
    raise exception 'provider setting unexpectedly accepted';
  exception when sqlstate 'L1P01' then null;
  end;
  begin
    perform public.mtp_settings_update_v1(
      1,'{"customTabs":[{"name":"x","accessToken":"forbidden"}]}'::jsonb,
      'f4000000-0000-4000-8000-000000000003'
    );
    raise exception 'nested secret-like field unexpectedly accepted';
  exception when sqlstate 'L1P01' then null;
  end;
end;
$$;
select public.mtp_settings_update_v1(
  1,
  '{"profile":{"name":"Owner updated","emoji":"👤"},"config":{"themeId":"sage","lang":"TH","gsyncAuto":true},"customTabs":[],"eventTypes":[],"calViews":[],"ganttViews":[],"timelineViews":[],"groupColors":{},"tabOrder":[],"widgetOrder":[]}'::jsonb,
  'f4000000-0000-4000-8000-000000000004'
) as settings_update_result \gset

-- Task files and note images bind metadata to exact private owner paths.
select public.mtp_attachment_put_v1(
  '14000000-0000-4000-8000-000000000001',null,
  '{"parent_kind":"task","parent_id":"11000000-0000-4000-8000-000000000002","display_ordinal":0,"attachment_kind":"file_ref","display_name":"plan.pdf","mime_type":"application/pdf","byte_size":128,"storage_bucket":"mtp-private","storage_path":"10000000-0000-4000-8000-000000000001/task/11000000-0000-4000-8000-000000000002/14000000-0000-4000-8000-000000000001/plan.pdf","content_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
  'f5000000-0000-4000-8000-000000000001'
) as task_attachment_result \gset
select public.mtp_attachment_put_v1(
  '14000000-0000-4000-8000-000000000004',null,
  '{"parent_kind":"task","parent_id":"11000000-0000-4000-8000-000000000002","display_ordinal":1,"attachment_kind":"link","display_name":"Reference","href":"https://example.com/reference","mime_type":"text/html"}'::jsonb,
  'f5000000-0000-4000-8000-000000000004'
) as task_link_result \gset
select public.mtp_attachment_put_v1(
  '14000000-0000-4000-8000-000000000002',null,
  '{"parent_kind":"note","parent_id":"13000000-0000-4000-8000-000000000001","display_ordinal":0,"display_name":"note.png","mime_type":"image/png","byte_size":256,"storage_bucket":"mtp-private","storage_path":"10000000-0000-4000-8000-000000000001/note/13000000-0000-4000-8000-000000000001/14000000-0000-4000-8000-000000000002/note.png","content_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb,
  'f5000000-0000-4000-8000-000000000002'
) as note_asset_result \gset
do $$
begin
  begin
    perform public.mtp_attachment_put_v1(
      '14000000-0000-4000-8000-000000000003',null,
      '{"parent_kind":"note","parent_id":"13000000-0000-4000-8000-000000000001","display_ordinal":0,"display_name":"bad.png","mime_type":"image/png","byte_size":10,"storage_bucket":"mtp-private","storage_path":"20000000-0000-4000-8000-000000000002/note/13000000-0000-4000-8000-000000000001/14000000-0000-4000-8000-000000000003/bad.png","content_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb,
      'f5000000-0000-4000-8000-000000000003'
    );
    raise exception 'cross-owner storage path unexpectedly accepted';
  exception when sqlstate 'L1P01' then null;
  end;
end;
$$;

-- Storage RLS allows exactly the current owner prefix.
insert into storage.objects(bucket_id,name,owner_id) values(
  'mtp-private',
  '10000000-0000-4000-8000-000000000001/note/13000000-0000-4000-8000-000000000001/14000000-0000-4000-8000-000000000002/note.png',
  '10000000-0000-4000-8000-000000000001'
);
do $$
begin
  begin
    insert into storage.objects(bucket_id,name,owner_id) values(
      'mtp-private',
      '20000000-0000-4000-8000-000000000002/note/13000000-0000-4000-8000-000000000001/14000000-0000-4000-8000-000000000002/note.png',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-owner Storage insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.mtp_attachment_delete_v1(
  '14000000-0000-4000-8000-000000000001',1,'task',
  'f6000000-0000-4000-8000-000000000001'
);
select public.mtp_note_delete_v1(
  '13000000-0000-4000-8000-000000000001',1,
  'f6000000-0000-4000-8000-000000000002'
);
select public.mtp_event_delete_v1(
  '12000000-0000-4000-8000-000000000010',2,
  'f6000000-0000-4000-8000-000000000003'
);
reset role;

do $$
begin
  if pg_catalog.current_setting('mtp.l1b.children_result')::jsonb
       <> pg_catalog.current_setting('mtp.l1b.children_retry_result')::jsonb then
    raise exception 'children retry result drift';
  end if;
  if pg_catalog.current_setting('mtp.l1b.event_create_result')::jsonb
       <> pg_catalog.current_setting('mtp.l1b.event_create_retry_result')::jsonb then
    raise exception 'event retry result drift';
  end if;
  if pg_catalog.current_setting('mtp.l1b.note_create_result')::jsonb
       <> pg_catalog.current_setting('mtp.l1b.note_create_retry_result')::jsonb then
    raise exception 'note retry result drift';
  end if;
  if not exists(
    select 1 from public.mtp_subtasks
     where id='11100000-0000-4000-8000-000000000001'
       and owner_id='10000000-0000-4000-8000-000000000001'
       and record_origin='direct' and not is_active and source_deleted_at is not null
  ) then raise exception 'omitted direct subtask was not tombstoned'; end if;
  if exists(
    select 1 from public.mtp_task_dependencies
     where owner_id='10000000-0000-4000-8000-000000000001'
       and task_id='11000000-0000-4000-8000-000000000002' and is_active
  ) then raise exception 'omitted dependency stayed active'; end if;
  if not exists(
    select 1 from public.mtp_event_windows
     where id='12100000-0000-4000-8000-000000000001'
       and display_ordinal=1 and is_active=false and source_deleted_at is not null
  ) then raise exception 'event child did not preserve identity/tombstone on event delete'; end if;
  if not exists(
    select 1 from public.mtp_event_windows
     where id='12100000-0000-4000-8000-000000000002'
       and is_active=false and source_deleted_at is not null
  ) then raise exception 'omitted event window was not tombstoned'; end if;
  if not exists(
    select 1 from public.mtp_notes
     where id='13000000-0000-4000-8000-000000000001'
       and is_active=false and source_deleted_at is not null and version=2
  ) then raise exception 'note tombstone/version mismatch'; end if;
  if not exists(
    select 1 from public.mtp_note_assets
     where id='14000000-0000-4000-8000-000000000002'
       and is_active=false and source_deleted_at is not null
  ) then raise exception 'note delete did not tombstone asset metadata'; end if;
  if not exists(
    select 1 from public.mtp_task_attachments
     where id='14000000-0000-4000-8000-000000000001'
       and is_active=false and source_deleted_at is not null
  ) then raise exception 'task attachment metadata delete was not a tombstone'; end if;
  if not exists(
    select 1 from public.mtp_task_attachments
     where id='14000000-0000-4000-8000-000000000004'
       and attachment_kind='link' and href='https://example.com/reference'
       and storage_bucket is null and storage_path is null and content_sha256 is null
  ) then raise exception 'HTTPS link attachment incorrectly required private Storage'; end if;
  if (select version from public.mtp_planner_settings
       where owner_id='10000000-0000-4000-8000-000000000001')<>2 then
    raise exception 'settings version mismatch';
  end if;
  if exists(
    select 1 from public.mtp_mutation_receipts
     where status<>'applied' or result is null or applied_at is null
  ) then raise exception 'incomplete L1B receipt leaked'; end if;
end;
$$;

-- Second owner sees no first-owner planner data and gets bounded denials.
select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
set role authenticated;
select count(*) as other_notes from public.mtp_notes \gset
select count(*) as other_settings from public.mtp_planner_settings \gset
select pg_catalog.set_config('mtp.l1b.other_notes',:'other_notes',false);
select pg_catalog.set_config('mtp.l1b.other_settings',:'other_settings',false);
do $$
begin
  if pg_catalog.current_setting('mtp.l1b.other_notes')::integer<>0
     or pg_catalog.current_setting('mtp.l1b.other_settings')::integer<>0 then
    raise exception 'cross-owner L1B read exposed rows';
  end if;
  begin
    perform public.mtp_task_children_replace_v1(
      '11000000-0000-4000-8000-000000000002',3,
      '{"subtasks":[],"dependencies":[]}'::jsonb,
      'f7000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-owner task aggregate mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

\echo 'L1B PostgreSQL 17 planner parity / RLS / Storage / conflict gate: PASS'
