\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002')
on conflict do nothing;

create temporary table mtp_test_vectors(canonical jsonb not null, chunks jsonb not null);
insert into mtp_test_vectors(canonical,chunks)
values (:'canonical_vectors'::jsonb, :'chunk_vectors'::jsonb);

-- The same committed vectors are consumed by Node and PostgreSQL so neither
-- runtime can silently redefine the canonical row or exact-byte encoders.
do $$
declare
  v_canonical jsonb;
  v_chunks jsonb;
  v_id text;
  v_vector jsonb;
  v_actual text;
  v_hashes bytea[];
begin
  select canonical,chunks into v_canonical,v_chunks from mtp_test_vectors;
  if pg_catalog.jsonb_array_length(v_canonical->'assertions') <> 14 then
    raise exception 'expected 14 canonical assertions';
  end if;
  if pg_catalog.jsonb_array_length(v_chunks->'vectors') <> 8 then
    raise exception 'expected eight exact-byte vectors';
  end if;

  for v_id,v_vector in select key,value from pg_catalog.jsonb_each(v_canonical->'rows') loop
    v_actual := pg_catalog.encode(public.mtp_row_hash(
      v_vector->>'kind',
      v_vector#>>'{row,source_key}',
      v_vector#>>'{row,parent_source_key}',
      (v_vector#>>'{row,ordinal}')::integer,
      (v_vector#>>'{row,is_active}')::boolean,
      v_vector#>'{row,projected}'
    ),'hex');
    if v_actual <> v_vector->>'sha256' then
      raise exception 'canonical row vector mismatch: %', v_id;
    end if;
  end loop;

  for v_id,v_vector in select key,value from pg_catalog.jsonb_each(v_canonical->'sets') loop
    select coalesce(pg_catalog.array_agg(pg_catalog.decode(r.value->m.member->>'sha256','hex') order by m.ordinality),array[]::bytea[])
      into v_hashes
      from pg_catalog.jsonb_array_elements_text(v_vector->'members') with ordinality as m(member,ordinality)
      cross join lateral (select v_canonical->'rows' as value) as r;
    v_actual := pg_catalog.encode(public.mtp_set_hash(v_hashes),'hex');
    if v_actual <> v_vector->>'sha256' then
      raise exception 'canonical set vector mismatch: %', v_id;
    end if;
  end loop;

  for v_vector in select value from pg_catalog.jsonb_array_elements(v_chunks->'vectors') loop
    v_actual := pg_catalog.encode(extensions.digest(
      public.mtp_enc_int((v_vector->>'seq')::integer)
      || public.mtp_enc_text(v_vector->>'kind')
      || public.mtp_enc_bytes(pg_catalog.convert_to(v_vector->>'payload','UTF8')),
      'sha256'
    ),'hex');
    if v_actual <> v_vector->>'sha256' then
      raise exception 'exact-byte vector mismatch: %', v_vector->>'id';
    end if;
  end loop;

  for v_id,v_vector in select key,value from pg_catalog.jsonb_each(v_canonical->'chunk_chains') loop
    select pg_catalog.encode(extensions.digest(coalesce(pg_catalog.string_agg(
      pg_catalog.decode(c.value->>'sha256','hex'),''::bytea order by m.ordinality
    ),''::bytea),'sha256'),'hex')
      into v_actual
      from pg_catalog.jsonb_array_elements_text(v_vector->'members') with ordinality as m(member,ordinality)
      join lateral (
        select item as value from pg_catalog.jsonb_array_elements(v_chunks->'vectors') as x(item)
         where item->>'id' = m.member
      ) as c on true;
    if v_actual <> v_vector->>'sha256' then
      raise exception 'chunk-chain vector mismatch: %', v_id;
    end if;
  end loop;

  if 'T'||public.mtp_netstring('personal')||public.mtp_netstring('id:1')
       <> v_canonical#>>'{rows,task_personal,row,source_key}'
     or 'T'||public.mtp_netstring('work')||public.mtp_netstring('id:1')
       <> v_canonical#>>'{rows,task_work,row,source_key}'
     or v_canonical#>>'{rows,task_personal,row,source_key}'
       = v_canonical#>>'{rows,task_work,row,source_key}' then
    raise exception 'task namespace vector mismatch';
  end if;
  if 'S'||public.mtp_netstring('T'||public.mtp_netstring('personal')||public.mtp_netstring('parent-a'))||public.mtp_netstring('42')
       <> v_canonical#>>'{rows,subtask_parent_a,row,source_key}'
     or v_canonical#>>'{rows,subtask_parent_a,row,source_key}'
       = v_canonical#>>'{rows,subtask_parent_b,row,source_key}' then
    raise exception 'parent-scoped subtask vector mismatch';
  end if;
  if v_canonical#>>'{rows,task_null,sha256}' = v_canonical#>>'{rows,task_empty,sha256}'
     or v_canonical#>>'{rows,task_nfc,sha256}' <> v_canonical#>>'{rows,task_nfd,sha256}'
     or v_canonical#>>'{rows,delimiter_single,sha256}' = v_canonical#>>'{rows,delimiter_split,sha256}'
     or v_canonical#>>'{sets,tasks_ab,sha256}' <> v_canonical#>>'{sets,tasks_ba,sha256}'
     or v_canonical#>>'{sets,task_single,sha256}' = v_canonical#>>'{sets,task_double,sha256}'
     or v_canonical#>>'{sets,windows_original,sha256}' = v_canonical#>>'{sets,windows_reordered,sha256}'
     or v_canonical#>>'{sets,events_ab,sha256}' <> v_canonical#>>'{sets,events_ba,sha256}' then
    raise exception 'canonical relation vector mismatch';
  end if;
  if pg_catalog.encode(public.mtp_enc_bool(true),'hex') <> v_canonical#>>'{primitives,bool_true_hex}'
     or pg_catalog.encode(public.mtp_enc_text('1'),'hex') <> v_canonical#>>'{primitives,text_one_hex}'
     or v_canonical#>>'{primitives,bool_true_hex}' = v_canonical#>>'{primitives,text_one_hex}'
     or pg_catalog.encode(public.mtp_enc_date('2026-01-05'::date),'hex') <> v_canonical#>>'{primitives,date_hex}'
     or pg_catalog.encode(public.mtp_enc_text('2026-01-05'),'hex') <> v_canonical#>>'{primitives,text_date_hex}'
     or v_canonical#>>'{primitives,date_hex}' = v_canonical#>>'{primitives,text_date_hex}' then
    raise exception 'typed primitive vector mismatch';
  end if;
  if v_canonical#>>'{chunk_chains,full,sha256}' = v_canonical#>>'{chunk_chains,omitted,sha256}' then
    raise exception 'chunk omission vector mismatch';
  end if;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from pg_catalog.pg_tables
   where schemaname = 'public' and tablename in (
     'mtp_import_batches','mtp_import_chunks','mtp_import_staging','mtp_import_rejects',
     'mtp_tasks','mtp_subtasks','mtp_events','mtp_event_windows','mtp_task_attachments'
   );
  if v_count <> 9 then raise exception 'expected nine L0b tables, got %', v_count; end if;

  select count(*) into v_count from pg_catalog.pg_policies
   where schemaname = 'public' and tablename like 'mtp\_%' escape '\' and cmd = 'SELECT';
  if v_count <> 9 then raise exception 'expected nine owner SELECT policies, got %', v_count; end if;
  if exists (select 1 from pg_catalog.pg_policies
              where schemaname = 'public' and tablename like 'mtp\_%' escape '\' and cmd <> 'SELECT') then
    raise exception 'non-SELECT L0b RLS policy exists';
  end if;

  if exists (
    select 1 from (values
      ('anon'),('authenticated'),('service_role')
    ) as r(role_name)
    cross join (values
      ('mtp_import_staging_id_seq'),('mtp_import_rejects_id_seq')
    ) as s(sequence_name)
    cross join (values ('USAGE'),('SELECT'),('UPDATE')) as p(privilege_name)
    where pg_catalog.has_sequence_privilege(r.role_name, 'public.'||s.sequence_name, p.privilege_name)
  ) then raise exception 'L0b identity sequence privilege leaked'; end if;

  if exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'mtp\_%' escape '\'
      and p.proname not in (
        'mtp_import_claim','mtp_import_heartbeat','mtp_import_stage',
        'mtp_import_finalize','mtp_import_abort','mtp_import_purge_staging'
      ) and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) then raise exception 'authenticated can execute an internal L0b function'; end if;

  if exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'mtp\_%' escape '\'
      and p.prosecdef
      and (p.proconfig is null or not (p.proconfig @> array['search_path=""']))
  ) then raise exception 'SECURITY DEFINER function lacks empty search_path'; end if;

  if exists (
    select 1 from (values
      ('mtp_import_batches'),('mtp_import_chunks'),('mtp_import_staging'),
      ('mtp_import_rejects'),('mtp_tasks'),('mtp_subtasks'),('mtp_events'),
      ('mtp_event_windows'),('mtp_task_attachments')
    ) as t(table_name)
    cross join (values ('anon'),('service_role')) as r(role_name)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) as p(privilege_name)
    where pg_catalog.has_table_privilege(r.role_name, 'public.'||t.table_name, p.privilege_name)
  ) then raise exception 'anon/service_role received a direct L0b table privilege'; end if;

  if pg_catalog.has_table_privilege('authenticated','public.mtp_import_staging','SELECT') then
    raise exception 'authenticated can read transient staging content';
  end if;
  if exists (
    select 1 from (values
      ('mtp_import_batches'),('mtp_import_chunks'),('mtp_import_rejects'),
      ('mtp_tasks'),('mtp_subtasks'),('mtp_events'),('mtp_event_windows'),
      ('mtp_task_attachments')
    ) as t(table_name)
    where not pg_catalog.has_table_privilege('authenticated','public.'||t.table_name,'SELECT')
       or pg_catalog.has_table_privilege('authenticated','public.'||t.table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
  ) then raise exception 'authenticated readable-table privileges are not SELECT-only'; end if;
end;
$$;

-- Compute exact-byte client evidence as the database owner, then exercise only
-- the six authenticated RPC entry points.
select $$[{"source_id":"task-1","task_kind":"personal","title":"First","status_text":"pending","category":"Home","priority":"High","due_date":"2026-08-20"}]$$ as task_payload \gset
select pg_catalog.encode(
  extensions.digest(
    extensions.digest(
      public.mtp_enc_int(0) || public.mtp_enc_text('task')
      || public.mtp_enc_bytes(pg_catalog.convert_to(:'task_payload','UTF8')),
      'sha256'
    ),
    'sha256'
  ), 'hex'
) as task_stream_hex \gset

select pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;

select batch_id as task_batch, generation as task_generation
from public.mtp_import_claim(pg_catalog.decode(:'task_stream_hex','hex'),1,120) \gset

select accepted, rejected, idempotent
from public.mtp_import_stage(
  :'task_batch'::uuid, :'task_generation'::bigint, 0, 'task', :'task_payload', true
) \gset task_stage_
select pg_catalog.set_config('mtp.test.task_batch', :'task_batch', false);
select pg_catalog.set_config('mtp.test.task_generation', :'task_generation', false);
select pg_catalog.set_config('mtp.test.task_stage_accepted', :'task_stage_accepted', false);
select pg_catalog.set_config('mtp.test.task_stage_rejected', :'task_stage_rejected', false);
select pg_catalog.set_config('mtp.test.task_stage_idempotent', :'task_stage_idempotent', false);

do $$
begin
  if pg_catalog.current_setting('mtp.test.task_stage_accepted')::integer <> 1
     or pg_catalog.current_setting('mtp.test.task_stage_rejected')::integer <> 0
     or pg_catalog.current_setting('mtp.test.task_stage_idempotent')::boolean then
    raise exception 'first task stage result mismatch';
  end if;
end;
$$;

select idempotent as retry_idempotent
from public.mtp_import_stage(
  :'task_batch'::uuid, :'task_generation'::bigint, 0, 'task', :'task_payload', true
) \gset
select pg_catalog.set_config('mtp.test.retry_idempotent', :'retry_idempotent', false);

do $$
begin
  if not pg_catalog.current_setting('mtp.test.retry_idempotent')::boolean then raise exception 'identical chunk retry was not idempotent'; end if;
  begin
    perform * from public.mtp_import_stage(
      pg_catalog.current_setting('mtp.test.task_batch')::uuid,
      pg_catalog.current_setting('mtp.test.task_generation')::bigint, 0, 'task',
      '[ {"source_id":"task-1","task_kind":"personal","title":"First"} ]', true
    );
    raise exception 'different exact bytes unexpectedly reused chunk sequence';
  exception when unique_violation then null;
  end;
end;
$$;

select status as task_status, reject_count as task_rejects
from public.mtp_import_finalize(:'task_batch'::uuid, :'task_generation'::bigint) \gset
select pg_catalog.set_config('mtp.test.task_status', :'task_status', false);
select pg_catalog.set_config('mtp.test.task_rejects', :'task_rejects', false);

do $$
declare v_id uuid;
begin
  if pg_catalog.current_setting('mtp.test.task_status') <> 'succeeded'
     or pg_catalog.current_setting('mtp.test.task_rejects')::integer <> 0 then
    raise exception 'task finalize mismatch';
  end if;
  select id into v_id from public.mtp_tasks where source_id_legacy = 'task-1';
  if v_id is null then raise exception 'normalized task missing'; end if;
  perform pg_catalog.set_config('mtp.test.task_uuid',v_id::text,false);
end;
$$;

-- Duplicate stable IDs quarantine the whole batch. No winner and no entity write.
reset role;
select $$[{"source_id":"dup","task_kind":"personal","title":"A"},{"source_id":"dup","task_kind":"personal","title":"B"}]$$ as dup_payload \gset
select pg_catalog.encode(extensions.digest(extensions.digest(
  public.mtp_enc_int(0)||public.mtp_enc_text('task')||public.mtp_enc_bytes(pg_catalog.convert_to(:'dup_payload','UTF8')),
  'sha256'),'sha256'),'hex') as dup_stream_hex \gset
set role authenticated;
select batch_id as dup_batch, generation as dup_generation
from public.mtp_import_claim(pg_catalog.decode(:'dup_stream_hex','hex'),1,120) \gset
select * from public.mtp_import_stage(:'dup_batch'::uuid,:'dup_generation'::bigint,0,'task',:'dup_payload',true);
select status as dup_status, reject_count as dup_rejects
from public.mtp_import_finalize(:'dup_batch'::uuid,:'dup_generation'::bigint) \gset
select pg_catalog.set_config('mtp.test.dup_batch', :'dup_batch', false);
select pg_catalog.set_config('mtp.test.dup_status', :'dup_status', false);
select pg_catalog.set_config('mtp.test.dup_rejects', :'dup_rejects', false);
do $$
begin
  if pg_catalog.current_setting('mtp.test.dup_status') <> 'partial'
     or pg_catalog.current_setting('mtp.test.dup_rejects')::integer <> 2 then
    raise exception 'duplicate quarantine mismatch';
  end if;
  if exists (select 1 from public.mtp_tasks where source_id_legacy = 'dup') then
    raise exception 'duplicate quarantine wrote an entity winner';
  end if;
  if exists (select 1 from public.mtp_import_staging
              where batch_id = pg_catalog.current_setting('mtp.test.dup_batch')::uuid) then
    raise exception 'terminal import retained staging content';
  end if;
exception when insufficient_privilege then
  -- Staging is intentionally unreadable to authenticated; inspect as owner below.
  null;
end;
$$;

-- A complete empty traversal is the only full-deactivation path.
select batch_id as empty_batch, generation as empty_generation
from public.mtp_import_claim(pg_catalog.decode('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','hex'),0,120) \gset
select status as empty_status
from public.mtp_import_finalize(:'empty_batch'::uuid,:'empty_generation'::bigint) \gset
select pg_catalog.set_config('mtp.test.empty_status', :'empty_status', false);
do $$
begin
  if pg_catalog.current_setting('mtp.test.empty_status') <> 'succeeded' then raise exception 'complete empty traversal failed'; end if;
  if exists (select 1 from public.mtp_tasks where is_active) then
    raise exception 'complete empty traversal did not tombstone active rows';
  end if;
end;
$$;

-- Re-import reactivates the original server UUID.
select batch_id as react_batch, generation as react_generation
from public.mtp_import_claim(pg_catalog.decode(:'task_stream_hex','hex'),1,120) \gset
select * from public.mtp_import_stage(:'react_batch'::uuid,:'react_generation'::bigint,0,'task',:'task_payload',true);
select status as react_status from public.mtp_import_finalize(:'react_batch'::uuid,:'react_generation'::bigint) \gset
select pg_catalog.set_config('mtp.test.react_batch', :'react_batch', false);
select pg_catalog.set_config('mtp.test.react_generation', :'react_generation', false);
select pg_catalog.set_config('mtp.test.react_status', :'react_status', false);
do $$
begin
  if pg_catalog.current_setting('mtp.test.react_status') <> 'succeeded' then raise exception 'reactivation import failed'; end if;
  if not exists (select 1 from public.mtp_tasks
                  where id = pg_catalog.current_setting('mtp.test.task_uuid')::uuid and is_active and version = 3) then
    raise exception 'reactivation did not preserve UUID/version semantics';
  end if;
end;
$$;

-- Owner B cannot observe or address owner A records.
reset role;
select pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$
begin
  if (select count(*) from public.mtp_tasks) <> 0 then raise exception 'RLS leaked owner A task'; end if;
  begin
    perform * from public.mtp_import_finalize(
      pg_catalog.current_setting('mtp.test.react_batch')::uuid,
      pg_catalog.current_setting('mtp.test.react_generation')::bigint
    );
    raise exception 'cross-owner batch probe unexpectedly succeeded';
  exception when insufficient_privilege then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    insert into public.mtp_tasks(owner_id,task_kind,source_key,source_id_legacy,title,
      first_seen_batch_id,last_seen_batch_id,content_hash)
    values ('00000000-0000-4000-8000-000000000002','personal','x','x','x',
      pg_catalog.current_setting('mtp.test.react_batch')::uuid,
      pg_catalog.current_setting('mtp.test.react_batch')::uuid,
      pg_catalog.decode(repeat('00',32),'hex'));
    raise exception 'authenticated direct insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  if exists (select 1 from public.mtp_import_staging) then
    raise exception 'terminal import left projected content in staging';
  end if;
  if not exists (select 1 from public.mtp_import_batches
                  where id = pg_catalog.current_setting('mtp.test.dup_batch')::uuid
                    and staging_purged_at is not null) then
    raise exception 'staging purge evidence missing';
  end if;
  if exists (select 1 from public.mtp_import_rejects
              where canonical_source_key is not null and reject_code <> 'duplicate_id') then
    raise exception 'reject identifier boundary violated';
  end if;
end;
$$;

select 'L0b SQL/RLS/identity/reconciliation lifecycle: PASS' as result;
