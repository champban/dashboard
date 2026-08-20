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
    cross join (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
      ('REFERENCES'),('TRIGGER'),('MAINTAIN')
    ) as p(privilege_name)
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
       or pg_catalog.has_table_privilege(
         'authenticated', 'public.'||t.table_name,
         'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
       )
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

-- Canonical byte snapshots make rollback assertions cover every column of all
-- five entity tables, including timestamps, versions and tombstone state.
create temporary table l0b_test_entity_snapshots (
  case_name text primary key,
  before_bytes bytea not null,
  after_bytes bytea
);

create function pg_temp.l0b_entity_bytes()
returns bytea
language sql
stable
set search_path = ''
as $$
  select pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'tasks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.owner_id, t.id)
      from public.mtp_tasks as t
    ), '[]'::jsonb),
    'subtasks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.owner_id, s.id)
      from public.mtp_subtasks as s
    ), '[]'::jsonb),
    'events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.owner_id, e.id)
      from public.mtp_events as e
    ), '[]'::jsonb),
    'event_windows', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w) order by w.owner_id, w.event_id, w.ordinal)
      from public.mtp_event_windows as w
    ), '[]'::jsonb),
    'task_attachments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.owner_id, a.id)
      from public.mtp_task_attachments as a
    ), '[]'::jsonb)
  )::text, 'UTF8')
$$;

