-- L1A direct Supabase Todo source contract.
--
-- THIS IS NOT A MIGRATION. It is applied only after the exact L0b migration in
-- a throwaway PostgreSQL 17 test service. Moving these bytes into
-- supabase/migrations/, applying them, enabling a client write path, importing
-- owner data, or cutting over authority requires separate exact approvals.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on schema private from service_role;
grant usage on schema private to authenticated;

-- Imported L0b rows retain their batch lineage. New direct rows have no import
-- batch and are explicitly labelled so a mixed/ambiguous origin cannot exist.
alter table public.mtp_tasks
  alter column first_seen_batch_id drop not null,
  alter column last_seen_batch_id drop not null,
  add column record_origin text not null default 'import',
  add column description text,
  add column start_date date,
  add column assignee text,
  add column project text,
  add column progress smallint,
  add column recurrence_rule text,
  add column is_recurring boolean not null default false,
  add column location_text text,
  add column task_notes text,
  add column pinned boolean not null default false,
  add column original_due_date date,
  add column delay_label text,
  add column milestone boolean not null default true,
  add column milestone_at timestamptz,
  add column completed_at timestamptz,
  add column source_created_at timestamptz,
  add column renewed_from_task_id uuid,
  add constraint mtp_tasks_record_origin_check
    check (record_origin in ('import','direct')),
  add constraint mtp_tasks_origin_batch_check check (
    (record_origin = 'import' and first_seen_batch_id is not null and last_seen_batch_id is not null)
    or (record_origin = 'direct' and first_seen_batch_id is null and last_seen_batch_id is null)
  ),
  add constraint mtp_tasks_description_length_check
    check (description is null or char_length(description) <= 20000),
  add constraint mtp_tasks_assignee_length_check
    check (assignee is null or char_length(assignee) <= 300),
  add constraint mtp_tasks_project_length_check
    check (project is null or char_length(project) <= 300),
  add constraint mtp_tasks_progress_check
    check (progress is null or progress between 0 and 100),
  add constraint mtp_tasks_recurrence_length_check
    check (recurrence_rule is null or char_length(recurrence_rule) <= 500),
  add constraint mtp_tasks_location_length_check
    check (location_text is null or char_length(location_text) <= 2000),
  add constraint mtp_tasks_notes_length_check
    check (task_notes is null or char_length(task_notes) <= 20000),
  add constraint mtp_tasks_delay_label_length_check
    check (delay_label is null or char_length(delay_label) <= 500),
  add constraint mtp_tasks_owner_renewed_from_fk
    foreign key (owner_id, renewed_from_task_id)
    references public.mtp_tasks(owner_id, id);

alter table public.mtp_subtasks
  alter column first_seen_batch_id drop not null,
  alter column last_seen_batch_id drop not null,
  add column record_origin text not null default 'import',
  add constraint mtp_subtasks_record_origin_check
    check (record_origin in ('import','direct')),
  add constraint mtp_subtasks_origin_batch_check check (
    (record_origin = 'import' and first_seen_batch_id is not null and last_seen_batch_id is not null)
    or (record_origin = 'direct' and first_seen_batch_id is null and last_seen_batch_id is null)
  );

alter table public.mtp_events
  alter column first_seen_batch_id drop not null,
  alter column last_seen_batch_id drop not null,
  add column record_origin text not null default 'import',
  add column color_hex text,
  add column note_text text,
  add column legacy_location_text text,
  add constraint mtp_events_record_origin_check
    check (record_origin in ('import','direct')),
  add constraint mtp_events_origin_batch_check check (
    (record_origin = 'import' and first_seen_batch_id is not null and last_seen_batch_id is not null)
    or (record_origin = 'direct' and first_seen_batch_id is null and last_seen_batch_id is null)
  ),
  add constraint mtp_events_color_check
    check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint mtp_events_note_length_check
    check (note_text is null or char_length(note_text) <= 20000),
  add constraint mtp_events_location_length_check
    check (legacy_location_text is null or char_length(legacy_location_text) <= 2000);

