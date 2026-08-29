-- L1B full-planner parity source contract.
--
-- THIS IS NOT A MIGRATION. Apply only after the exact L0b migration and the
-- exact L1A source contract in throwaway PostgreSQL 17. Moving these bytes into
-- migrations, applying them, creating Storage resources, activating a client,
-- reconciling owner data or changing authority requires separate exact gates.

-- L1B keeps one selected planner dataset per authenticated owner. Device-local
-- profile registries, file handles, Drive linkage and credentials are excluded.

alter table public.mtp_event_windows
  add column display_ordinal integer;
update public.mtp_event_windows set display_ordinal = ordinal;
alter table public.mtp_event_windows
  alter column display_ordinal set default 0,
  alter column display_ordinal set not null,
  add constraint mtp_event_windows_display_ordinal_check
    check (display_ordinal >= 0);

alter table public.mtp_task_attachments
  add constraint mtp_task_attachments_private_bucket_check check (
    storage_bucket is null or storage_bucket = 'mtp-private'
  ),
  add constraint mtp_task_attachments_owner_path_check check (
    storage_path is null
    or storage_path like owner_id::text || '/task/' || task_id::text || '/%'
  );

create table public.mtp_notes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  emoji text check (emoji is null or char_length(emoji) <= 32),
  content_html text not null default '' check (char_length(content_html) <= 1000000),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_notes_owner_id_uniq unique (owner_id, id),
  constraint mtp_notes_tombstone_consistent
    check (is_active = (source_deleted_at is null)),
  constraint mtp_notes_no_embedded_binary check (
    content_html !~* '(src|href)[[:space:]]*=[[:space:]]*["'']?[[:space:]]*(data|blob):'
  ),
  constraint mtp_notes_no_active_content check (
    content_html !~* '<[[:space:]]*(script|iframe|object|embed|form|meta|base)([[:space:]>])'
    and content_html !~* 'on[a-z]+[[:space:]]*='
    and content_html !~* 'javascript[[:space:]]*:'
  )
);

create table public.mtp_note_assets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null,
  display_ordinal integer not null default 0 check (display_ordinal >= 0),
  display_name text check (display_name is null or char_length(display_name) <= 300),
  mime_type text not null check (
    mime_type in ('image/jpeg','image/png','image/gif','image/webp')
  ),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  storage_bucket text not null check (storage_bucket = 'mtp-private'),
  storage_path text not null check (char_length(storage_path) between 1 and 1024),
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_note_assets_owner_id_uniq unique (owner_id, id),
  constraint mtp_note_assets_note_fk foreign key (owner_id, note_id)
    references public.mtp_notes(owner_id, id) on delete cascade,
  constraint mtp_note_assets_owner_path_check check (
    storage_path like owner_id::text || '/note/' || note_id::text || '/' || id::text || '/%'
  ),
  constraint mtp_note_assets_tombstone_consistent
    check (is_active = (source_deleted_at is null))
);

create table public.mtp_planner_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null check (pg_catalog.jsonb_typeof(settings) = 'object'),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_planner_settings_size_check
    check (pg_catalog.pg_column_size(settings) <= 1048576)
);

create index mtp_notes_owner_active_idx
  on public.mtp_notes(owner_id, is_active);
create index mtp_note_assets_owner_note_active_idx
  on public.mtp_note_assets(owner_id, note_id, is_active);

alter table public.mtp_mutation_receipts
  drop constraint mtp_mutation_receipts_operation_check,
  add constraint mtp_mutation_receipts_operation_check check (operation in (
    'task.create','task.update','task.delete',
    'task.children.replace','event.put','event.delete',
    'note.put','note.delete','settings.update',
    'attachment.put','attachment.delete'
  ));

create function private.mtp_l1b_touch_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name <> 'mtp_planner_settings' then
    new.id := old.id;
  end if;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  if pg_catalog.to_jsonb(new) - 'version' - 'updated_at'
       is distinct from pg_catalog.to_jsonb(old) - 'version' - 'updated_at' then
    new.version := old.version + 1;
    new.updated_at := pg_catalog.now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger mtp_notes_touch_version
before update on public.mtp_notes
for each row execute function private.mtp_l1b_touch_version();
create trigger mtp_note_assets_touch_version
before update on public.mtp_note_assets
for each row execute function private.mtp_l1b_touch_version();
create trigger mtp_planner_settings_touch_version
before update on public.mtp_planner_settings
for each row execute function private.mtp_l1b_touch_version();