create function pg_temp.l0b_chunk_hash(p_seq integer, p_kind text, p_payload text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(
    public.mtp_enc_int(p_seq::bigint)
    || public.mtp_enc_text(p_kind)
    || public.mtp_enc_bytes(pg_catalog.convert_to(p_payload, 'UTF8')),
    'sha256'
  )
$$;

create temporary table l0b_test_failure_results (
  case_name text primary key,
  status text not null,
  failure_code text,
  failure_sqlstate text
);

-- Force post-apply evidence divergence. The implicit PL/pgSQL savepoint must
-- roll back every entity byte while the outer function records L0B01.
select $$[{"source_id":"task-1","task_kind":"personal","title":"Mismatch","status_text":"pending","category":"Home","priority":"High","due_date":"2026-08-20"}]$$ as mismatch_payload \gset
select pg_catalog.encode(extensions.digest(
  pg_temp.l0b_chunk_hash(0, 'task', :'mismatch_payload'), 'sha256'
), 'hex') as mismatch_stream_hex \gset
insert into l0b_test_entity_snapshots(case_name, before_bytes)
values ('evidence_mismatch', pg_temp.l0b_entity_bytes());

create function pg_temp.l0b_force_hash_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_hash := extensions.digest(
    pg_catalog.convert_to('forced-evidence-mismatch', 'UTF8'), 'sha256'
  );
  return new;
end;
$$;
create trigger l0b_test_force_hash_mismatch
before insert or update on public.mtp_tasks
for each row execute function pg_temp.l0b_force_hash_mismatch();

select pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(pg_catalog.decode(:'mismatch_stream_hex','hex'),1,120) \gset mismatch_
select * from public.mtp_import_stage(
  :'mismatch_batch'::uuid, :'mismatch_generation'::bigint,
  0, 'task', :'mismatch_payload', true
);
select status as result_status, failure_code as result_code, failure_sqlstate as result_sqlstate
from public.mtp_import_finalize(
  :'mismatch_batch'::uuid, :'mismatch_generation'::bigint
) \gset mismatch_
reset role;
drop trigger l0b_test_force_hash_mismatch on public.mtp_tasks;
drop function pg_temp.l0b_force_hash_mismatch();
update l0b_test_entity_snapshots
set after_bytes = pg_temp.l0b_entity_bytes()
where case_name = 'evidence_mismatch';
insert into l0b_test_failure_results(case_name,status,failure_code,failure_sqlstate)
values ('evidence_mismatch', :'mismatch_result_status', :'mismatch_result_code', :'mismatch_result_sqlstate');

do $$
begin
  if not exists (
    select 1 from l0b_test_failure_results
    where case_name = 'evidence_mismatch' and status = 'failed'
      and failure_code = 'evidence_mismatch' and failure_sqlstate = 'L0B01'
  ) then
    raise exception 'evidence-mismatch failure classification was not persisted';
  end if;
  if exists (
    select 1 from l0b_test_entity_snapshots
    where case_name = 'evidence_mismatch' and before_bytes is distinct from after_bytes
  ) then
    raise exception 'evidence-mismatch rollback changed entity bytes';
  end if;
end;
$$;

-- Force a genuine constraint SQLSTATE inside Phase B and prove the same
-- all-or-nothing boundary plus bounded apply_exception evidence.
select $$[{"source_id":"task-1","task_kind":"personal","title":"Constraint fault","status_text":"pending","category":"Home","priority":"High","due_date":"2026-08-20"}]$$ as constraint_payload \gset
select pg_catalog.encode(extensions.digest(
  pg_temp.l0b_chunk_hash(0, 'task', :'constraint_payload'), 'sha256'
), 'hex') as constraint_stream_hex \gset
insert into l0b_test_entity_snapshots(case_name, before_bytes)
values ('apply_exception', pg_temp.l0b_entity_bytes());

create function pg_temp.l0b_force_constraint_fault()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'forced_constraint_fault' using errcode = '23514';
end;
$$;
create trigger l0b_test_force_constraint_fault
before insert or update on public.mtp_tasks
for each row execute function pg_temp.l0b_force_constraint_fault();

set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(pg_catalog.decode(:'constraint_stream_hex','hex'),1,120) \gset constraint_
select * from public.mtp_import_stage(
  :'constraint_batch'::uuid, :'constraint_generation'::bigint,
  0, 'task', :'constraint_payload', true
);
select status as result_status, failure_code as result_code, failure_sqlstate as result_sqlstate
from public.mtp_import_finalize(
  :'constraint_batch'::uuid, :'constraint_generation'::bigint
) \gset constraint_
reset role;
drop trigger l0b_test_force_constraint_fault on public.mtp_tasks;
drop function pg_temp.l0b_force_constraint_fault();
update l0b_test_entity_snapshots
set after_bytes = pg_temp.l0b_entity_bytes()
where case_name = 'apply_exception';
insert into l0b_test_failure_results(case_name,status,failure_code,failure_sqlstate)
values ('apply_exception', :'constraint_result_status', :'constraint_result_code', :'constraint_result_sqlstate');

do $$
begin
  if not exists (
    select 1 from l0b_test_failure_results
    where case_name = 'apply_exception' and status = 'failed'
      and failure_code = 'apply_exception' and failure_sqlstate = '23514'
      and failure_sqlstate ~ '^[0-9A-Z]{5}$'
  ) then
    raise exception 'apply-exception failure classification was not persisted';
  end if;
  if exists (
    select 1 from l0b_test_entity_snapshots
    where case_name = 'apply_exception' and before_bytes is distinct from after_bytes
  ) then
    raise exception 'constraint-fault rollback changed entity bytes';
  end if;
  -- Phase-A duplicate evidence from the earlier partial batch must remain
  -- intact across later Phase-B savepoint rollbacks.
  if (select count(*) from public.mtp_import_rejects
      where batch_id = pg_catalog.current_setting('mtp.test.dup_batch')::uuid) <> 2 then
    raise exception 'Phase-A reject evidence was lost across Phase-B rollback';
  end if;
end;
$$;

-- Lease/generation fencing: active-claim denial, heartbeat, expired takeover,
-- staging purge and stale writer denial are all exercised in one session.
select pg_catalog.set_config('mtp.test.fence_stream_hex', :'task_stream_hex', false);
set role authenticated;
select batch_id as batch, generation as generation, lease_expires_at as lease_expires_at
from public.mtp_import_claim(pg_catalog.decode(:'task_stream_hex','hex'),1,30) \gset fence_old_
select pg_catalog.set_config('mtp.test.fence_old_batch', :'fence_old_batch', false);
select pg_catalog.set_config('mtp.test.fence_old_generation', :'fence_old_generation', false);

do $$
begin
  begin
    perform * from public.mtp_import_claim(
      pg_catalog.decode(pg_catalog.current_setting('mtp.test.fence_stream_hex'),'hex'), 1, 30
    );
    raise exception 'second active claim unexpectedly succeeded';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
end;
$$;

select * from public.mtp_import_stage(
  :'fence_old_batch'::uuid, :'fence_old_generation'::bigint,
  0, 'task', :'task_payload', true
);
select generation as generation, lease_expires_at as lease_expires_at
from public.mtp_import_heartbeat(
  :'fence_old_batch'::uuid, :'fence_old_generation'::bigint
) \gset fence_heartbeat_
reset role;
select pg_catalog.set_config('mtp.test.fence_heartbeat_generation', :'fence_heartbeat_generation', false);
select pg_catalog.set_config('mtp.test.fence_heartbeat_expiry', :'fence_heartbeat_lease_expires_at', false);
select pg_catalog.set_config('mtp.test.fence_old_expiry', :'fence_old_lease_expires_at', false);

do $$
begin
  if pg_catalog.current_setting('mtp.test.fence_heartbeat_generation')::bigint
       <> pg_catalog.current_setting('mtp.test.fence_old_generation')::bigint
     or pg_catalog.current_setting('mtp.test.fence_heartbeat_expiry')::timestamptz
       <= pg_catalog.current_setting('mtp.test.fence_old_expiry')::timestamptz then
    raise exception 'heartbeat did not extend the active generation lease';
  end if;
end;
$$;

update public.mtp_import_batches
set lease_expires_at = pg_catalog.now() - interval '1 second'
where id = :'fence_old_batch'::uuid;
set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(
  pg_catalog.decode('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','hex'),
  0, 120
) \gset fence_new_
select pg_catalog.set_config('mtp.test.fence_new_generation', :'fence_new_generation', false);
select pg_catalog.set_config('mtp.test.fence_new_batch', :'fence_new_batch', false);
reset role;

do $$
begin
  if not exists (
    select 1 from public.mtp_import_batches as old
    join public.mtp_import_batches as new on new.takeover_of = old.id and new.owner_id = old.owner_id
    where old.id = pg_catalog.current_setting('mtp.test.fence_old_batch')::uuid
      and old.status = 'expired' and old.failure_code = 'lease_expired'
      and old.staging_purged_at is not null
      and new.id = pg_catalog.current_setting('mtp.test.fence_new_batch')::uuid
      and new.generation = old.generation + 1
  ) then
    raise exception 'expired takeover evidence mismatch';
  end if;
  if exists (
    select 1 from public.mtp_import_staging
    where batch_id = pg_catalog.current_setting('mtp.test.fence_old_batch')::uuid
  ) then
    raise exception 'expired takeover retained stale staging';
  end if;
end;
$$;

set role authenticated;
do $$
begin
  begin
    perform * from public.mtp_import_stage(
      pg_catalog.current_setting('mtp.test.fence_old_batch')::uuid,
      pg_catalog.current_setting('mtp.test.fence_old_generation')::bigint,
      1, 'task', '[]', false
    );
    raise exception 'stale stage unexpectedly succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    perform * from public.mtp_import_finalize(
      pg_catalog.current_setting('mtp.test.fence_old_batch')::uuid,
      pg_catalog.current_setting('mtp.test.fence_new_generation')::bigint
    );
    raise exception 'stale finalize unexpectedly succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    perform * from public.mtp_import_abort(
      pg_catalog.current_setting('mtp.test.fence_old_batch')::uuid,
      pg_catalog.current_setting('mtp.test.fence_old_generation')::bigint
    );
    raise exception 'stale abort unexpectedly succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    perform * from public.mtp_import_heartbeat(
      pg_catalog.current_setting('mtp.test.fence_old_batch')::uuid,
      pg_catalog.current_setting('mtp.test.fence_old_generation')::bigint
    );
    raise exception 'stale heartbeat unexpectedly succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