alter table public.mtp_event_windows
  alter column first_seen_batch_id drop not null,
  alter column last_seen_batch_id drop not null,
  add column id uuid not null default extensions.gen_random_uuid(),
  add column record_origin text not null default 'import',
  add column description text,
  add column location jsonb,
  add constraint mtp_event_windows_owner_id_uniq unique (owner_id, id),
  add constraint mtp_event_windows_record_origin_check
    check (record_origin in ('import','direct')),
  add constraint mtp_event_windows_origin_batch_check check (
    (record_origin = 'import' and first_seen_batch_id is not null and last_seen_batch_id is not null)
    or (record_origin = 'direct' and first_seen_batch_id is null and last_seen_batch_id is null)
  ),
  add constraint mtp_event_windows_description_length_check
    check (description is null or char_length(description) <= 10000),
  add constraint mtp_event_windows_location_shape_check
    check (location is null or pg_catalog.jsonb_typeof(location) = 'object');

alter table public.mtp_task_attachments
  alter column first_seen_batch_id drop not null,
  alter column last_seen_batch_id drop not null,
  add column record_origin text not null default 'import',
  add column storage_bucket text,
  add column storage_path text,
  add column content_sha256 bytea,
  add constraint mtp_task_attachments_record_origin_check
    check (record_origin in ('import','direct')),
  add constraint mtp_task_attachments_origin_batch_check check (
    (record_origin = 'import' and first_seen_batch_id is not null and last_seen_batch_id is not null)
    or (record_origin = 'direct' and first_seen_batch_id is null and last_seen_batch_id is null)
  ),
  add constraint mtp_task_attachments_storage_pair_check
    check ((storage_bucket is null) = (storage_path is null)),
  add constraint mtp_task_attachments_storage_length_check
    check (
      (storage_bucket is null or char_length(storage_bucket) between 1 and 100)
      and (storage_path is null or char_length(storage_path) between 1 and 1024)
    ),
  add constraint mtp_task_attachments_content_sha_check
    check (content_sha256 is null or octet_length(content_sha256) = 32);

-- Existing L0b version semantics remain content-hash/tombstone based so an
-- unchanged import does not increment versions. Direct mutation functions set
-- a new content hash for every acknowledged write. Stable event-window UUIDs
-- are now immutable just like every other entity UUID.
create or replace function public.mtp_touch_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := old.id;
  if tg_table_name <> 'mtp_event_windows' then
    new.source_key := old.source_key;
  end if;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  if new.content_hash is distinct from old.content_hash
     or new.is_active is distinct from old.is_active then
    new.version := old.version + 1;
    new.updated_at := pg_catalog.now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.mtp_touch_version() from public, anon, authenticated, service_role;

create table public.mtp_task_dependencies (
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  depends_on_task_id uuid not null,
  dependency_kind text not null default 'finish_to_start'
    check (dependency_kind in ('finish_to_start')),
  ordinal integer not null default 0 check (ordinal >= 0),
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (owner_id, task_id, depends_on_task_id),
  constraint mtp_task_dependencies_not_self check (task_id <> depends_on_task_id),
  constraint mtp_task_dependencies_tombstone_consistent
    check (is_active = (source_deleted_at is null)),
  constraint mtp_task_dependencies_task_fk foreign key (owner_id, task_id)
    references public.mtp_tasks(owner_id, id) on delete cascade,
  constraint mtp_task_dependencies_depends_fk foreign key (owner_id, depends_on_task_id)
    references public.mtp_tasks(owner_id, id) on delete cascade
);

create table public.mtp_task_external_refs (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  provider text not null check (provider in ('line')),
  opaque_ref_hash bytea not null check (octet_length(opaque_ref_hash) = 32),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  constraint mtp_task_external_refs_owner_id_uniq unique (owner_id, id),
  constraint mtp_task_external_refs_owner_hash_uniq unique (owner_id, provider, opaque_ref_hash),
  constraint mtp_task_external_refs_status_time_check
    check ((status = 'active') = (revoked_at is null)),
  constraint mtp_task_external_refs_task_fk foreign key (owner_id, task_id)
    references public.mtp_tasks(owner_id, id) on delete cascade
);
create unique index mtp_task_external_refs_one_active_idx
  on public.mtp_task_external_refs(owner_id, provider, task_id)
  where status = 'active';