create function private.mtp_l1b_has_forbidden_key(p_value jsonb,p_depth integer)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if p_depth>20 then return true; end if;
  if p_value is null then return false; end if;
  if pg_catalog.jsonb_typeof(p_value)='object' then
    for v_key,v_child in select e.key,e.value from pg_catalog.jsonb_each(p_value) as e loop
      if lower(v_key) in (
        'apikey','api_key','anthropickey','googleapikey','clientsecret',
        'client_secret','accesstoken','access_token','refreshtoken',
        'refresh_token','idtoken','id_token','password','secret','token',
        'googleclientid','msappid','defaultfilepath','defaultfilename'
      ) or private.mtp_l1b_has_forbidden_key(v_child,p_depth+1) then
        return true;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value)='array' then
    for v_child in select value from pg_catalog.jsonb_array_elements(p_value) loop
      if private.mtp_l1b_has_forbidden_key(v_child,p_depth+1) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create function private.mtp_l1b_validate_settings(p_settings jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object'
     or pg_catalog.pg_column_size(p_settings) > 1048576 then
    raise exception 'settings_invalid' using errcode = 'L1P01';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_settings) loop
    if not (v_key = any (array[
      'profile','config','customTabs','eventTypes','calViews','ganttViews',
      'timelineViews','groupColors','tabOrder','widgetOrder'
    ]::text[])) then
      raise exception 'settings_unknown_field' using errcode = 'L1P01';
    end if;
  end loop;
  if p_settings ? 'profile' then
    if pg_catalog.jsonb_typeof(p_settings->'profile') <> 'object'
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(p_settings->'profile') as k
          where k not in ('name','emoji')
       )
       or char_length(coalesce(p_settings->'profile'->>'name','')) > 200
       or char_length(coalesce(p_settings->'profile'->>'emoji','')) > 32 then
      raise exception 'settings_profile_invalid' using errcode = 'L1P01';
    end if;
  end if;
  if p_settings ? 'config' then
    if pg_catalog.jsonb_typeof(p_settings->'config') <> 'object'
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(p_settings->'config') as k
          where k not in (
            'themeId','fontFamily','fontSize','lang','ganttZoom','ganttWeeks',
            'ganttDates','ganttBarLines','ganttCustomStart','ganttCustomDur',
            'ganttCustomUnit','timelineFontSize','timelineFontFamily',
            'timelineTheme','timelineDetails','timelineCompact',
            'timelineActiveView','ganttActiveView','gsyncAuto','defaultTab',
            'autoSavePrompt','defaultStartFolder','backupReminderWeeks',
            'lineShareSubtasks','lineShareAttachmentLinks','calFontSize',
            'calFontFamily'
          )
       ) then
      raise exception 'settings_config_invalid' using errcode = 'L1P01';
    end if;
  end if;
  foreach v_key in array array[
    'customTabs','eventTypes','calViews','ganttViews','timelineViews',
    'tabOrder','widgetOrder'
  ]::text[] loop
    if p_settings ? v_key and pg_catalog.jsonb_typeof(p_settings->v_key) <> 'array' then
      raise exception 'settings_array_invalid' using errcode = 'L1P01';
    end if;
  end loop;
  if p_settings ? 'groupColors'
     and pg_catalog.jsonb_typeof(p_settings->'groupColors') <> 'object' then
    raise exception 'settings_group_colors_invalid' using errcode = 'L1P01';
  end if;
  if private.mtp_l1b_has_forbidden_key(p_settings,0) then
    raise exception 'settings_secret_or_local_field' using errcode = 'L1P01';
  end if;
end;
$$;

create function private.mtp_l1b_validate_note(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_payload) as k
        where k not in ('title','emoji','content_html')
     )
     or pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
     or char_length(pg_catalog.btrim(p_payload->>'title')) not between 1 and 500
     or (p_payload ? 'emoji' and p_payload->'emoji' <> 'null'::jsonb
         and (pg_catalog.jsonb_typeof(p_payload->'emoji') <> 'string'
              or char_length(p_payload->>'emoji') > 32))
     or (p_payload ? 'content_html'
         and (pg_catalog.jsonb_typeof(p_payload->'content_html') <> 'string'
              or char_length(p_payload->>'content_html') > 1000000)) then
    raise exception 'note_payload_invalid' using errcode = 'L1P01';
  end if;
  if coalesce(p_payload->>'content_html','') ~* '(src|href)[[:space:]]*=[[:space:]]*["'']?[[:space:]]*(data|blob):'
     or coalesce(p_payload->>'content_html','') ~* '<[[:space:]]*(script|iframe|object|embed|form|meta|base)([[:space:]>])'
     or coalesce(p_payload->>'content_html','') ~* 'on[a-z]+[[:space:]]*='
     or coalesce(p_payload->>'content_html','') ~* 'javascript[[:space:]]*:' then
    raise exception 'note_active_or_embedded_content' using errcode = 'L1P01';
  end if;
end;
$$;