end;
$$;
select * from public.mtp_import_abort(
  :'fence_new_batch'::uuid, :'fence_new_generation'::bigint
);
reset role;

-- Stream completeness: a gap and a final chunk before n-1 must each fail
-- without changing a single entity byte.
select pg_catalog.encode(extensions.digest(
  pg_temp.l0b_chunk_hash(0, 'task', '[]')
  || pg_temp.l0b_chunk_hash(2, 'task', '[]'),
  'sha256'
), 'hex') as gap_stream_hex \gset
insert into l0b_test_entity_snapshots(case_name,before_bytes)
values ('stream_gap',pg_temp.l0b_entity_bytes());
set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(pg_catalog.decode(:'gap_stream_hex','hex'),3,120) \gset gap_
select * from public.mtp_import_stage(:'gap_batch'::uuid,:'gap_generation'::bigint,0,'task','[]',false);
select * from public.mtp_import_stage(:'gap_batch'::uuid,:'gap_generation'::bigint,2,'task','[]',true);
select status as result_status, failure_code as result_code
from public.mtp_import_finalize(:'gap_batch'::uuid,:'gap_generation'::bigint) \gset gap_
reset role;
select pg_catalog.set_config('mtp.test.gap_status', :'gap_result_status', false);
select pg_catalog.set_config('mtp.test.gap_code', :'gap_result_code', false);
update l0b_test_entity_snapshots set after_bytes=pg_temp.l0b_entity_bytes()
where case_name='stream_gap';