create table public.mtp_mutation_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  operation text not null check (operation in ('task.create','task.update','task.delete')),
  entity_id uuid not null,
  request_hash bytea not null check (octet_length(request_hash) = 32),
  expected_version bigint check (expected_version is null or expected_version > 0),
  status text not null default 'pending' check (status in ('pending','applied')),
  result jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  applied_at timestamptz,
  primary key (owner_id, idempotency_key),
  constraint mtp_mutation_receipts_result_check check (
    (status = 'pending' and result is null and applied_at is null)
    or (status = 'applied' and result is not null and applied_at is not null)
  )
);

create index mtp_task_dependencies_owner_active_idx
  on public.mtp_task_dependencies(owner_id, is_active);
create index mtp_task_dependencies_owner_depends_idx
  on public.mtp_task_dependencies(owner_id, depends_on_task_id, is_active);
create index mtp_task_external_refs_owner_task_idx
  on public.mtp_task_external_refs(owner_id, task_id, status);
create index mtp_mutation_receipts_owner_created_idx
  on public.mtp_mutation_receipts(owner_id, created_at desc);

create function private.mtp_l1_touch_dependency_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.task_id := old.task_id;
  new.depends_on_task_id := old.depends_on_task_id;
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

create trigger mtp_task_dependencies_touch_version
before update on public.mtp_task_dependencies
for each row execute function private.mtp_l1_touch_dependency_version();

create function private.mtp_l1_prevent_dependency_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_task_id uuid;
  v_depends_on_task_id uuid;
  v_lock_key bigint;
begin
  if not new.is_active then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_owner_id := old.owner_id;
    v_task_id := old.task_id;
    v_depends_on_task_id := old.depends_on_task_id;
  else
    v_owner_id := new.owner_id;
    v_task_id := new.task_id;
    v_depends_on_task_id := new.depends_on_task_id;
  end if;
  if v_task_id = v_depends_on_task_id then
    raise exception 'dependency_self_edge' using errcode = 'L1D01';
  end if;
  v_lock_key := pg_catalog.hashtextextended(
    'mtp_l1_dependency_graph:' || v_owner_id::text, 0
  );
  if tg_op = 'UPDATE' then
    -- PostgreSQL takes the target tuple lock before a row-level UPDATE trigger.
    -- Never wait for the owner advisory lock from here: doing so can deadlock
    -- with task.children.replace, which deliberately takes that advisory lock
    -- before touching dependency tuples. Privileged direct UPDATE callers must
    -- take the same transaction lock before issuing the statement.
    if not exists (
      select 1
        from pg_catalog.pg_locks as l
       where l.locktype = 'advisory'
         and l.pid = pg_catalog.pg_backend_pid()
         and l.granted
         and l.objsubid = 1
         and l.classid = ((v_lock_key >> 32) & 4294967295::bigint)::oid
         and l.objid = (v_lock_key & 4294967295::bigint)::oid
    ) then
      raise exception 'dependency_lock_required' using errcode = 'L1D02';
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key);
  end if;
  if exists (
    with recursive walk(task_id) as (
      select v_depends_on_task_id
      union
      select d.depends_on_task_id
        from public.mtp_task_dependencies as d
        join walk as w on w.task_id = d.task_id
       where d.owner_id = v_owner_id and d.is_active
         and (d.owner_id, d.task_id, d.depends_on_task_id)
             <> (v_owner_id, v_task_id, v_depends_on_task_id)
    )
    select 1 from walk where task_id = v_task_id
  ) then
    raise exception 'dependency_cycle' using errcode = 'L1D01';
  end if;
  return new;
end;
$$;

create trigger mtp_task_dependencies_cycle_guard
before insert or update on public.mtp_task_dependencies
for each row execute function private.mtp_l1_prevent_dependency_cycle();

create function private.mtp_l1_request_hash(p_request jsonb)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select extensions.digest(pg_catalog.convert_to(p_request::text, 'UTF8'), 'sha256')
$$;