create function private.mtp_l1b_receipt_begin(
  p_owner uuid,
  p_key uuid,
  p_operation text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_request jsonb
)
returns table (is_retry boolean, request_hash bytea, prior_result jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hash bytea := private.mtp_l1_request_hash(p_request);
  v_prior_hash bytea;
  v_result jsonb;
begin
  if p_key is null then
    raise exception 'idempotency_key_required' using errcode = 'L1P01';
  end if;
  insert into public.mtp_mutation_receipts(
    owner_id,idempotency_key,operation,entity_id,request_hash,expected_version
  ) values (p_owner,p_key,p_operation,p_entity_id,v_hash,p_expected_version)
  on conflict do nothing;
  if found then
    return query select false,v_hash,null::jsonb;
    return;
  end if;
  select r.request_hash,r.result into v_prior_hash,v_result
    from public.mtp_mutation_receipts as r
   where r.owner_id=p_owner and r.idempotency_key=p_key
   for update;
  if v_prior_hash is distinct from v_hash then
    raise exception 'idempotency_key_reused' using errcode = 'L1I01';
  end if;
  if v_result is null then
    raise exception 'idempotency_receipt_incomplete' using errcode = 'L1I01';
  end if;
  return query select true,v_hash,v_result;
end;
$$;

create function private.mtp_l1b_receipt_finish(
  p_owner uuid,
  p_key uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.mtp_mutation_receipts set
    status='applied',result=p_result,applied_at=pg_catalog.now()
   where owner_id=p_owner and idempotency_key=p_key;
  return p_result;
end;
$$;

create function private.mtp_l1b_task_children_replace(
  p_owner uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_hash bytea
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.mtp_tasks;
  v_item jsonb;
  v_id uuid;
  v_dep uuid;
  v_count integer;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_payload) as k where k not in ('subtasks','dependencies'))
     or pg_catalog.jsonb_typeof(coalesce(p_payload->'subtasks','[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_payload->'dependencies','[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_payload->'subtasks','[]'::jsonb)) > 20
     or pg_catalog.jsonb_array_length(coalesce(p_payload->'dependencies','[]'::jsonb)) > 50 then
    raise exception 'task_children_payload_invalid' using errcode = 'L1P01';
  end if;
  select * into v_task from public.mtp_tasks
   where owner_id=p_owner and id=p_task_id and is_active for update;
  if not found then raise exception 'task_not_available' using errcode='42501'; end if;
  if v_task.version <> p_expected_version then
    raise exception 'task_version_conflict' using errcode='L1V01';
  end if;

  create temporary table if not exists mtp_l1b_child_ids(id uuid primary key) on commit drop;
  truncate table mtp_l1b_child_ids;
  for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(p_payload->'subtasks','[]'::jsonb)) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_item) as k where k not in ('id','text','done','ordinal'))
       or (v_item->>'id') is null
       or pg_catalog.jsonb_typeof(v_item->'text') <> 'string'
       or char_length(v_item->>'text') > 4000
       or pg_catalog.jsonb_typeof(v_item->'done') <> 'boolean'
       or (v_item->>'ordinal') !~ '^[0-9]+$' then
      raise exception 'subtask_payload_invalid' using errcode='L1P01';
    end if;
    v_id := (v_item->>'id')::uuid;
    begin
      insert into mtp_l1b_child_ids values(v_id);
    exception when unique_violation then
      raise exception 'subtask_duplicate_id' using errcode='L1P01';
    end;
    begin
      insert into public.mtp_subtasks(
        id,owner_id,task_id,source_key,source_id_legacy,text,done,ordinal,
        is_active,source_deleted_at,first_seen_batch_id,last_seen_batch_id,
        content_hash,record_origin
      ) values (
        v_id,p_owner,p_task_id,'L1S:'||v_id::text,v_id::text,
        v_item->>'text',(v_item->>'done')::boolean,(v_item->>'ordinal')::integer,
        true,null,null,null,private.mtp_l1_request_hash(v_item),'direct'
      )
      on conflict (id) do update set
        text=excluded.text,done=excluded.done,ordinal=excluded.ordinal,
        is_active=true,source_deleted_at=null,content_hash=excluded.content_hash
      where mtp_subtasks.owner_id=p_owner and mtp_subtasks.task_id=p_task_id;
      if not found then raise exception 'subtask_not_available' using errcode='42501'; end if;
    exception when unique_violation then
      raise exception 'subtask_not_available' using errcode='42501';
    end;
  end loop;
  update public.mtp_subtasks set
    is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
   where owner_id=p_owner and task_id=p_task_id and record_origin='direct'
     and is_active and not exists (select 1 from mtp_l1b_child_ids i where i.id=mtp_subtasks.id);

  create temporary table if not exists mtp_l1b_dep_ids(id uuid primary key) on commit drop;
  truncate table mtp_l1b_dep_ids;
  v_count := 0;
  for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(p_payload->'dependencies','[]'::jsonb)) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_item) as k where k not in ('task_id','ordinal'))
       or (v_item->>'task_id') is null
       or coalesce(v_item->>'ordinal',v_count::text) !~ '^[0-9]+$' then
      raise exception 'dependency_payload_invalid' using errcode='L1P01';
    end if;
    v_dep := (v_item->>'task_id')::uuid;
    begin
      insert into mtp_l1b_dep_ids values(v_dep);
    exception when unique_violation then
      raise exception 'dependency_duplicate_id' using errcode='L1P01';
    end;
    if not exists(
      select 1 from public.mtp_tasks
       where owner_id=p_owner and id=v_dep and is_active
    ) then raise exception 'task_not_available' using errcode='42501'; end if;
    insert into public.mtp_task_dependencies(
      owner_id,task_id,depends_on_task_id,ordinal,is_active,source_deleted_at
    ) values (
      p_owner,p_task_id,v_dep,coalesce((v_item->>'ordinal')::integer,v_count),true,null
    ) on conflict(owner_id,task_id,depends_on_task_id) do update set
      ordinal=excluded.ordinal,is_active=true,source_deleted_at=null;
    v_count := v_count + 1;
  end loop;
  update public.mtp_task_dependencies set
    is_active=false,source_deleted_at=pg_catalog.now()
   where owner_id=p_owner and task_id=p_task_id and is_active
     and not exists (select 1 from mtp_l1b_dep_ids i where i.id=depends_on_task_id);

  update public.mtp_tasks set content_hash=p_hash
   where owner_id=p_owner and id=p_task_id returning * into v_task;
  return pg_catalog.jsonb_build_object(
    'id',v_task.id,'version',v_task.version,'is_active',v_task.is_active,
    'subtask_count',pg_catalog.jsonb_array_length(coalesce(p_payload->'subtasks','[]'::jsonb)),
    'dependency_count',pg_catalog.jsonb_array_length(coalesce(p_payload->'dependencies','[]'::jsonb)),
    'updated_at',v_task.updated_at
  );