select pg_catalog.encode(extensions.digest(
  pg_temp.l0b_chunk_hash(0, 'task', '[]')
  || pg_temp.l0b_chunk_hash(1, 'task', '[]'),
  'sha256'
), 'hex') as early_final_stream_hex \gset
insert into l0b_test_entity_snapshots(case_name,before_bytes)
values ('early_final',pg_temp.l0b_entity_bytes());
set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(pg_catalog.decode(:'early_final_stream_hex','hex'),3,120) \gset early_final_
select * from public.mtp_import_stage(:'early_final_batch'::uuid,:'early_final_generation'::bigint,0,'task','[]',false);
select * from public.mtp_import_stage(:'early_final_batch'::uuid,:'early_final_generation'::bigint,1,'task','[]',true);
select status as result_status, failure_code as result_code
from public.mtp_import_finalize(:'early_final_batch'::uuid,:'early_final_generation'::bigint) \gset early_final_
reset role;
select pg_catalog.set_config('mtp.test.early_final_status', :'early_final_result_status', false);
select pg_catalog.set_config('mtp.test.early_final_code', :'early_final_result_code', false);
update l0b_test_entity_snapshots set after_bytes=pg_temp.l0b_entity_bytes()
where case_name='early_final';

do $$
begin
  if pg_catalog.current_setting('mtp.test.gap_status') <> 'failed'
     or pg_catalog.current_setting('mtp.test.gap_code') <> 'stream_incomplete'
     or pg_catalog.current_setting('mtp.test.early_final_status') <> 'failed'
     or pg_catalog.current_setting('mtp.test.early_final_code') <> 'stream_incomplete' then
    raise exception 'stream-incomplete failure classification mismatch';
  end if;
  if exists (
    select 1 from l0b_test_entity_snapshots
    where case_name in ('stream_gap','early_final')
      and before_bytes is distinct from after_bytes
  ) then
    raise exception 'stream-incomplete path changed entity bytes';
  end if;
end;
$$;