create function private.mtp_l1_validate_task_payload(p_payload jsonb, p_require_title boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'task_payload_must_be_object' using errcode = 'L1P01';
  end if;
  if p_require_title and not (p_payload ? 'title') then
    raise exception 'task_title_required' using errcode = 'L1P01';
  end if;
  if not p_require_title and p_payload = '{}'::jsonb then
    raise exception 'task_patch_empty' using errcode = 'L1P01';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if not (v_key = any (array[
      'title','status_text','category','priority','due_date','description',
      'start_date','assignee','project','progress','recurrence_rule',
      'is_recurring','location_text','task_notes','pinned','original_due_date',
      'delay_label','milestone','milestone_at','completed_at','source_created_at',
      'renewed_from_task_id'
    ]::text[])) then
      raise exception 'task_payload_unknown_field' using errcode = 'L1P01';
    end if;
  end loop;

  if p_payload ? 'title' and (
    pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
    or char_length(pg_catalog.btrim(p_payload->>'title')) not between 1 and 500
  ) then raise exception 'task_title_invalid' using errcode = 'L1P01'; end if;

  if p_payload ? 'status_text' and p_payload->'status_text' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'status_text') <> 'string'
      or char_length(p_payload->>'status_text') > 100) then
    raise exception 'task_status_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'category' and p_payload->'category' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'category') <> 'string'
      or char_length(p_payload->>'category') > 100) then
    raise exception 'task_category_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'priority' and p_payload->'priority' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'priority') <> 'string'
      or char_length(p_payload->>'priority') > 50) then
    raise exception 'task_priority_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'description' and p_payload->'description' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'description') <> 'string'
      or char_length(p_payload->>'description') > 20000) then
    raise exception 'task_description_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'assignee' and p_payload->'assignee' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'assignee') <> 'string'
      or char_length(p_payload->>'assignee') > 300) then
    raise exception 'task_assignee_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'project' and p_payload->'project' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'project') <> 'string'
      or char_length(p_payload->>'project') > 300) then
    raise exception 'task_project_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'recurrence_rule' and p_payload->'recurrence_rule' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'recurrence_rule') <> 'string'
      or char_length(p_payload->>'recurrence_rule') > 500) then
    raise exception 'task_recurrence_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'location_text' and p_payload->'location_text' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'location_text') <> 'string'
      or char_length(p_payload->>'location_text') > 2000) then
    raise exception 'task_location_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'task_notes' and p_payload->'task_notes' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'task_notes') <> 'string'
      or char_length(p_payload->>'task_notes') > 20000) then
    raise exception 'task_notes_invalid' using errcode = 'L1P01';
  end if;
  if p_payload ? 'delay_label' and p_payload->'delay_label' <> 'null'::jsonb and
     (pg_catalog.jsonb_typeof(p_payload->'delay_label') <> 'string'
      or char_length(p_payload->>'delay_label') > 500) then
    raise exception 'task_delay_label_invalid' using errcode = 'L1P01';
  end if;

  if p_payload ? 'progress' and p_payload->'progress' <> 'null'::jsonb and (
    pg_catalog.jsonb_typeof(p_payload->'progress') <> 'number'
    or (p_payload->>'progress') !~ '^[0-9]{1,3}$'
    or (p_payload->>'progress')::integer not between 0 and 100
  ) then raise exception 'task_progress_invalid' using errcode = 'L1P01'; end if;

  foreach v_key in array array['is_recurring','pinned','milestone']::text[] loop
    if p_payload ? v_key
       and pg_catalog.jsonb_typeof(p_payload->v_key) <> 'boolean' then
      raise exception 'task_boolean_invalid' using errcode = 'L1P01';
    end if;
  end loop;

  foreach v_key in array array['due_date','start_date','original_due_date']::text[] loop
    if p_payload ? v_key and p_payload->v_key <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(p_payload->v_key) <> 'string'
      or (p_payload->>v_key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) then raise exception 'task_date_invalid' using errcode = 'L1P01'; end if;
  end loop;

  foreach v_key in array array['milestone_at','completed_at','source_created_at']::text[] loop
    if p_payload ? v_key and p_payload->v_key <> 'null'::jsonb
       and pg_catalog.jsonb_typeof(p_payload->v_key) <> 'string' then
      raise exception 'task_timestamp_invalid' using errcode = 'L1P01';
    end if;
  end loop;

  if p_payload ? 'renewed_from_task_id' and p_payload->'renewed_from_task_id' <> 'null'::jsonb
     and (pg_catalog.jsonb_typeof(p_payload->'renewed_from_task_id') <> 'string'
          or (p_payload->>'renewed_from_task_id') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') then
    raise exception 'task_renewed_from_invalid' using errcode = 'L1P01';
  end if;
end;
$$;

create function private.mtp_l1_task_result(p_task public.mtp_tasks)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_task.id,
    'version', p_task.version,
    'task_kind', p_task.task_kind,
    'title', p_task.title,
    'is_active', p_task.is_active,
    'updated_at', p_task.updated_at
  )