end;
$$;

create function private.mtp_l1b_event_put(
  p_owner uuid,
  p_event_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_hash bytea
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.mtp_events;
  v_item jsonb;
  v_window public.mtp_event_windows;
  v_window_id uuid;
  v_next_ordinal integer;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_payload) as k where k not in ('title','event_type','category','color_hex','note_text','legacy_location_text','windows'))
     or pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
     or char_length(pg_catalog.btrim(p_payload->>'title')) not between 1 and 500
     or char_length(coalesce(p_payload->>'event_type','')) > 100
     or char_length(coalesce(p_payload->>'category','')) > 100
     or char_length(coalesce(p_payload->>'note_text','')) > 20000
     or char_length(coalesce(p_payload->>'legacy_location_text','')) > 2000
     or (p_payload ? 'color_hex' and p_payload->'color_hex' <> 'null'::jsonb
         and (pg_catalog.jsonb_typeof(p_payload->'color_hex') <> 'string'
              or (p_payload->>'color_hex') !~ '^#[0-9A-Fa-f]{6}$'))
     or pg_catalog.jsonb_typeof(coalesce(p_payload->'windows','[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_payload->'windows','[]'::jsonb)) not between 1 and 6 then
    raise exception 'event_payload_invalid' using errcode='L1P01';
  end if;
  if p_expected_version is null then
    begin
      insert into public.mtp_events(
        id,owner_id,source_key,source_id_legacy,title,event_type,category,
        is_active,source_deleted_at,first_seen_batch_id,last_seen_batch_id,
        content_hash,record_origin,color_hex,note_text,legacy_location_text
      ) values (
        p_event_id,p_owner,'L1E:'||p_event_id::text,p_event_id::text,
        pg_catalog.btrim(p_payload->>'title'),p_payload->>'event_type',p_payload->>'category',
        true,null,null,null,p_hash,'direct',p_payload->>'color_hex',
        p_payload->>'note_text',p_payload->>'legacy_location_text'
      ) returning * into v_event;
    exception when unique_violation then
      raise exception 'event_not_available' using errcode='42501';
    end;
  else
    select * into v_event from public.mtp_events
     where owner_id=p_owner and id=p_event_id and is_active for update;
    if not found then raise exception 'event_not_available' using errcode='42501'; end if;
    if v_event.version <> p_expected_version then
      raise exception 'event_version_conflict' using errcode='L1V01';
    end if;
    update public.mtp_events set
      title=pg_catalog.btrim(p_payload->>'title'),event_type=p_payload->>'event_type',
      category=p_payload->>'category',color_hex=p_payload->>'color_hex',
      note_text=p_payload->>'note_text',legacy_location_text=p_payload->>'legacy_location_text',
      content_hash=p_hash
     where owner_id=p_owner and id=p_event_id returning * into v_event;
  end if;

  create temporary table if not exists mtp_l1b_window_ids(id uuid primary key) on commit drop;
  truncate table mtp_l1b_window_ids;
  select coalesce(max(ordinal),-1)+1 into v_next_ordinal
    from public.mtp_event_windows where owner_id=p_owner and event_id=p_event_id;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'windows') loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_item) as k where k not in ('id','start','end','description','location','display_ordinal'))
       or (v_item->>'id') is null
       or (v_item->>'start') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (v_item->>'end') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (v_item->>'display_ordinal') !~ '^[0-9]+$'
       or (v_item->>'end')::date < (v_item->>'start')::date
       or char_length(coalesce(v_item->>'description','')) > 10000
       or (v_item ? 'location' and v_item->'location' <> 'null'::jsonb
           and pg_catalog.jsonb_typeof(v_item->'location') <> 'object') then
      raise exception 'event_window_payload_invalid' using errcode='L1P01';
    end if;
    v_window_id := (v_item->>'id')::uuid;
    begin
      insert into mtp_l1b_window_ids values(v_window_id);
    exception when unique_violation then
      raise exception 'event_window_duplicate_id' using errcode='L1P01';
    end;
    select * into v_window from public.mtp_event_windows
     where owner_id=p_owner and id=v_window_id for update;
    if found then
      if v_window.event_id <> p_event_id then
        raise exception 'event_window_not_available' using errcode='42501';
      end if;
      update public.mtp_event_windows set
        window_start=(v_item->>'start')::date,window_end=(v_item->>'end')::date,
        display_ordinal=(v_item->>'display_ordinal')::integer,
        description=v_item->>'description',location=v_item->'location',
        is_active=true,source_deleted_at=null,content_hash=private.mtp_l1_request_hash(v_item)
       where owner_id=p_owner and id=v_window_id;
    else
      insert into public.mtp_event_windows(
        owner_id,event_id,ordinal,window_start,window_end,is_active,source_deleted_at,
        first_seen_batch_id,last_seen_batch_id,content_hash,id,record_origin,
        description,location,display_ordinal
      ) values (
        p_owner,p_event_id,v_next_ordinal,(v_item->>'start')::date,(v_item->>'end')::date,
        true,null,null,null,private.mtp_l1_request_hash(v_item),v_window_id,'direct',
        v_item->>'description',v_item->'location',(v_item->>'display_ordinal')::integer
      );
      v_next_ordinal := v_next_ordinal + 1;
    end if;
  end loop;
  update public.mtp_event_windows set
    is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
   where owner_id=p_owner and event_id=p_event_id and record_origin='direct'
     and is_active and not exists(select 1 from mtp_l1b_window_ids i where i.id=mtp_event_windows.id);
  return pg_catalog.jsonb_build_object(
    'id',v_event.id,'version',v_event.version,'is_active',v_event.is_active,
    'window_count',pg_catalog.jsonb_array_length(p_payload->'windows'),
    'updated_at',v_event.updated_at
  );