-- Missing dates and missing parent_task_kind must be classified rejects, not
-- NULL-swallowed constraint failures that abort mtp_import_stage.
select $$[{"parent_source_id":"event-missing-date","ordinal":0,"window_end":"2026-08-21"}]$$ as missing_date_payload \gset
select pg_catalog.encode(extensions.digest(
  pg_temp.l0b_chunk_hash(0,'event_window',:'missing_date_payload'),'sha256'
),'hex') as missing_date_stream_hex \gset
set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(pg_catalog.decode(:'missing_date_stream_hex','hex'),1,120) \gset missing_date_
select accepted as stage_accepted, rejected as stage_rejected
from public.mtp_import_stage(
  :'missing_date_batch'::uuid,:'missing_date_generation'::bigint,
  0,'event_window',:'missing_date_payload',true
) \gset missing_date_
select status as result_status
from public.mtp_import_finalize(
  :'missing_date_batch'::uuid,:'missing_date_generation'::bigint
) \gset missing_date_
reset role;
select pg_catalog.set_config('mtp.test.missing_date_batch', :'missing_date_batch', false);
select pg_catalog.set_config('mtp.test.missing_date_accepted', :'missing_date_stage_accepted', false);
select pg_catalog.set_config('mtp.test.missing_date_rejected', :'missing_date_stage_rejected', false);
select pg_catalog.set_config('mtp.test.missing_date_status', :'missing_date_result_status', false);

select $$[{"source_id":"sub-missing-kind","parent_source_id":"task-1","ordinal":0,"text":"Child","done":false}]$$ as missing_kind_payload \gset
select pg_catalog.encode(extensions.digest(
  pg_temp.l0b_chunk_hash(0,'subtask',:'missing_kind_payload'),'sha256'
),'hex') as missing_kind_stream_hex \gset
set role authenticated;
select batch_id as batch, generation as generation
from public.mtp_import_claim(pg_catalog.decode(:'missing_kind_stream_hex','hex'),1,120) \gset missing_kind_
select accepted as stage_accepted, rejected as stage_rejected
from public.mtp_import_stage(
  :'missing_kind_batch'::uuid,:'missing_kind_generation'::bigint,
  0,'subtask',:'missing_kind_payload',true
) \gset missing_kind_
select status as result_status
from public.mtp_import_finalize(
  :'missing_kind_batch'::uuid,:'missing_kind_generation'::bigint
) \gset missing_kind_
reset role;
select pg_catalog.set_config('mtp.test.missing_kind_batch', :'missing_kind_batch', false);
select pg_catalog.set_config('mtp.test.missing_kind_accepted', :'missing_kind_stage_accepted', false);
select pg_catalog.set_config('mtp.test.missing_kind_rejected', :'missing_kind_stage_rejected', false);
select pg_catalog.set_config('mtp.test.missing_kind_status', :'missing_kind_result_status', false);

do $$
begin
  if pg_catalog.current_setting('mtp.test.missing_date_accepted')::integer <> 0
     or pg_catalog.current_setting('mtp.test.missing_date_rejected')::integer <> 1
     or pg_catalog.current_setting('mtp.test.missing_date_status') <> 'partial'
     or not exists (
       select 1 from public.mtp_import_rejects
       where batch_id=pg_catalog.current_setting('mtp.test.missing_date_batch')::uuid
         and kind='event_window'
         and reject_code='field_invalid'
     ) then
    raise exception 'missing event-window date was not a field_invalid reject';
  end if;
  if pg_catalog.current_setting('mtp.test.missing_kind_accepted')::integer <> 0
     or pg_catalog.current_setting('mtp.test.missing_kind_rejected')::integer <> 1
     or pg_catalog.current_setting('mtp.test.missing_kind_status') <> 'partial'
     or not exists (
       select 1 from public.mtp_import_rejects
       where batch_id=pg_catalog.current_setting('mtp.test.missing_kind_batch')::uuid
         and kind='subtask'
         and reject_code='parent_rejected'
     ) then
    raise exception 'missing parent_task_kind was not a parent_rejected row';
  end if;
end;
$$;

select 'L0b SQL/RLS/identity/reconciliation lifecycle: PASS' as result;