$$;

create function private.mtp_l1_task_create(
  p_task_id uuid,
  p_task_kind text,
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
  v_id uuid := coalesce(p_task_id, extensions.gen_random_uuid());
  v_hash bytea;
  v_prior_hash bytea;
  v_result jsonb;
  v_task public.mtp_tasks;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_task_id is null then raise exception 'task_id_required' using errcode = 'L1P01'; end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required' using errcode = 'L1P01'; end if;
  if p_task_kind is null or p_task_kind not in ('personal','work') then
    raise exception 'task_kind_invalid' using errcode = 'L1P01';
  end if;
  perform private.mtp_l1_validate_task_payload(p_payload, true);
  v_hash := private.mtp_l1_request_hash(pg_catalog.jsonb_build_object(
    'operation','task.create','task_id',v_id,'task_kind',p_task_kind,'payload',p_payload
  ));

  insert into public.mtp_mutation_receipts(
    owner_id,idempotency_key,operation,entity_id,request_hash,expected_version
  ) values (v_owner,p_idempotency_key,'task.create',v_id,v_hash,null)
  on conflict do nothing;
  if not found then
    select r.request_hash,r.result into v_prior_hash,v_result
      from public.mtp_mutation_receipts as r
     where r.owner_id = v_owner and r.idempotency_key = p_idempotency_key
     for update;
    if v_prior_hash is distinct from v_hash then
      raise exception 'idempotency_key_reused' using errcode = 'L1I01';
    end if;
    if v_result is null then raise exception 'idempotency_receipt_incomplete' using errcode = 'L1I01'; end if;
    return v_result;
  end if;

  begin
    insert into public.mtp_tasks(
      id,owner_id,task_kind,source_key,source_id_legacy,title,status_text,category,
      priority,due_date,record_origin,description,start_date,assignee,project,
      progress,recurrence_rule,is_recurring,location_text,task_notes,pinned,
      original_due_date,delay_label,milestone,milestone_at,completed_at,
      source_created_at,renewed_from_task_id,is_active,source_deleted_at,
      first_seen_batch_id,last_seen_batch_id,content_hash
    ) values (
      v_id,v_owner,p_task_kind,'L1T:'||v_id::text,v_id::text,
      pg_catalog.btrim(p_payload->>'title'),p_payload->>'status_text',
      p_payload->>'category',p_payload->>'priority',(p_payload->>'due_date')::date,
      'direct',p_payload->>'description',(p_payload->>'start_date')::date,
      p_payload->>'assignee',p_payload->>'project',(p_payload->>'progress')::smallint,
      p_payload->>'recurrence_rule',coalesce((p_payload->>'is_recurring')::boolean,false),
      p_payload->>'location_text',p_payload->>'task_notes',
      coalesce((p_payload->>'pinned')::boolean,false),(p_payload->>'original_due_date')::date,
      p_payload->>'delay_label',coalesce((p_payload->>'milestone')::boolean,true),
      (p_payload->>'milestone_at')::timestamptz,(p_payload->>'completed_at')::timestamptz,
      (p_payload->>'source_created_at')::timestamptz,
      (p_payload->>'renewed_from_task_id')::uuid,true,null,null,null,v_hash
    ) returning * into v_task;
  exception when unique_violation then
    raise exception 'task_not_available' using errcode = '42501';
  end;

  v_result := private.mtp_l1_task_result(v_task);
  update public.mtp_mutation_receipts set
    status = 'applied', result = v_result, applied_at = pg_catalog.now()
   where owner_id = v_owner and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create function private.mtp_l1_task_update(
  p_task_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_hash bytea;
  v_prior_hash bytea;
  v_result jsonb;
  v_task public.mtp_tasks;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_task_id is null or p_idempotency_key is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'task_update_arguments_invalid' using errcode = 'L1P01';
  end if;
  perform private.mtp_l1_validate_task_payload(p_patch, false);
  v_hash := private.mtp_l1_request_hash(pg_catalog.jsonb_build_object(
    'operation','task.update','task_id',p_task_id,
    'expected_version',p_expected_version,'patch',p_patch
  ));

  insert into public.mtp_mutation_receipts(
    owner_id,idempotency_key,operation,entity_id,request_hash,expected_version
  ) values (v_owner,p_idempotency_key,'task.update',p_task_id,v_hash,p_expected_version)
  on conflict do nothing;
  if not found then
    select r.request_hash,r.result into v_prior_hash,v_result
      from public.mtp_mutation_receipts as r
     where r.owner_id = v_owner and r.idempotency_key = p_idempotency_key
     for update;
    if v_prior_hash is distinct from v_hash then
      raise exception 'idempotency_key_reused' using errcode = 'L1I01';
    end if;
    if v_result is null then raise exception 'idempotency_receipt_incomplete' using errcode = 'L1I01'; end if;
    return v_result;
  end if;

  select * into v_task from public.mtp_tasks
   where owner_id = v_owner and id = p_task_id and is_active for update;
  if not found then raise exception 'task_not_available' using errcode = '42501'; end if;
  if v_task.version <> p_expected_version then
    raise exception 'task_version_conflict' using errcode = 'L1V01';
  end if;

  update public.mtp_tasks set
    title = case when p_patch ? 'title' then pg_catalog.btrim(p_patch->>'title') else title end,
    status_text = case when p_patch ? 'status_text' then p_patch->>'status_text' else status_text end,
    category = case when p_patch ? 'category' then p_patch->>'category' else category end,
    priority = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else due_date end,
    description = case when p_patch ? 'description' then p_patch->>'description' else description end,
    start_date = case when p_patch ? 'start_date' then (p_patch->>'start_date')::date else start_date end,
    assignee = case when p_patch ? 'assignee' then p_patch->>'assignee' else assignee end,
    project = case when p_patch ? 'project' then p_patch->>'project' else project end,
    progress = case when p_patch ? 'progress' then (p_patch->>'progress')::smallint else progress end,
    recurrence_rule = case when p_patch ? 'recurrence_rule' then p_patch->>'recurrence_rule' else recurrence_rule end,
    is_recurring = case when p_patch ? 'is_recurring' then (p_patch->>'is_recurring')::boolean else is_recurring end,
    location_text = case when p_patch ? 'location_text' then p_patch->>'location_text' else location_text end,
    task_notes = case when p_patch ? 'task_notes' then p_patch->>'task_notes' else task_notes end,
    pinned = case when p_patch ? 'pinned' then (p_patch->>'pinned')::boolean else pinned end,
    original_due_date = case when p_patch ? 'original_due_date' then (p_patch->>'original_due_date')::date else original_due_date end,
    delay_label = case when p_patch ? 'delay_label' then p_patch->>'delay_label' else delay_label end,
    milestone = case when p_patch ? 'milestone' then (p_patch->>'milestone')::boolean else milestone end,
    milestone_at = case when p_patch ? 'milestone_at' then (p_patch->>'milestone_at')::timestamptz else milestone_at end,
    completed_at = case when p_patch ? 'completed_at' then (p_patch->>'completed_at')::timestamptz else completed_at end,
    source_created_at = case when p_patch ? 'source_created_at' then (p_patch->>'source_created_at')::timestamptz else source_created_at end,
    renewed_from_task_id = case when p_patch ? 'renewed_from_task_id' then (p_patch->>'renewed_from_task_id')::uuid else renewed_from_task_id end,
    content_hash = v_hash
   where owner_id = v_owner and id = p_task_id
   returning * into v_task;

  v_result := private.mtp_l1_task_result(v_task);
  update public.mtp_mutation_receipts set
    status = 'applied', result = v_result, applied_at = pg_catalog.now()
   where owner_id = v_owner and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create function private.mtp_l1_task_delete(
  p_task_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_hash bytea;
  v_prior_hash bytea;
  v_result jsonb;
  v_task public.mtp_tasks;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_task_id is null or p_idempotency_key is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'task_delete_arguments_invalid' using errcode = 'L1P01';
  end if;
  v_hash := private.mtp_l1_request_hash(pg_catalog.jsonb_build_object(
    'operation','task.delete','task_id',p_task_id,'expected_version',p_expected_version
  ));

  insert into public.mtp_mutation_receipts(
    owner_id,idempotency_key,operation,entity_id,request_hash,expected_version
  ) values (v_owner,p_idempotency_key,'task.delete',p_task_id,v_hash,p_expected_version)
  on conflict do nothing;
  if not found then
    select r.request_hash,r.result into v_prior_hash,v_result
      from public.mtp_mutation_receipts as r
     where r.owner_id = v_owner and r.idempotency_key = p_idempotency_key
     for update;
    if v_prior_hash is distinct from v_hash then
      raise exception 'idempotency_key_reused' using errcode = 'L1I01';
    end if;
    if v_result is null then raise exception 'idempotency_receipt_incomplete' using errcode = 'L1I01'; end if;
    return v_result;
  end if;

  select * into v_task from public.mtp_tasks
   where owner_id = v_owner and id = p_task_id and is_active for update;
  if not found then raise exception 'task_not_available' using errcode = '42501'; end if;
  if v_task.version <> p_expected_version then
    raise exception 'task_version_conflict' using errcode = 'L1V01';
  end if;

  update public.mtp_tasks set
    is_active = false,
    source_deleted_at = pg_catalog.now(),
    content_hash = v_hash
   where owner_id = v_owner and id = p_task_id
   returning * into v_task;

  v_result := private.mtp_l1_task_result(v_task);
  update public.mtp_mutation_receipts set
    status = 'applied', result = v_result, applied_at = pg_catalog.now()
   where owner_id = v_owner and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

-- Exposed wrappers keep caller privileges. Only their private cores elevate,
-- bind auth.uid(), use a pinned empty search_path, and receive the narrowly
-- required authenticated EXECUTE grant in an unexposed schema.
create function public.mtp_task_create_v1(
  p_task_id uuid,
  p_task_kind text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.mtp_l1_task_create(p_task_id,p_task_kind,p_payload,p_idempotency_key)
$$;

create function public.mtp_task_update_v1(
  p_task_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.mtp_l1_task_update(p_task_id,p_expected_version,p_patch,p_idempotency_key)
$$;

create function public.mtp_task_delete_v1(
  p_task_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.mtp_l1_task_delete(p_task_id,p_expected_version,p_idempotency_key)
$$;

-- New public tables are deny-by-default even on projects that still carry
-- historical broad defaults. Existing L0b entity tables remain SELECT-only.
alter table public.mtp_task_dependencies enable row level security;
alter table public.mtp_task_external_refs enable row level security;
alter table public.mtp_mutation_receipts enable row level security;

revoke all on table public.mtp_task_dependencies from public, anon, authenticated, service_role;
revoke all on table public.mtp_task_external_refs from public, anon, authenticated, service_role;
revoke all on table public.mtp_mutation_receipts from public, anon, authenticated, service_role;

grant select on table public.mtp_task_dependencies to authenticated;
grant select on table public.mtp_task_external_refs to authenticated;

create policy mtp_task_dependencies_owner_select on public.mtp_task_dependencies
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_task_external_refs_owner_select on public.mtp_task_external_refs
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on function private.mtp_l1_touch_dependency_version() from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_prevent_dependency_cycle() from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_request_hash(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_validate_task_payload(jsonb,boolean) from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_task_result(public.mtp_tasks) from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_task_create(uuid,text,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_task_update(uuid,bigint,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function private.mtp_l1_task_delete(uuid,bigint,uuid) from public, anon, authenticated, service_role;

grant execute on function private.mtp_l1_task_create(uuid,text,jsonb,uuid) to authenticated;
grant execute on function private.mtp_l1_task_update(uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function private.mtp_l1_task_delete(uuid,bigint,uuid) to authenticated;

revoke all on function public.mtp_task_create_v1(uuid,text,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function public.mtp_task_update_v1(uuid,bigint,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function public.mtp_task_delete_v1(uuid,bigint,uuid) from public, anon, authenticated, service_role;
grant execute on function public.mtp_task_create_v1(uuid,text,jsonb,uuid) to authenticated;
grant execute on function public.mtp_task_update_v1(uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function public.mtp_task_delete_v1(uuid,bigint,uuid) to authenticated;

comment on table public.mtp_tasks is
  'L1A-capable normalized Todo rows. Browser and Drive remain authoritative until separately approved L1C cutover.';
comment on table public.mtp_event_windows is
  'L1A stable UUID window identity; ordinal remains display order only.';
comment on table public.mtp_mutation_receipts is
  'Owner-scoped idempotency evidence; no direct browser table access.';