end;
$$;

create function private.mtp_l1b_note_put(
  p_owner uuid,
  p_note_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_hash bytea
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_note public.mtp_notes;
begin
  perform private.mtp_l1b_validate_note(p_payload);
  if p_expected_version is null then
    begin
      insert into public.mtp_notes(id,owner_id,title,emoji,content_html,content_hash)
      values(p_note_id,p_owner,pg_catalog.btrim(p_payload->>'title'),p_payload->>'emoji',
             coalesce(p_payload->>'content_html',''),p_hash)
      returning * into v_note;
    exception when unique_violation then
      raise exception 'note_not_available' using errcode='42501';
    end;
  else
    select * into v_note from public.mtp_notes
     where owner_id=p_owner and id=p_note_id and is_active for update;
    if not found then raise exception 'note_not_available' using errcode='42501'; end if;
    if v_note.version <> p_expected_version then
      raise exception 'note_version_conflict' using errcode='L1V01';
    end if;
    update public.mtp_notes set
      title=pg_catalog.btrim(p_payload->>'title'),emoji=p_payload->>'emoji',
      content_html=coalesce(p_payload->>'content_html',''),content_hash=p_hash
     where owner_id=p_owner and id=p_note_id returning * into v_note;
  end if;
  return pg_catalog.jsonb_build_object(
    'id',v_note.id,'version',v_note.version,'is_active',v_note.is_active,
    'updated_at',v_note.updated_at
  );
end;
$$;

create function private.mtp_l1b_settings_update(
  p_owner uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_hash bytea
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_settings public.mtp_planner_settings;
begin
  perform private.mtp_l1b_validate_settings(p_payload);
  if p_expected_version is null then
    begin
      insert into public.mtp_planner_settings(owner_id,settings,content_hash)
      values(p_owner,p_payload,p_hash) returning * into v_settings;
    exception when unique_violation then
      raise exception 'settings_version_conflict' using errcode='L1V01';
    end;
  else
    select * into v_settings from public.mtp_planner_settings
     where owner_id=p_owner for update;
    if not found or v_settings.version <> p_expected_version then
      raise exception 'settings_version_conflict' using errcode='L1V01';
    end if;
    update public.mtp_planner_settings set settings=p_payload,content_hash=p_hash
     where owner_id=p_owner returning * into v_settings;
  end if;
  return pg_catalog.jsonb_build_object(
    'id',p_owner,'version',v_settings.version,'updated_at',v_settings.updated_at
  );
end;
$$;

create function private.mtp_l1b_attachment_put(
  p_owner uuid,
  p_attachment_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_hash bytea
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kind text := p_payload->>'parent_kind';
  v_parent uuid;
  v_attachment_kind text := p_payload->>'attachment_kind';
  v_hex text := p_payload->>'content_sha256';
  v_path text := p_payload->>'storage_path';
  v_size bigint;
  v_is_file boolean;
  v_task_attachment public.mtp_task_attachments;
  v_note_asset public.mtp_note_assets;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_payload) as k where k not in (
       'parent_kind','parent_id','display_ordinal','attachment_kind','display_name',
       'href','mime_type','byte_size','storage_bucket','storage_path','content_sha256'
     ))
     or v_kind not in ('task','note')
     or coalesce(p_payload->>'parent_id','') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(p_payload->>'display_ordinal','') !~ '^[0-9]+$'
     or char_length(coalesce(p_payload->>'display_name','')) > 300
     or char_length(coalesce(p_payload->>'mime_type','')) > 128 then
    raise exception 'attachment_payload_invalid' using errcode='L1P01';
  end if;
  v_parent := (p_payload->>'parent_id')::uuid;
  if v_kind='task' then
    if v_attachment_kind not in ('link','file_ref') then
      raise exception 'attachment_path_or_link_invalid' using errcode='L1P01';
    end if;
    v_is_file := v_attachment_kind='file_ref';
    if v_is_file then
      if coalesce(p_payload->>'byte_size','') !~ '^[0-9]+$'
         or (p_payload->>'byte_size')::numeric not between 1 and 5242880
         or v_hex !~ '^[0-9A-Fa-f]{64}$'
         or p_payload->>'storage_bucket' <> 'mtp-private'
         or v_path not like p_owner::text||'/task/'||v_parent::text||'/'||p_attachment_id::text||'/%'
         or p_payload->>'href' is not null then
        raise exception 'attachment_file_metadata_invalid' using errcode='L1P01';
      end if;
      v_size := (p_payload->>'byte_size')::bigint;
    else
      if p_payload->>'href' is null or p_payload->>'href' !~ '^https://'
         or p_payload->>'storage_bucket' is not null
         or v_path is not null or v_hex is not null
         or (p_payload->>'byte_size' is not null
             and (p_payload->>'byte_size' !~ '^[0-9]+$'
                  or (p_payload->>'byte_size')::numeric > 5242880)) then
        raise exception 'attachment_link_metadata_invalid' using errcode='L1P01';
      end if;
      v_size := (p_payload->>'byte_size')::bigint;
    end if;
    if not exists(select 1 from public.mtp_tasks where owner_id=p_owner and id=v_parent and is_active) then
      raise exception 'attachment_parent_not_available' using errcode='42501';
    end if;
    if p_expected_version is null then
      begin
        insert into public.mtp_task_attachments(
          id,owner_id,task_id,source_key,source_id_legacy,ordinal,attachment_kind,
          display_name,href,mime_type,byte_size,is_active,source_deleted_at,
          first_seen_batch_id,last_seen_batch_id,content_hash,record_origin,
          storage_bucket,storage_path,content_sha256
        ) values (
          p_attachment_id,p_owner,v_parent,'L1A:'||p_attachment_id::text,p_attachment_id::text,
          (p_payload->>'display_ordinal')::integer,v_attachment_kind,
          p_payload->>'display_name',p_payload->>'href',p_payload->>'mime_type',
          v_size,true,null,null,null,p_hash,'direct',
          case when v_is_file then 'mtp-private' else null end,
          case when v_is_file then v_path else null end,
          case when v_is_file then pg_catalog.decode(v_hex,'hex') else null end
        ) returning * into v_task_attachment;
      exception when unique_violation then
        raise exception 'attachment_not_available' using errcode='42501';
      end;
    else
      select * into v_task_attachment from public.mtp_task_attachments
       where owner_id=p_owner and id=p_attachment_id and task_id=v_parent
         and is_active for update;
      if not found then raise exception 'attachment_not_available' using errcode='42501'; end if;
      if v_task_attachment.version <> p_expected_version then
        raise exception 'attachment_version_conflict' using errcode='L1V01';
      end if;
      update public.mtp_task_attachments set
        ordinal=(p_payload->>'display_ordinal')::integer,
        attachment_kind=v_attachment_kind,display_name=p_payload->>'display_name',
        href=p_payload->>'href',mime_type=p_payload->>'mime_type',
        byte_size=v_size,
        storage_bucket=case when v_is_file then 'mtp-private' else null end,
        storage_path=case when v_is_file then v_path else null end,
        content_sha256=case when v_is_file then pg_catalog.decode(v_hex,'hex') else null end,
        content_hash=p_hash
       where owner_id=p_owner and id=p_attachment_id returning * into v_task_attachment;
    end if;
    return pg_catalog.jsonb_build_object(
      'id',v_task_attachment.id,'version',v_task_attachment.version,
      'parent_kind','task','is_active',v_task_attachment.is_active,
      'updated_at',v_task_attachment.updated_at
    );
  end if;

  if coalesce(p_payload->>'byte_size','') !~ '^[0-9]+$'
     or (p_payload->>'byte_size')::numeric not between 1 and 5242880
     or v_hex !~ '^[0-9A-Fa-f]{64}$'
     or p_payload->>'storage_bucket' <> 'mtp-private'
     or v_path not like p_owner::text||'/note/'||v_parent::text||'/'||p_attachment_id::text||'/%'
     or p_payload->>'mime_type' not in ('image/jpeg','image/png','image/gif','image/webp')
     or p_payload->>'href' is not null then
    raise exception 'note_asset_path_or_type_invalid' using errcode='L1P01';
  end if;
  v_size := (p_payload->>'byte_size')::bigint;
  if not exists(select 1 from public.mtp_notes where owner_id=p_owner and id=v_parent and is_active) then
    raise exception 'attachment_parent_not_available' using errcode='42501';
  end if;
  if p_expected_version is null then
    begin
      insert into public.mtp_note_assets(
        id,owner_id,note_id,display_ordinal,display_name,mime_type,byte_size,
        storage_bucket,storage_path,content_sha256,content_hash
      ) values (
        p_attachment_id,p_owner,v_parent,(p_payload->>'display_ordinal')::integer,
        p_payload->>'display_name',p_payload->>'mime_type',v_size,
        'mtp-private',v_path,pg_catalog.decode(v_hex,'hex'),p_hash
      ) returning * into v_note_asset;
    exception when unique_violation then
      raise exception 'attachment_not_available' using errcode='42501';
    end;
  else
    select * into v_note_asset from public.mtp_note_assets
     where owner_id=p_owner and id=p_attachment_id and note_id=v_parent and is_active for update;
    if not found then raise exception 'attachment_not_available' using errcode='42501'; end if;
    if v_note_asset.version <> p_expected_version then
      raise exception 'attachment_version_conflict' using errcode='L1V01';
    end if;
    update public.mtp_note_assets set
      display_ordinal=(p_payload->>'display_ordinal')::integer,
      display_name=p_payload->>'display_name',mime_type=p_payload->>'mime_type',
      byte_size=v_size,storage_path=v_path,
      content_sha256=pg_catalog.decode(v_hex,'hex'),content_hash=p_hash
     where owner_id=p_owner and id=p_attachment_id returning * into v_note_asset;
  end if;
  return pg_catalog.jsonb_build_object(
    'id',v_note_asset.id,'version',v_note_asset.version,
    'parent_kind','note','is_active',v_note_asset.is_active,
    'updated_at',v_note_asset.updated_at
  );
end;
$$;

create function private.mtp_l1b_delete_entity(
  p_owner uuid,
  p_operation text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_hash bytea
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.mtp_events;
  v_note public.mtp_notes;
  v_task_attachment public.mtp_task_attachments;
  v_note_asset public.mtp_note_assets;
  v_parent_kind text;
begin
  if p_operation='event.delete' then
    select * into v_event from public.mtp_events
     where owner_id=p_owner and id=p_entity_id and is_active for update;
    if not found then raise exception 'event_not_available' using errcode='42501'; end if;
    if v_event.version<>p_expected_version then raise exception 'event_version_conflict' using errcode='L1V01'; end if;
    update public.mtp_events set is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
     where owner_id=p_owner and id=p_entity_id returning * into v_event;
    update public.mtp_event_windows set is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
     where owner_id=p_owner and event_id=p_entity_id and is_active;
    return pg_catalog.jsonb_build_object('id',v_event.id,'version',v_event.version,'is_active',false,'updated_at',v_event.updated_at);
  elsif p_operation='note.delete' then
    select * into v_note from public.mtp_notes
     where owner_id=p_owner and id=p_entity_id and is_active for update;
    if not found then raise exception 'note_not_available' using errcode='42501'; end if;
    if v_note.version<>p_expected_version then raise exception 'note_version_conflict' using errcode='L1V01'; end if;
    update public.mtp_notes set is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
     where owner_id=p_owner and id=p_entity_id returning * into v_note;
    update public.mtp_note_assets set is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
     where owner_id=p_owner and note_id=p_entity_id and is_active;
    return pg_catalog.jsonb_build_object('id',v_note.id,'version',v_note.version,'is_active',false,'updated_at',v_note.updated_at);
  end if;

  v_parent_kind := p_payload->>'parent_kind';
  if v_parent_kind='task' then
    select * into v_task_attachment from public.mtp_task_attachments
     where owner_id=p_owner and id=p_entity_id and is_active for update;
    if not found then raise exception 'attachment_not_available' using errcode='42501'; end if;
    if v_task_attachment.version<>p_expected_version then raise exception 'attachment_version_conflict' using errcode='L1V01'; end if;
    update public.mtp_task_attachments set is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
     where owner_id=p_owner and id=p_entity_id returning * into v_task_attachment;
    return pg_catalog.jsonb_build_object('id',v_task_attachment.id,'version',v_task_attachment.version,'parent_kind','task','is_active',false,'updated_at',v_task_attachment.updated_at);
  elsif v_parent_kind='note' then
    select * into v_note_asset from public.mtp_note_assets
     where owner_id=p_owner and id=p_entity_id and is_active for update;
    if not found then raise exception 'attachment_not_available' using errcode='42501'; end if;
    if v_note_asset.version<>p_expected_version then raise exception 'attachment_version_conflict' using errcode='L1V01'; end if;
    update public.mtp_note_assets set is_active=false,source_deleted_at=pg_catalog.now(),content_hash=p_hash
     where owner_id=p_owner and id=p_entity_id returning * into v_note_asset;
    return pg_catalog.jsonb_build_object('id',v_note_asset.id,'version',v_note_asset.version,'parent_kind','note','is_active',false,'updated_at',v_note_asset.updated_at);
  end if;
  raise exception 'attachment_parent_kind_invalid' using errcode='L1P01';
end;
$$;

create function private.mtp_l1b_apply(
  p_operation text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_receipt record;
  v_request jsonb;
  v_result jsonb;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_operation not in (
    'task.children.replace','event.put','event.delete','note.put','note.delete',
    'settings.update','attachment.put','attachment.delete'
  ) or p_entity_id is null then
    raise exception 'planner_operation_invalid' using errcode='L1P01';
  end if;
  if p_operation in ('task.children.replace','event.delete','note.delete','attachment.delete')
     and (p_expected_version is null or p_expected_version < 1) then
    raise exception 'expected_version_required' using errcode='L1P01';
  end if;
  v_request := pg_catalog.jsonb_build_object(
    'operation',p_operation,'entity_id',p_entity_id,
    'expected_version',p_expected_version,'payload',coalesce(p_payload,'{}'::jsonb)
  );
  select * into v_receipt from private.mtp_l1b_receipt_begin(
    v_owner,p_idempotency_key,p_operation,p_entity_id,p_expected_version,v_request
  );
  if v_receipt.is_retry then return v_receipt.prior_result; end if;

  -- Lock the owner's dependency graph before the task aggregate helper takes
  -- any per-task row lock.  The dependency trigger retains the same guard for
  -- direct active-edge writes that do not enter through this RPC.
  if p_operation='task.children.replace' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mtp_l1_dependency_graph:' || v_owner::text, 0)
    );
  end if;

  if p_operation='task.children.replace' then
    v_result := private.mtp_l1b_task_children_replace(v_owner,p_entity_id,p_expected_version,p_payload,v_receipt.request_hash);
  elsif p_operation='event.put' then
    v_result := private.mtp_l1b_event_put(v_owner,p_entity_id,p_expected_version,p_payload,v_receipt.request_hash);
  elsif p_operation='note.put' then
    v_result := private.mtp_l1b_note_put(v_owner,p_entity_id,p_expected_version,p_payload,v_receipt.request_hash);
  elsif p_operation='settings.update' then
    v_result := private.mtp_l1b_settings_update(v_owner,p_expected_version,p_payload,v_receipt.request_hash);
  elsif p_operation='attachment.put' then
    v_result := private.mtp_l1b_attachment_put(v_owner,p_entity_id,p_expected_version,p_payload,v_receipt.request_hash);
  else
    v_result := private.mtp_l1b_delete_entity(v_owner,p_operation,p_entity_id,p_expected_version,coalesce(p_payload,'{}'::jsonb),v_receipt.request_hash);
  end if;
  return private.mtp_l1b_receipt_finish(v_owner,p_idempotency_key,v_result);
end;
$$;

create function public.mtp_task_children_replace_v1(uuid,bigint,jsonb,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('task.children.replace',$1,$2,$3,$4) $$;
create function public.mtp_event_put_v1(uuid,bigint,jsonb,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('event.put',$1,$2,$3,$4) $$;
create function public.mtp_event_delete_v1(uuid,bigint,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('event.delete',$1,$2,'{}'::jsonb,$3) $$;
create function public.mtp_note_put_v1(uuid,bigint,jsonb,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('note.put',$1,$2,$3,$4) $$;
create function public.mtp_note_delete_v1(uuid,bigint,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('note.delete',$1,$2,'{}'::jsonb,$3) $$;
create function public.mtp_settings_update_v1(bigint,jsonb,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('settings.update','00000000-0000-0000-0000-000000000000',$1,$2,$3) $$;
create function public.mtp_attachment_put_v1(uuid,bigint,jsonb,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('attachment.put',$1,$2,$3,$4) $$;
create function public.mtp_attachment_delete_v1(uuid,bigint,text,uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.mtp_l1b_apply('attachment.delete',$1,$2,pg_catalog.jsonb_build_object('parent_kind',$3),$4) $$;

alter table public.mtp_notes enable row level security;
alter table public.mtp_note_assets enable row level security;
alter table public.mtp_planner_settings enable row level security;

revoke all on table public.mtp_notes from public, anon, authenticated, service_role;
revoke all on table public.mtp_note_assets from public, anon, authenticated, service_role;
revoke all on table public.mtp_planner_settings from public, anon, authenticated, service_role;
grant select on table public.mtp_notes to authenticated;
grant select on table public.mtp_note_assets to authenticated;
grant select on table public.mtp_planner_settings to authenticated;

create policy mtp_notes_owner_select on public.mtp_notes
  for select to authenticated using (owner_id=(select auth.uid()));
create policy mtp_note_assets_owner_select on public.mtp_note_assets
  for select to authenticated using (owner_id=(select auth.uid()));
create policy mtp_planner_settings_owner_select on public.mtp_planner_settings
  for select to authenticated using (owner_id=(select auth.uid()));

revoke all on function private.mtp_l1b_touch_version() from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_has_forbidden_key(jsonb,integer) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_validate_settings(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_validate_note(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_receipt_begin(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_receipt_finish(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_task_children_replace(uuid,uuid,bigint,jsonb,bytea) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_event_put(uuid,uuid,bigint,jsonb,bytea) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_note_put(uuid,uuid,bigint,jsonb,bytea) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_settings_update(uuid,bigint,jsonb,bytea) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_attachment_put(uuid,uuid,bigint,jsonb,bytea) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_delete_entity(uuid,text,uuid,bigint,jsonb,bytea) from public,anon,authenticated,service_role;
revoke all on function private.mtp_l1b_apply(text,uuid,bigint,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.mtp_l1b_apply(text,uuid,bigint,jsonb,uuid) to authenticated;

revoke all on function public.mtp_task_children_replace_v1(uuid,bigint,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_event_put_v1(uuid,bigint,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_event_delete_v1(uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_note_put_v1(uuid,bigint,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_note_delete_v1(uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_settings_update_v1(bigint,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_attachment_put_v1(uuid,bigint,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mtp_attachment_delete_v1(uuid,bigint,text,uuid) from public,anon,authenticated,service_role;

grant execute on function public.mtp_task_children_replace_v1(uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function public.mtp_event_put_v1(uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function public.mtp_event_delete_v1(uuid,bigint,uuid) to authenticated;
grant execute on function public.mtp_note_put_v1(uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function public.mtp_note_delete_v1(uuid,bigint,uuid) to authenticated;
grant execute on function public.mtp_settings_update_v1(bigint,jsonb,uuid) to authenticated;
grant execute on function public.mtp_attachment_put_v1(uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function public.mtp_attachment_delete_v1(uuid,bigint,text,uuid) to authenticated;

comment on table public.mtp_notes is
  'L1B selected-profile notes. HTML is inert data; clients must sanitise before rendering.';
comment on table public.mtp_planner_settings is
  'L1B allowlisted non-secret selected-profile settings; device and provider state excluded.';
comment on table public.mtp_note_assets is
  'L1B metadata for private note images; binary durability is separately acknowledged.';
