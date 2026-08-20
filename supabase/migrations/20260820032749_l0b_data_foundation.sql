-- L0b normalized planner projection and manual import protocol.
--
-- Source-only artifact: committing this file does not authorize applying it to
-- any Supabase project. Google Drive remains the authoritative Todo store until
-- a separately approved and Production-verified L1 cutover.

create table public.mtp_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation bigint not null check (generation > 0),
  attempt integer not null default 1 check (attempt > 0),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed', 'expired')),
  declared_chunk_count integer not null check (declared_chunk_count between 0 and 10000),
  client_payload_hash bytea not null check (octet_length(client_payload_hash) = 32),
  stream_hash bytea check (stream_hash is null or octet_length(stream_hash) = 32),
  payload_hash bytea check (payload_hash is null or octet_length(payload_hash) = 32),
  stored_hash bytea check (stored_hash is null or octet_length(stored_hash) = 32),
  tombstone_hash bytea check (tombstone_hash is null or octet_length(tombstone_hash) = 32),
  hashes_compared boolean not null default false,
  counts jsonb,
  reject_count integer not null default 0 check (reject_count >= 0),
  traversal_complete boolean,
  started_at timestamptz not null default pg_catalog.now(),
  heartbeat_at timestamptz not null default pg_catalog.now(),
  lease_expires_at timestamptz not null,
  finished_at timestamptz,
  takeover_of uuid,
  failure_code text check (failure_code is null or failure_code in (
    'lease_expired', 'stale_lease', 'chunk_conflict', 'stream_incomplete',
    'evidence_mismatch', 'apply_exception', 'client_abort'
  )),
  failure_sqlstate text check (failure_sqlstate is null or failure_sqlstate ~ '^[0-9A-Z]{5}$'),
  staging_purged_at timestamptz,
  constraint mtp_import_batches_owner_id_uniq unique (owner_id, id),
  constraint mtp_import_batches_owner_generation_uniq unique (owner_id, generation),
  constraint mtp_import_batches_takeover_fk foreign key (owner_id, takeover_of)
    references public.mtp_import_batches(owner_id, id),
  constraint mtp_import_batches_terminal_time_check
    check ((status = 'running') = (finished_at is null)),
  constraint mtp_import_batches_success_evidence_check
    check (status <> 'succeeded' or hashes_compared)
);

create unique index mtp_import_batches_one_active_idx
  on public.mtp_import_batches(owner_id) where status = 'running';
create index mtp_import_batches_owner_started_idx
  on public.mtp_import_batches(owner_id, started_at desc);

create table public.mtp_import_chunks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  chunk_seq integer not null check (chunk_seq >= 0),
  kind text not null check (kind in ('task', 'subtask', 'event', 'event_window', 'task_attachment')),
  row_count integer not null check (row_count between 0 and 2000),
  chunk_hash bytea not null check (octet_length(chunk_hash) = 32),
  is_final boolean not null default false,
  received_at timestamptz not null default pg_catalog.now(),
  primary key (owner_id, batch_id, chunk_seq),
  constraint mtp_import_chunks_batch_fk foreign key (owner_id, batch_id)
    references public.mtp_import_batches(owner_id, id) on delete cascade
);

create unique index mtp_import_chunks_one_final_idx
  on public.mtp_import_chunks(owner_id, batch_id) where is_final;

create table public.mtp_import_staging (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  chunk_seq integer not null,
  row_index integer not null check (row_index >= 0),
  kind text not null check (kind in ('task', 'subtask', 'event', 'event_window', 'task_attachment')),
  source_key text,
  parent_source_key text,
  ordinal integer,
  projected jsonb not null,
  row_hash bytea not null check (octet_length(row_hash) = 32),
  constraint mtp_import_staging_row_uniq unique (owner_id, batch_id, chunk_seq, row_index),
  constraint mtp_import_staging_batch_fk foreign key (owner_id, batch_id)
    references public.mtp_import_batches(owner_id, id) on delete cascade,
  constraint mtp_import_staging_chunk_fk foreign key (owner_id, batch_id, chunk_seq)
    references public.mtp_import_chunks(owner_id, batch_id, chunk_seq) on delete cascade
);

create table public.mtp_import_rejects (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  kind text not null check (kind in ('task', 'subtask', 'event', 'event_window', 'task_attachment')),
  reject_code text not null check (reject_code in (
    'missing_id', 'empty_id', 'malformed_id', 'oversize_id', 'duplicate_id',
    'orphan_parent', 'parent_rejected', 'binary_attachment', 'insecure_href',
    'field_invalid'
  )),
  canonical_source_key text,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  chunk_seq integer,
  row_index integer,
  content_fingerprint bytea check (content_fingerprint is null or octet_length(content_fingerprint) = 32),
  detail jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint mtp_import_rejects_duplicate_key_check check (
    (reject_code = 'duplicate_id') = (canonical_source_key is not null)
  ),
  constraint mtp_import_rejects_batch_fk foreign key (owner_id, batch_id)
    references public.mtp_import_batches(owner_id, id) on delete cascade
);

create table public.mtp_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_kind text not null check (task_kind in ('personal', 'work')),
  source_key text not null,
  source_id_legacy text not null,
  title text not null check (char_length(title) <= 500),
  status_text text check (status_text is null or char_length(status_text) <= 100),
  category text check (category is null or char_length(category) <= 100),
  priority text check (priority is null or char_length(priority) <= 50),
  due_date date,
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  first_seen_batch_id uuid not null,
  last_seen_batch_id uuid not null,
  content_hash bytea not null check (octet_length(content_hash) = 32),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_tasks_owner_source_uniq unique (owner_id, source_key),
  constraint mtp_tasks_owner_id_uniq unique (owner_id, id),
  constraint mtp_tasks_tombstone_consistent check (is_active = (source_deleted_at is null)),
  constraint mtp_tasks_first_batch_fk foreign key (owner_id, first_seen_batch_id)
    references public.mtp_import_batches(owner_id, id),
  constraint mtp_tasks_last_batch_fk foreign key (owner_id, last_seen_batch_id)
    references public.mtp_import_batches(owner_id, id)
);

create table public.mtp_subtasks (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  source_key text not null,
  source_id_legacy text not null,
  text text not null check (char_length(text) <= 4000),
  done boolean not null,
  ordinal integer not null check (ordinal >= 0),
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  first_seen_batch_id uuid not null,
  last_seen_batch_id uuid not null,
  content_hash bytea not null check (octet_length(content_hash) = 32),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_subtasks_owner_source_uniq unique (owner_id, source_key),
  constraint mtp_subtasks_tombstone_consistent check (is_active = (source_deleted_at is null)),
  constraint mtp_subtasks_task_fk foreign key (owner_id, task_id)
    references public.mtp_tasks(owner_id, id) on delete cascade,
  constraint mtp_subtasks_first_batch_fk foreign key (owner_id, first_seen_batch_id)
    references public.mtp_import_batches(owner_id, id),
  constraint mtp_subtasks_last_batch_fk foreign key (owner_id, last_seen_batch_id)
    references public.mtp_import_batches(owner_id, id)
);

create table public.mtp_events (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  source_id_legacy text not null,
  title text not null check (char_length(title) <= 500),
  event_type text check (event_type is null or char_length(event_type) <= 100),
  category text check (category is null or char_length(category) <= 100),
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  first_seen_batch_id uuid not null,
  last_seen_batch_id uuid not null,
  content_hash bytea not null check (octet_length(content_hash) = 32),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_events_owner_source_uniq unique (owner_id, source_key),
  constraint mtp_events_owner_id_uniq unique (owner_id, id),
  constraint mtp_events_tombstone_consistent check (is_active = (source_deleted_at is null)),
  constraint mtp_events_first_batch_fk foreign key (owner_id, first_seen_batch_id)
    references public.mtp_import_batches(owner_id, id),
  constraint mtp_events_last_batch_fk foreign key (owner_id, last_seen_batch_id)
    references public.mtp_import_batches(owner_id, id)
);

create table public.mtp_event_windows (
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  window_start date not null,
  window_end date not null,
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  first_seen_batch_id uuid not null,
  last_seen_batch_id uuid not null,
  content_hash bytea not null check (octet_length(content_hash) = 32),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (owner_id, event_id, ordinal),
  constraint mtp_event_windows_tombstone_consistent check (is_active = (source_deleted_at is null)),
  constraint mtp_event_windows_event_fk foreign key (owner_id, event_id)
    references public.mtp_events(owner_id, id) on delete cascade,
  constraint mtp_event_windows_first_batch_fk foreign key (owner_id, first_seen_batch_id)
    references public.mtp_import_batches(owner_id, id),
  constraint mtp_event_windows_last_batch_fk foreign key (owner_id, last_seen_batch_id)
    references public.mtp_import_batches(owner_id, id)
);

create table public.mtp_task_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  source_key text not null,
  source_id_legacy text not null,
  ordinal integer not null check (ordinal >= 0),
  attachment_kind text not null check (attachment_kind in ('link', 'file_ref')),
  display_name text check (display_name is null or char_length(display_name) <= 300),
  href text check (href is null or (char_length(href) <= 2048 and href ~ '^https://')),
  mime_type text check (mime_type is null or char_length(mime_type) <= 128),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  is_active boolean not null default true,
  source_deleted_at timestamptz,
  first_seen_batch_id uuid not null,
  last_seen_batch_id uuid not null,
  content_hash bytea not null check (octet_length(content_hash) = 32),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mtp_task_attachments_owner_source_uniq unique (owner_id, source_key),
  constraint mtp_task_attachments_tombstone_consistent check (is_active = (source_deleted_at is null)),
  constraint mtp_task_attachments_task_fk foreign key (owner_id, task_id)
    references public.mtp_tasks(owner_id, id) on delete cascade,
  constraint mtp_task_attachments_first_batch_fk foreign key (owner_id, first_seen_batch_id)
    references public.mtp_import_batches(owner_id, id),
  constraint mtp_task_attachments_last_batch_fk foreign key (owner_id, last_seen_batch_id)
    references public.mtp_import_batches(owner_id, id)
);

create index mtp_tasks_owner_active_idx on public.mtp_tasks(owner_id, is_active);
create index mtp_subtasks_owner_task_active_idx on public.mtp_subtasks(owner_id, task_id, is_active);
create index mtp_events_owner_active_idx on public.mtp_events(owner_id, is_active);
create index mtp_event_windows_owner_event_active_idx on public.mtp_event_windows(owner_id, event_id, is_active);
create index mtp_task_attachments_owner_task_active_idx on public.mtp_task_attachments(owner_id, task_id, is_active);

create function public.mtp_reject_detail_ok(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d is null or (
    pg_catalog.jsonb_typeof(d) = 'object'
    and not exists (
      select 1
      from pg_catalog.jsonb_object_keys(d) as k
      where k not in ('field', 'reason', 'value_type', 'byte_length', 'item_count')
    )
  )
$$;

alter table public.mtp_import_rejects
  add constraint mtp_import_rejects_detail_whitelist
  check (public.mtp_reject_detail_ok(detail));

create function public.mtp_nfc(v text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.normalize(v)
$$;

create function public.mtp_netstring(v text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.octet_length(pg_catalog.convert_to(public.mtp_nfc(v), 'UTF8'))::text
         || ':' || public.mtp_nfc(v)
$$;

create function public.mtp_canon_source_id(v jsonb)
returns table (canonical text, legacy text, reject_code text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text;
  v_text text;
  v_number numeric;
begin
  if v is null or pg_catalog.jsonb_typeof(v) = 'null' then
    return query select null::text, null::text, 'missing_id'::text;
    return;
  end if;
  v_type := pg_catalog.jsonb_typeof(v);
  if v_type = 'string' then
    v_text := public.mtp_nfc(v #>> '{}');
    if v_text = '' or v_text ~ '^[[:space:]]*$' then
      return query select null::text, null::text, 'empty_id'::text;
    elsif v_text ~ '[[:cntrl:]]' then
      return query select null::text, null::text, 'malformed_id'::text;
    elsif pg_catalog.octet_length(pg_catalog.convert_to(v_text, 'UTF8')) > 200 then
      return query select null::text, null::text, 'oversize_id'::text;
    end if;
    return query select v_text, (v #>> '{}'), null::text;
    return;
  elsif v_type = 'number' then
    v_number := (v #>> '{}')::numeric;
    if v_number <> pg_catalog.trunc(v_number)
       or pg_catalog.abs(v_number) > 9007199254740991::numeric then
      return query select null::text, null::text, 'malformed_id'::text;
      return;
    end if;
    v_text := pg_catalog.trunc(v_number)::text;
    return query select v_text, (v #>> '{}'), null::text;
    return;
  end if;
  return query select null::text, null::text, 'malformed_id'::text;
end;
$$;

create function public.mtp_enc_null()
returns bytea language sql immutable set search_path = ''
as $$ select pg_catalog.convert_to('N0:', 'UTF8') $$;

create function public.mtp_enc_bool(v boolean)
returns bytea language sql immutable set search_path = ''
as $$ select pg_catalog.convert_to(case when v then 'B1:1' else 'B1:0' end, 'UTF8') $$;

create function public.mtp_enc_int(v bigint)
returns bytea language sql immutable strict set search_path = ''
as $$
  select pg_catalog.convert_to('I' || pg_catalog.octet_length(pg_catalog.convert_to(v::text, 'UTF8'))::text || ':' || v::text, 'UTF8')
$$;

create function public.mtp_enc_text(v text)
returns bytea language sql immutable strict set search_path = ''
as $$
  select pg_catalog.convert_to('S' || public.mtp_netstring(v), 'UTF8')
$$;

create function public.mtp_enc_date(v date)
returns bytea language sql immutable strict set search_path = ''
as $$
  select pg_catalog.convert_to('D10:' || pg_catalog.to_char(v, 'YYYY-MM-DD'), 'UTF8')
$$;

create function public.mtp_enc_bytes(v bytea)
returns bytea language sql immutable strict set search_path = ''
as $$
  select pg_catalog.convert_to('P' || pg_catalog.octet_length(v)::text || ':', 'UTF8') || v
$$;

create function public.mtp_enc_nullable_text(v text)
returns bytea language sql immutable set search_path = ''
as $$ select case when v is null then public.mtp_enc_null() else public.mtp_enc_text(v) end $$;

create function public.mtp_enc_nullable_int(v bigint)
returns bytea language sql immutable set search_path = ''
as $$ select case when v is null then public.mtp_enc_null() else public.mtp_enc_int(v) end $$;

create function public.mtp_enc_nullable_date(v date)
returns bytea language sql immutable set search_path = ''
as $$ select case when v is null then public.mtp_enc_null() else public.mtp_enc_date(v) end $$;

create function public.mtp_row_bytes(
  p_kind text,
  p_source_key text,
  p_parent_source_key text,
  p_ordinal integer,
  p_is_active boolean,
  p_projected jsonb
)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  v bytea;
begin
  v := public.mtp_enc_text(p_kind)
       || public.mtp_enc_nullable_text(p_source_key)
       || public.mtp_enc_nullable_text(p_parent_source_key)
       || public.mtp_enc_nullable_int(p_ordinal)
       || public.mtp_enc_bool(p_is_active);
  if p_kind = 'task' then
    return v || public.mtp_enc_text(p_projected->>'task_kind')
      || public.mtp_enc_text(p_projected->>'title')
      || public.mtp_enc_nullable_text(p_projected->>'status_text')
      || public.mtp_enc_nullable_text(p_projected->>'category')
      || public.mtp_enc_nullable_text(p_projected->>'priority')
      || public.mtp_enc_nullable_date((p_projected->>'due_date')::date);
  elsif p_kind = 'subtask' then
    return v || public.mtp_enc_text(p_projected->>'text')
      || public.mtp_enc_bool((p_projected->>'done')::boolean)
      || public.mtp_enc_int((p_projected->>'ordinal')::bigint);
  elsif p_kind = 'event' then
    return v || public.mtp_enc_text(p_projected->>'title')
      || public.mtp_enc_nullable_text(p_projected->>'event_type')
      || public.mtp_enc_nullable_text(p_projected->>'category');
  elsif p_kind = 'event_window' then
    return v || public.mtp_enc_date((p_projected->>'window_start')::date)
      || public.mtp_enc_date((p_projected->>'window_end')::date);
  elsif p_kind = 'task_attachment' then
    return v || public.mtp_enc_text(p_projected->>'attachment_kind')
      || public.mtp_enc_nullable_text(p_projected->>'display_name')
      || public.mtp_enc_nullable_text(p_projected->>'href')
      || public.mtp_enc_nullable_text(p_projected->>'mime_type')
      || public.mtp_enc_nullable_int((p_projected->>'byte_size')::bigint)
      || public.mtp_enc_int((p_projected->>'ordinal')::bigint);
  end if;
  raise exception 'unsupported_kind' using errcode = '22023';
end;
$$;

create function public.mtp_row_hash(
  p_kind text,
  p_source_key text,
  p_parent_source_key text,
  p_ordinal integer,
  p_is_active boolean,
  p_projected jsonb
)
returns bytea language sql immutable set search_path = ''
as $$
  select extensions.digest(public.mtp_row_bytes(p_kind, p_source_key, p_parent_source_key, p_ordinal, p_is_active, p_projected), 'sha256')
$$;

create function public.mtp_set_hash(p_hashes bytea[])
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(
    coalesce((
      select pg_catalog.string_agg(hash_value, ''::bytea order by hash_value)
      from pg_catalog.unnest(p_hashes) as x(hash_value)
    ), ''::bytea),
    'sha256'
  )
$$;

create function public.mtp_touch_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name <> 'mtp_event_windows' then
    new.id := old.id;
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

create trigger mtp_tasks_touch_version before update on public.mtp_tasks
  for each row execute function public.mtp_touch_version();
create trigger mtp_subtasks_touch_version before update on public.mtp_subtasks
  for each row execute function public.mtp_touch_version();
create trigger mtp_events_touch_version before update on public.mtp_events
  for each row execute function public.mtp_touch_version();
create trigger mtp_event_windows_touch_version before update on public.mtp_event_windows
  for each row execute function public.mtp_touch_version();
create trigger mtp_task_attachments_touch_version before update on public.mtp_task_attachments
  for each row execute function public.mtp_touch_version();

create function public.mtp_import_purge_batch_staging(p_owner uuid, p_batch_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint := 0;
begin
  delete from public.mtp_import_staging
   where owner_id = p_owner and batch_id = p_batch_id;
  get diagnostics v_deleted = row_count;
  update public.mtp_import_batches
     set staging_purged_at = coalesce(staging_purged_at, pg_catalog.now())
   where owner_id = p_owner and id = p_batch_id and status <> 'running';
  return v_deleted;
end;
$$;

create function public.mtp_import_claim(
  p_client_payload_hash bytea,
  p_declared_chunk_count integer,
  p_lease_seconds integer default 120
)
returns table (batch_id uuid, generation bigint, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_running public.mtp_import_batches%rowtype;
  v_takeover uuid;
  v_generation bigint;
  v_lease integer;
  v_batch uuid;
  v_expiry timestamptz;
begin
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_client_payload_hash is null or pg_catalog.octet_length(p_client_payload_hash) <> 32
     or p_declared_chunk_count is null or p_declared_chunk_count not between 0 and 10000 then
    raise exception 'invalid_import_claim' using errcode = '22023';
  end if;
  v_lease := pg_catalog.least(600, pg_catalog.greatest(30, coalesce(p_lease_seconds, 120)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 7640821));

  select * into v_running
    from public.mtp_import_batches
   where owner_id = v_owner and status = 'running'
   for update;
  if found and v_running.lease_expires_at > pg_catalog.now() then
    raise exception 'import_in_progress' using errcode = '55000';
  elsif found then
    update public.mtp_import_batches
       set status = 'expired', failure_code = 'lease_expired',
           finished_at = pg_catalog.now(), traversal_complete = false
     where owner_id = v_owner and id = v_running.id and status = 'running';
    perform public.mtp_import_purge_batch_staging(v_owner, v_running.id);
    v_takeover := v_running.id;
  end if;

  select coalesce(pg_catalog.max(b.generation), 0) + 1
    into v_generation
    from public.mtp_import_batches as b
   where b.owner_id = v_owner;
  v_expiry := pg_catalog.now() + pg_catalog.make_interval(secs => v_lease);
  insert into public.mtp_import_batches (
    owner_id, generation, declared_chunk_count, client_payload_hash,
    lease_expires_at, takeover_of
  ) values (
    v_owner, v_generation, p_declared_chunk_count, p_client_payload_hash,
    v_expiry, v_takeover
  ) returning id into v_batch;
  return query select v_batch, v_generation, v_expiry;
end;
$$;

create function public.mtp_import_heartbeat(p_batch_id uuid, p_generation bigint)
returns table (generation bigint, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_expiry timestamptz;
begin
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  update public.mtp_import_batches as b
     set heartbeat_at = pg_catalog.now(),
         lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => 120)
   where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation
     and b.status = 'running' and b.lease_expires_at > pg_catalog.now()
     and b.generation = (
       select pg_catalog.max(x.generation) from public.mtp_import_batches as x
        where x.owner_id = v_owner
     )
  returning b.lease_expires_at into v_expiry;
  if not found then
    raise exception 'import_not_available' using errcode = '42501';
  end if;
  return query select p_generation, v_expiry;
end;
$$;

create function public.mtp_import_stage(
  p_batch_id uuid,
  p_generation bigint,
  p_chunk_seq integer,
  p_kind text,
  p_chunk_payload text,
  p_is_final boolean
)
returns table (accepted integer, rejected integer, chunk_hash bytea, idempotent boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_rows jsonb;
  v_bytes bytea;
  v_hash bytea;
  v_existing public.mtp_import_chunks%rowtype;
  v_inserted integer := 0;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_rec record;
  v_row jsonb;
  v_source_canon text;
  v_source_legacy text;
  v_source_reject text;
  v_parent_canon text;
  v_parent_reject text;
  v_parent_key text;
  v_source_key text;
  v_projected jsonb;
  v_reject_code text;
  v_reject_detail jsonb;
  v_ordinal integer;
  v_task_kind text;
  v_text text;
  v_href text;
  v_date_start text;
  v_date_end text;
begin
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_chunk_payload is null
     or pg_catalog.octet_length(pg_catalog.convert_to(p_chunk_payload, 'UTF8')) > 1048576
     or p_kind not in ('task', 'subtask', 'event', 'event_window', 'task_attachment')
     or p_chunk_seq is null or p_chunk_seq < 0 or p_is_final is null then
    raise exception 'invalid_chunk' using errcode = '22023';
  end if;
  if not pg_catalog.pg_input_is_valid(p_chunk_payload, 'jsonb') then
    raise exception 'invalid_chunk_json' using errcode = '22P02';
  end if;
  v_rows := p_chunk_payload::jsonb;
  if pg_catalog.jsonb_typeof(v_rows) <> 'array'
     or pg_catalog.jsonb_array_length(v_rows) > 2000 then
    raise exception 'invalid_chunk_rows' using errcode = '22023';
  end if;
  v_bytes := pg_catalog.convert_to(p_chunk_payload, 'UTF8');
  v_hash := extensions.digest(
    public.mtp_enc_int(p_chunk_seq::bigint)
    || public.mtp_enc_text(p_kind)
    || public.mtp_enc_bytes(v_bytes),
    'sha256'
  );

  perform 1
    from public.mtp_import_batches as b
   where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation
     and b.status = 'running' and b.lease_expires_at > pg_catalog.now()
     and b.generation = (
       select pg_catalog.max(x.generation) from public.mtp_import_batches as x
        where x.owner_id = v_owner
     )
   for update;
  if not found then
    raise exception 'import_not_available' using errcode = '42501';
  end if;

  select * into v_existing
    from public.mtp_import_chunks as c
   where c.owner_id = v_owner and c.batch_id = p_batch_id and c.chunk_seq = p_chunk_seq;
  if found then
    if v_existing.chunk_hash = v_hash and v_existing.kind = p_kind
       and v_existing.is_final = p_is_final then
      return query select v_existing.row_count, 0, v_hash, true;
      return;
    end if;
    raise exception 'chunk_conflict' using errcode = '23505';
  end if;
  if p_is_final and exists (
    select 1 from public.mtp_import_chunks as c
     where c.owner_id = v_owner and c.batch_id = p_batch_id and c.is_final
  ) then
    raise exception 'chunk_conflict' using errcode = '23505';
  end if;

  insert into public.mtp_import_chunks (
    owner_id, batch_id, chunk_seq, kind, row_count, chunk_hash, is_final
  ) values (
    v_owner, p_batch_id, p_chunk_seq, p_kind,
    pg_catalog.jsonb_array_length(v_rows), v_hash, p_is_final
  );
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'chunk_conflict' using errcode = '23505';
  end if;

  for v_rec in
    select value, (ordinality - 1)::integer as row_index
      from pg_catalog.jsonb_array_elements(v_rows) with ordinality
  loop
    v_row := v_rec.value;
    v_source_canon := null; v_source_legacy := null; v_source_reject := null;
    v_parent_canon := null; v_parent_reject := null; v_parent_key := null;
    v_source_key := null; v_projected := '{}'::jsonb;
    v_reject_code := null; v_reject_detail := null; v_ordinal := null;

    if pg_catalog.jsonb_typeof(v_row) <> 'object' then
      v_reject_code := 'field_invalid';
      v_reject_detail := pg_catalog.jsonb_build_object('field', 'row', 'reason', 'object_required', 'value_type', pg_catalog.jsonb_typeof(v_row));
    end if;

    if v_reject_code is null and p_kind <> 'event_window' then
      select canonical, legacy, reject_code
        into v_source_canon, v_source_legacy, v_source_reject
        from public.mtp_canon_source_id(v_row->'source_id');
      if v_source_reject is not null then
        v_reject_code := v_source_reject;
        v_reject_detail := pg_catalog.jsonb_build_object(
          'field', 'id', 'reason', v_source_reject,
          'value_type', coalesce(pg_catalog.jsonb_typeof(v_row->'source_id'), 'missing')
        );
      end if;
    end if;

    if p_kind in ('subtask', 'event_window', 'task_attachment') then
      select canonical, reject_code into v_parent_canon, v_parent_reject
        from public.mtp_canon_source_id(v_row->'parent_source_id');
      v_task_kind := v_row->>'parent_task_kind';
      if p_kind in ('subtask', 'task_attachment') then
        if v_task_kind not in ('personal', 'work') then
          v_parent_reject := 'malformed_id';
        end if;
        if v_parent_reject is null then
          v_parent_key := 'T' || public.mtp_netstring(v_task_kind) || public.mtp_netstring(v_parent_canon);
        end if;
      elsif v_parent_reject is null then
        v_parent_key := 'E' || public.mtp_netstring(v_parent_canon);
      end if;
      if v_reject_code is null and v_parent_reject is not null then
        v_reject_code := 'parent_rejected';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'parent_id', 'reason', 'parent_rejected', 'value_type', coalesce(pg_catalog.jsonb_typeof(v_row->'parent_source_id'), 'missing'));
      end if;
    end if;

    if p_kind = 'task' then
      v_task_kind := v_row->>'task_kind';
      if v_source_reject is null and v_task_kind in ('personal', 'work') then
        v_source_key := 'T' || public.mtp_netstring(v_task_kind) || public.mtp_netstring(v_source_canon);
      elsif v_reject_code is null then
        v_reject_code := 'field_invalid';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'task_kind', 'reason', 'enum', 'value_type', coalesce(pg_catalog.jsonb_typeof(v_row->'task_kind'), 'missing'));
      end if;
      v_text := coalesce(v_row->>'title', '');
      v_projected := pg_catalog.jsonb_build_object(
        'source_id_legacy', v_source_legacy, 'task_kind', v_task_kind,
        'title', v_text, 'status_text', v_row->>'status_text',
        'category', v_row->>'category', 'priority', v_row->>'priority',
        'due_date', nullif(v_row->>'due_date', '')
      );
      if v_reject_code is null and (
        pg_catalog.char_length(v_text) > 500
        or pg_catalog.char_length(coalesce(v_row->>'status_text', '')) > 100
        or pg_catalog.char_length(coalesce(v_row->>'category', '')) > 100
        or pg_catalog.char_length(coalesce(v_row->>'priority', '')) > 50
        or (nullif(v_row->>'due_date', '') is not null and (
          (v_row->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$'
          or not pg_catalog.pg_input_is_valid(v_row->>'due_date', 'date')
        ))
      ) then
        v_reject_code := 'field_invalid';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'task', 'reason', 'shape', 'value_type', 'object');
      end if;
    elsif p_kind = 'subtask' then
      if v_source_reject is null and v_parent_key is not null then
        v_source_key := 'S' || public.mtp_netstring(v_parent_key) || public.mtp_netstring(v_source_canon);
      end if;
      if (v_row->>'ordinal') ~ '^\d+$' and (v_row->>'ordinal')::numeric <= 2147483647 then
        v_ordinal := (v_row->>'ordinal')::integer;
      end if;
      v_text := coalesce(v_row->>'text', '');
      v_projected := pg_catalog.jsonb_build_object(
        'source_id_legacy', v_source_legacy, 'text', v_text,
        'done', case when pg_catalog.jsonb_typeof(v_row->'done') = 'boolean' then (v_row->>'done')::boolean else false end,
        'ordinal', v_ordinal
      );
      if v_reject_code is null and (
        v_ordinal is null or pg_catalog.char_length(v_text) > 4000
        or pg_catalog.jsonb_typeof(v_row->'done') <> 'boolean'
      ) then
        v_reject_code := 'field_invalid';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'subtask', 'reason', 'shape', 'value_type', 'object', 'byte_length', pg_catalog.octet_length(pg_catalog.convert_to(v_text, 'UTF8')));
      end if;
    elsif p_kind = 'event' then
      if v_source_reject is null then
        v_source_key := 'E' || public.mtp_netstring(v_source_canon);
      end if;
      v_text := coalesce(v_row->>'title', '');
      v_projected := pg_catalog.jsonb_build_object(
        'source_id_legacy', v_source_legacy, 'title', v_text,
        'event_type', v_row->>'event_type', 'category', v_row->>'category'
      );
      if v_reject_code is null and (
        pg_catalog.char_length(v_text) > 500
        or pg_catalog.char_length(coalesce(v_row->>'event_type', '')) > 100
        or pg_catalog.char_length(coalesce(v_row->>'category', '')) > 100
      ) then
        v_reject_code := 'field_invalid';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'event', 'reason', 'shape', 'value_type', 'object');
      end if;
    elsif p_kind = 'event_window' then
      if (v_row->>'ordinal') ~ '^\d+$' and (v_row->>'ordinal')::numeric <= 2147483647 then
        v_ordinal := (v_row->>'ordinal')::integer;
      end if;
      v_date_start := v_row->>'window_start';
      v_date_end := v_row->>'window_end';
      v_projected := pg_catalog.jsonb_build_object(
        'window_start', v_date_start, 'window_end', v_date_end, 'ordinal', v_ordinal
      );
      if v_reject_code is null and (
        v_ordinal is null or v_date_start !~ '^\d{4}-\d{2}-\d{2}$'
        or v_date_end !~ '^\d{4}-\d{2}-\d{2}$'
        or not pg_catalog.pg_input_is_valid(v_date_start, 'date')
        or not pg_catalog.pg_input_is_valid(v_date_end, 'date')
      ) then
        v_reject_code := 'field_invalid';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'event_window', 'reason', 'date', 'value_type', 'object');
      end if;
    elsif p_kind = 'task_attachment' then
      if v_source_reject is null and v_parent_key is not null then
        v_source_key := 'A' || public.mtp_netstring(v_parent_key) || public.mtp_netstring(v_source_canon);
      end if;
      if (v_row->>'ordinal') ~ '^\d+$' and (v_row->>'ordinal')::numeric <= 2147483647 then
        v_ordinal := (v_row->>'ordinal')::integer;
      end if;
      v_href := nullif(pg_catalog.btrim(v_row->>'href'), '');
      v_projected := pg_catalog.jsonb_build_object(
        'source_id_legacy', v_source_legacy, 'attachment_kind', v_row->>'attachment_kind',
        'display_name', v_row->>'display_name', 'href', v_href,
        'mime_type', v_row->>'mime_type', 'byte_size', v_row->'byte_size',
        'ordinal', v_ordinal
      );
      if v_reject_code is null and coalesce((v_row->>'has_binary')::boolean, false) then
        v_reject_code := 'binary_attachment';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'attachment', 'reason', 'binary_attachment', 'value_type', 'object');
      elsif v_reject_code is null and (v_href is not null and v_href !~ '^https://') then
        v_reject_code := 'insecure_href';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'href', 'reason', 'https_required', 'value_type', 'string', 'byte_length', pg_catalog.octet_length(pg_catalog.convert_to(v_href, 'UTF8')));
      elsif v_reject_code is null and (
        v_ordinal is null or (v_row->>'attachment_kind') not in ('link', 'file_ref')
        or pg_catalog.char_length(coalesce(v_row->>'display_name', '')) > 300
        or pg_catalog.char_length(coalesce(v_href, '')) > 2048
        or pg_catalog.char_length(coalesce(v_row->>'mime_type', '')) > 128
        or (v_row->'byte_size' is not null and pg_catalog.jsonb_typeof(v_row->'byte_size') <> 'null'
          and ((v_row->>'byte_size') !~ '^\d+$' or (v_row->>'byte_size')::numeric > 9223372036854775807::numeric))
      ) then
        v_reject_code := 'field_invalid';
        v_reject_detail := pg_catalog.jsonb_build_object('field', 'attachment', 'reason', 'shape', 'value_type', 'object');
      end if;
    end if;

    if v_reject_code is not null then
      v_projected := v_projected || pg_catalog.jsonb_build_object(
        '_reject_code', v_reject_code, '_reject_detail', v_reject_detail
      );
      v_rejected := v_rejected + 1;
    else
      v_accepted := v_accepted + 1;
    end if;

    insert into public.mtp_import_staging (
      owner_id, batch_id, chunk_seq, row_index, kind, source_key,
      parent_source_key, ordinal, projected, row_hash
    ) values (
      v_owner, p_batch_id, p_chunk_seq, v_rec.row_index, p_kind, v_source_key,
      v_parent_key, v_ordinal, v_projected,
      case when v_reject_code is null
        then public.mtp_row_hash(p_kind, v_source_key, v_parent_key, v_ordinal, true, v_projected)
        else extensions.digest(pg_catalog.convert_to(v_projected::text, 'UTF8'), 'sha256')
      end
    );
  end loop;

  return query select v_accepted, v_rejected, v_hash, false;
end;
$$;

create function public.mtp_set_hash_active(p_owner uuid)
returns bytea
language sql
stable
set search_path = ''
as $$
  select public.mtp_set_hash(coalesce(pg_catalog.array_agg(x.content_hash), array[]::bytea[]))
  from (
    select content_hash from public.mtp_tasks where owner_id = p_owner and is_active
    union all select content_hash from public.mtp_subtasks where owner_id = p_owner and is_active
    union all select content_hash from public.mtp_events where owner_id = p_owner and is_active
    union all select content_hash from public.mtp_event_windows where owner_id = p_owner and is_active
    union all select content_hash from public.mtp_task_attachments where owner_id = p_owner and is_active
  ) as x
$$;

create function public.mtp_set_hash_tombstoned(p_owner uuid)
returns bytea
language sql
stable
set search_path = ''
as $$
  select public.mtp_set_hash(coalesce(pg_catalog.array_agg(x.content_hash), array[]::bytea[]))
  from (
    select content_hash from public.mtp_tasks where owner_id = p_owner and not is_active
    union all select content_hash from public.mtp_subtasks where owner_id = p_owner and not is_active
    union all select content_hash from public.mtp_events where owner_id = p_owner and not is_active
    union all select content_hash from public.mtp_event_windows where owner_id = p_owner and not is_active
    union all select content_hash from public.mtp_task_attachments where owner_id = p_owner and not is_active
  ) as x
$$;

create function public.mtp_counts(p_owner uuid, p_batch_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'active', pg_catalog.jsonb_build_object(
      'task', (select count(*) from public.mtp_tasks where owner_id = p_owner and is_active),
      'subtask', (select count(*) from public.mtp_subtasks where owner_id = p_owner and is_active),
      'event', (select count(*) from public.mtp_events where owner_id = p_owner and is_active),
      'event_window', (select count(*) from public.mtp_event_windows where owner_id = p_owner and is_active),
      'task_attachment', (select count(*) from public.mtp_task_attachments where owner_id = p_owner and is_active)
    ),
    'tombstoned', pg_catalog.jsonb_build_object(
      'task', (select count(*) from public.mtp_tasks where owner_id = p_owner and not is_active),
      'subtask', (select count(*) from public.mtp_subtasks where owner_id = p_owner and not is_active),
      'event', (select count(*) from public.mtp_events where owner_id = p_owner and not is_active),
      'event_window', (select count(*) from public.mtp_event_windows where owner_id = p_owner and not is_active),
      'task_attachment', (select count(*) from public.mtp_task_attachments where owner_id = p_owner and not is_active)
    ),
    'staged', coalesce((
      select pg_catalog.jsonb_object_agg(kind, n)
      from (select kind, count(*) as n from public.mtp_import_staging
             where owner_id = p_owner and batch_id = p_batch_id group by kind) as s
    ), '{}'::jsonb),
    'rejected', coalesce((
      select pg_catalog.jsonb_object_agg(kind, n)
      from (select kind, count(*) as n from public.mtp_import_rejects
             where owner_id = p_owner and batch_id = p_batch_id group by kind) as r
    ), '{}'::jsonb),
    'anomalies', pg_catalog.jsonb_build_object(
      'subtask_text_over_120', (select count(*) from public.mtp_import_staging
        where owner_id = p_owner and batch_id = p_batch_id and kind = 'subtask'
          and projected->>'_reject_code' is null and char_length(projected->>'text') > 120),
      'subtask_ordinal_over_19', (select count(*) from public.mtp_import_staging
        where owner_id = p_owner and batch_id = p_batch_id and kind = 'subtask'
          and projected->>'_reject_code' is null and ordinal > 19),
      'event_window_ordinal_over_5', (select count(*) from public.mtp_import_staging
        where owner_id = p_owner and batch_id = p_batch_id and kind = 'event_window'
          and projected->>'_reject_code' is null and ordinal > 5),
      'event_window_inverted', (select count(*) from public.mtp_import_staging
        where owner_id = p_owner and batch_id = p_batch_id and kind = 'event_window'
          and projected->>'_reject_code' is null
          and (projected->>'window_end')::date < (projected->>'window_start')::date)
    )
  )
$$;

create function public.mtp_import_finalize(p_batch_id uuid, p_generation bigint)
returns table (
  batch_id uuid,
  status text,
  reject_count integer,
  traversal_complete boolean,
  hashes_compared boolean,
  payload_hash bytea,
  stored_hash bytea,
  tombstone_hash bytea,
  counts jsonb,
  failure_code text,
  failure_sqlstate text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_owner uuid := (select auth.uid());
  v_batch public.mtp_import_batches%rowtype;
  v_chunk_count bigint;
  v_min_seq integer;
  v_max_seq integer;
  v_final_count bigint;
  v_final_seq integer;
  v_stream bytea;
  v_complete boolean;
  v_reject_count integer;
  v_payload bytea;
  v_stored bytea;
  v_tombstone bytea;
  v_counts jsonb;
  v_failed boolean := false;
  v_sqlstate text;
  v_failcode text;
begin
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_batch
    from public.mtp_import_batches as b
   where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation
   for update;
  if not found then
    raise exception 'import_not_available' using errcode = '42501';
  end if;
  if v_batch.status <> 'running' then
    return query select v_batch.id, v_batch.status, v_batch.reject_count,
      v_batch.traversal_complete, v_batch.hashes_compared, v_batch.payload_hash,
      v_batch.stored_hash, v_batch.tombstone_hash, v_batch.counts,
      v_batch.failure_code, v_batch.failure_sqlstate;
    return;
  end if;
  if v_batch.lease_expires_at <= pg_catalog.now()
     or v_batch.generation <> (
       select pg_catalog.max(x.generation) from public.mtp_import_batches as x
        where x.owner_id = v_owner
     ) then
    raise exception 'import_not_available' using errcode = '42501';
  end if;

  select count(*), min(c.chunk_seq), max(c.chunk_seq),
         count(*) filter (where c.is_final), max(c.chunk_seq) filter (where c.is_final),
         extensions.digest(coalesce(pg_catalog.string_agg(c.chunk_hash, ''::bytea order by c.chunk_seq), ''::bytea), 'sha256')
    into v_chunk_count, v_min_seq, v_max_seq, v_final_count, v_final_seq, v_stream
    from public.mtp_import_chunks as c
   where c.owner_id = v_owner and c.batch_id = p_batch_id;

  if v_batch.declared_chunk_count = 0 then
    v_complete := v_chunk_count = 0
      and v_final_count = 0
      and v_stream = v_batch.client_payload_hash
      and v_stream = extensions.digest(''::bytea, 'sha256');
  else
    v_complete := v_chunk_count = v_batch.declared_chunk_count
      and v_min_seq = 0
      and v_max_seq = v_batch.declared_chunk_count - 1
      and v_final_count = 1
      and v_final_seq = v_batch.declared_chunk_count - 1
      and v_stream = v_batch.client_payload_hash;
  end if;

  if not v_complete then
    v_stored := public.mtp_set_hash_active(v_owner);
    v_tombstone := public.mtp_set_hash_tombstoned(v_owner);
    v_counts := public.mtp_counts(v_owner, p_batch_id);
    update public.mtp_import_batches as b
       set status = 'failed', stream_hash = v_stream, traversal_complete = false,
           hashes_compared = false, stored_hash = v_stored,
           tombstone_hash = v_tombstone, counts = v_counts,
           failure_code = 'stream_incomplete', finished_at = pg_catalog.now()
     where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation;
    perform public.mtp_import_purge_batch_staging(v_owner, p_batch_id);
    select * into v_batch from public.mtp_import_batches as b
     where b.owner_id = v_owner and b.id = p_batch_id;
    return query select v_batch.id, v_batch.status, v_batch.reject_count,
      v_batch.traversal_complete, v_batch.hashes_compared, v_batch.payload_hash,
      v_batch.stored_hash, v_batch.tombstone_hash, v_batch.counts,
      v_batch.failure_code, v_batch.failure_sqlstate;
    return;
  end if;

  insert into public.mtp_import_rejects (
    owner_id, batch_id, kind, reject_code, chunk_seq, row_index,
    content_fingerprint, detail
  )
  select v_owner, p_batch_id, s.kind, s.projected->>'_reject_code',
         s.chunk_seq, s.row_index, s.row_hash, s.projected->'_reject_detail'
    from public.mtp_import_staging as s
   where s.owner_id = v_owner and s.batch_id = p_batch_id
     and s.projected->>'_reject_code' is not null;

  with duplicate_keys as (
    select s.kind, s.source_key, count(*)::integer as occurrence_count
      from public.mtp_import_staging as s
     where s.owner_id = v_owner and s.batch_id = p_batch_id
       and s.source_key is not null and s.projected->>'_reject_code' is null
     group by s.kind, s.source_key
    having count(*) > 1
  )
  insert into public.mtp_import_rejects (
    owner_id, batch_id, kind, reject_code, canonical_source_key,
    occurrence_count, chunk_seq, row_index, content_fingerprint, detail
  )
  select v_owner, p_batch_id, s.kind, 'duplicate_id', d.source_key,
         d.occurrence_count, s.chunk_seq, s.row_index, s.row_hash,
         pg_catalog.jsonb_build_object('field', 'id', 'reason', 'duplicate_id', 'item_count', d.occurrence_count)
    from public.mtp_import_staging as s
    join duplicate_keys as d on d.kind = s.kind and d.source_key = s.source_key
   where s.owner_id = v_owner and s.batch_id = p_batch_id
     and s.projected->>'_reject_code' is null;

  with parent_state as (
    select s.source_key,
           bool_or(s.projected->>'_reject_code' is not null) as rejected,
           count(*) > 1 as duplicated
      from public.mtp_import_staging as s
     where s.owner_id = v_owner and s.batch_id = p_batch_id
       and s.kind in ('task', 'event') and s.source_key is not null
     group by s.source_key
  )
  insert into public.mtp_import_rejects (
    owner_id, batch_id, kind, reject_code, chunk_seq, row_index,
    content_fingerprint, detail
  )
  select v_owner, p_batch_id, s.kind,
         case when p.rejected or p.duplicated then 'parent_rejected' else 'orphan_parent' end,
         s.chunk_seq, s.row_index, s.row_hash,
         pg_catalog.jsonb_build_object(
           'field', 'parent_id',
           'reason', case when p.rejected or p.duplicated then 'parent_rejected' else 'orphan_parent' end,
           'value_type', 'identifier'
         )
    from public.mtp_import_staging as s
    left join parent_state as p on p.source_key = s.parent_source_key
   where s.owner_id = v_owner and s.batch_id = p_batch_id
     and s.kind in ('subtask', 'event_window', 'task_attachment')
     and s.projected->>'_reject_code' is null
     and (p.source_key is null or p.rejected or p.duplicated);

  select count(*)::integer into v_reject_count
    from public.mtp_import_rejects as r
   where r.owner_id = v_owner and r.batch_id = p_batch_id;
  select public.mtp_set_hash(coalesce(pg_catalog.array_agg(s.row_hash), array[]::bytea[]))
    into v_payload
    from public.mtp_import_staging as s
   where s.owner_id = v_owner and s.batch_id = p_batch_id
     and not exists (
       select 1 from public.mtp_import_rejects as r
        where r.owner_id = v_owner and r.batch_id = p_batch_id
          and r.chunk_seq = s.chunk_seq and r.row_index = s.row_index
     );
  v_stored := public.mtp_set_hash_active(v_owner);
  v_tombstone := public.mtp_set_hash_tombstoned(v_owner);
  v_counts := public.mtp_counts(v_owner, p_batch_id);

  if v_reject_count > 0 then
    update public.mtp_import_batches as b
       set status = 'partial', stream_hash = v_stream, traversal_complete = true,
           payload_hash = v_payload, stored_hash = v_stored,
           tombstone_hash = v_tombstone, hashes_compared = false,
           counts = v_counts, reject_count = v_reject_count,
           finished_at = pg_catalog.now()
     where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation;
    perform public.mtp_import_purge_batch_staging(v_owner, p_batch_id);
    select * into v_batch from public.mtp_import_batches as b
     where b.owner_id = v_owner and b.id = p_batch_id;
    return query select v_batch.id, v_batch.status, v_batch.reject_count,
      v_batch.traversal_complete, v_batch.hashes_compared, v_batch.payload_hash,
      v_batch.stored_hash, v_batch.tombstone_hash, v_batch.counts,
      v_batch.failure_code, v_batch.failure_sqlstate;
    return;
  end if;

  begin
    insert into public.mtp_tasks (
      owner_id, task_kind, source_key, source_id_legacy, title, status_text,
      category, priority, due_date, first_seen_batch_id, last_seen_batch_id, content_hash
    )
    select v_owner, s.projected->>'task_kind', s.source_key,
           s.projected->>'source_id_legacy', s.projected->>'title',
           s.projected->>'status_text', s.projected->>'category',
           s.projected->>'priority', (s.projected->>'due_date')::date,
           p_batch_id, p_batch_id, s.row_hash
      from public.mtp_import_staging as s
     where s.owner_id = v_owner and s.batch_id = p_batch_id and s.kind = 'task'
    on conflict (owner_id, source_key) do update set
      task_kind = excluded.task_kind, source_id_legacy = excluded.source_id_legacy,
      title = excluded.title, status_text = excluded.status_text,
      category = excluded.category, priority = excluded.priority,
      due_date = excluded.due_date, is_active = true, source_deleted_at = null,
      last_seen_batch_id = excluded.last_seen_batch_id, content_hash = excluded.content_hash;

    insert into public.mtp_events (
      owner_id, source_key, source_id_legacy, title, event_type, category,
      first_seen_batch_id, last_seen_batch_id, content_hash
    )
    select v_owner, s.source_key, s.projected->>'source_id_legacy',
           s.projected->>'title', s.projected->>'event_type', s.projected->>'category',
           p_batch_id, p_batch_id, s.row_hash
      from public.mtp_import_staging as s
     where s.owner_id = v_owner and s.batch_id = p_batch_id and s.kind = 'event'
    on conflict (owner_id, source_key) do update set
      source_id_legacy = excluded.source_id_legacy, title = excluded.title,
      event_type = excluded.event_type, category = excluded.category,
      is_active = true, source_deleted_at = null,
      last_seen_batch_id = excluded.last_seen_batch_id, content_hash = excluded.content_hash;

    insert into public.mtp_subtasks (
      owner_id, task_id, source_key, source_id_legacy, text, done, ordinal,
      first_seen_batch_id, last_seen_batch_id, content_hash
    )
    select v_owner, t.id, s.source_key, s.projected->>'source_id_legacy',
           s.projected->>'text', (s.projected->>'done')::boolean, s.ordinal,
           p_batch_id, p_batch_id, s.row_hash
      from public.mtp_import_staging as s
      join public.mtp_tasks as t on t.owner_id = v_owner and t.source_key = s.parent_source_key
     where s.owner_id = v_owner and s.batch_id = p_batch_id and s.kind = 'subtask'
    on conflict (owner_id, source_key) do update set
      task_id = excluded.task_id, source_id_legacy = excluded.source_id_legacy,
      text = excluded.text, done = excluded.done, ordinal = excluded.ordinal,
      is_active = true, source_deleted_at = null,
      last_seen_batch_id = excluded.last_seen_batch_id, content_hash = excluded.content_hash;

    insert into public.mtp_event_windows (
      owner_id, event_id, ordinal, window_start, window_end,
      first_seen_batch_id, last_seen_batch_id, content_hash
    )
    select v_owner, e.id, s.ordinal, (s.projected->>'window_start')::date,
           (s.projected->>'window_end')::date, p_batch_id, p_batch_id, s.row_hash
      from public.mtp_import_staging as s
      join public.mtp_events as e on e.owner_id = v_owner and e.source_key = s.parent_source_key
     where s.owner_id = v_owner and s.batch_id = p_batch_id and s.kind = 'event_window'
    on conflict (owner_id, event_id, ordinal) do update set
      window_start = excluded.window_start, window_end = excluded.window_end,
      is_active = true, source_deleted_at = null,
      last_seen_batch_id = excluded.last_seen_batch_id, content_hash = excluded.content_hash;

    insert into public.mtp_task_attachments (
      owner_id, task_id, source_key, source_id_legacy, ordinal, attachment_kind,
      display_name, href, mime_type, byte_size,
      first_seen_batch_id, last_seen_batch_id, content_hash
    )
    select v_owner, t.id, s.source_key, s.projected->>'source_id_legacy', s.ordinal,
           s.projected->>'attachment_kind', s.projected->>'display_name',
           s.projected->>'href', s.projected->>'mime_type',
           (s.projected->>'byte_size')::bigint, p_batch_id, p_batch_id, s.row_hash
      from public.mtp_import_staging as s
      join public.mtp_tasks as t on t.owner_id = v_owner and t.source_key = s.parent_source_key
     where s.owner_id = v_owner and s.batch_id = p_batch_id and s.kind = 'task_attachment'
    on conflict (owner_id, source_key) do update set
      task_id = excluded.task_id, source_id_legacy = excluded.source_id_legacy,
      ordinal = excluded.ordinal, attachment_kind = excluded.attachment_kind,
      display_name = excluded.display_name, href = excluded.href,
      mime_type = excluded.mime_type, byte_size = excluded.byte_size,
      is_active = true, source_deleted_at = null,
      last_seen_batch_id = excluded.last_seen_batch_id, content_hash = excluded.content_hash;

    update public.mtp_subtasks as s set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('subtask', s.source_key, t.source_key, s.ordinal, false,
        pg_catalog.jsonb_build_object('text', s.text, 'done', s.done, 'ordinal', s.ordinal))
      from public.mtp_tasks as t
     where s.owner_id = v_owner and t.owner_id = v_owner and s.task_id = t.id
       and s.is_active and (s.last_seen_batch_id <> p_batch_id or not t.is_active);
    update public.mtp_task_attachments as a set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('task_attachment', a.source_key, t.source_key, a.ordinal, false,
        pg_catalog.jsonb_build_object('attachment_kind', a.attachment_kind,
          'display_name', a.display_name, 'href', a.href, 'mime_type', a.mime_type,
          'byte_size', a.byte_size, 'ordinal', a.ordinal))
      from public.mtp_tasks as t
     where a.owner_id = v_owner and t.owner_id = v_owner and a.task_id = t.id
       and a.is_active and (a.last_seen_batch_id <> p_batch_id or not t.is_active);
    update public.mtp_event_windows as w set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('event_window', null, e.source_key, w.ordinal, false,
        pg_catalog.jsonb_build_object('window_start', w.window_start, 'window_end', w.window_end))
      from public.mtp_events as e
     where w.owner_id = v_owner and e.owner_id = v_owner and w.event_id = e.id
       and w.is_active and (w.last_seen_batch_id <> p_batch_id or not e.is_active);
    update public.mtp_tasks as t set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('task', t.source_key, null, null, false,
        pg_catalog.jsonb_build_object('task_kind', t.task_kind, 'title', t.title,
          'status_text', t.status_text, 'category', t.category,
          'priority', t.priority, 'due_date', t.due_date))
     where t.owner_id = v_owner and t.is_active and t.last_seen_batch_id <> p_batch_id;
    update public.mtp_events as e set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('event', e.source_key, null, null, false,
        pg_catalog.jsonb_build_object('title', e.title, 'event_type', e.event_type, 'category', e.category))
     where e.owner_id = v_owner and e.is_active and e.last_seen_batch_id <> p_batch_id;

    -- Parents were deactivated after the ordinary child sweep. This second pass
    -- guarantees logical cascade without hard deletes.
    update public.mtp_subtasks as s set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('subtask', s.source_key, t.source_key, s.ordinal, false,
        pg_catalog.jsonb_build_object('text', s.text, 'done', s.done, 'ordinal', s.ordinal))
      from public.mtp_tasks as t
     where s.owner_id = v_owner and t.owner_id = v_owner and s.task_id = t.id
       and s.is_active and not t.is_active;
    update public.mtp_task_attachments as a set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('task_attachment', a.source_key, t.source_key, a.ordinal, false,
        pg_catalog.jsonb_build_object('attachment_kind', a.attachment_kind,
          'display_name', a.display_name, 'href', a.href, 'mime_type', a.mime_type,
          'byte_size', a.byte_size, 'ordinal', a.ordinal))
      from public.mtp_tasks as t
     where a.owner_id = v_owner and t.owner_id = v_owner and a.task_id = t.id
       and a.is_active and not t.is_active;
    update public.mtp_event_windows as w set
      is_active = false, source_deleted_at = pg_catalog.now(),
      content_hash = public.mtp_row_hash('event_window', null, e.source_key, w.ordinal, false,
        pg_catalog.jsonb_build_object('window_start', w.window_start, 'window_end', w.window_end))
      from public.mtp_events as e
     where w.owner_id = v_owner and e.owner_id = v_owner and w.event_id = e.id
       and w.is_active and not e.is_active;

    v_stored := public.mtp_set_hash_active(v_owner);
    v_tombstone := public.mtp_set_hash_tombstoned(v_owner);
    v_counts := public.mtp_counts(v_owner, p_batch_id);
    if v_stored is distinct from v_payload then
      raise exception 'l0b_reconcile_mismatch' using errcode = 'L0B01';
    end if;
  exception when others then
    v_failed := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    v_failcode := case when v_sqlstate = 'L0B01' then 'evidence_mismatch' else 'apply_exception' end;
  end;

  update public.mtp_import_batches as b
     set status = case when v_failed then 'failed' else 'succeeded' end,
         stream_hash = v_stream, traversal_complete = true,
         payload_hash = v_payload, stored_hash = v_stored,
         tombstone_hash = v_tombstone, hashes_compared = not v_failed,
         counts = v_counts, reject_count = 0,
         failure_code = case when v_failed then v_failcode else null end,
         failure_sqlstate = case when v_failed then v_sqlstate else null end,
         finished_at = pg_catalog.now()
   where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation;
  perform public.mtp_import_purge_batch_staging(v_owner, p_batch_id);
  select * into v_batch from public.mtp_import_batches as b
   where b.owner_id = v_owner and b.id = p_batch_id;
  return query select v_batch.id, v_batch.status, v_batch.reject_count,
    v_batch.traversal_complete, v_batch.hashes_compared, v_batch.payload_hash,
    v_batch.stored_hash, v_batch.tombstone_hash, v_batch.counts,
    v_batch.failure_code, v_batch.failure_sqlstate;
end;
$$;

create function public.mtp_import_abort(
  p_batch_id uuid,
  p_generation bigint,
  p_reason text default 'client_abort'
)
returns table (batch_id uuid, status text, failure_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  update public.mtp_import_batches as b
     set status = 'failed', failure_code = 'client_abort',
         traversal_complete = false, hashes_compared = false,
         finished_at = pg_catalog.now()
   where b.owner_id = v_owner and b.id = p_batch_id and b.generation = p_generation
     and b.status = 'running' and b.lease_expires_at > pg_catalog.now()
     and b.generation = (
       select pg_catalog.max(x.generation) from public.mtp_import_batches as x
        where x.owner_id = v_owner
     );
  if not found then
    raise exception 'import_not_available' using errcode = '42501';
  end if;
  perform public.mtp_import_purge_batch_staging(v_owner, p_batch_id);
  return query select p_batch_id, 'failed'::text, 'client_abort'::text;
end;
$$;

create function public.mtp_import_purge_staging()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_deleted bigint := 0;
  v_batch record;
begin
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  for v_batch in
    select b.id from public.mtp_import_batches as b
     where b.owner_id = v_owner and b.status <> 'running'
       and exists (select 1 from public.mtp_import_staging as s
                    where s.owner_id = v_owner and s.batch_id = b.id)
     for update
  loop
    v_deleted := v_deleted + public.mtp_import_purge_batch_staging(v_owner, v_batch.id);
  end loop;
  return v_deleted;
end;
$$;

-- Existing Supabase projects may auto-grant broad privileges at object birth.
-- Revoke each L0b object explicitly; never touch unrelated public objects.
alter table public.mtp_import_batches enable row level security;
revoke all on table public.mtp_import_batches from public;
revoke all on table public.mtp_import_batches from anon;
revoke all on table public.mtp_import_batches from authenticated;
revoke all on table public.mtp_import_batches from service_role;
alter table public.mtp_import_chunks enable row level security;
revoke all on table public.mtp_import_chunks from public;
revoke all on table public.mtp_import_chunks from anon;
revoke all on table public.mtp_import_chunks from authenticated;
revoke all on table public.mtp_import_chunks from service_role;
alter table public.mtp_import_staging enable row level security;
revoke all on table public.mtp_import_staging from public;
revoke all on table public.mtp_import_staging from anon;
revoke all on table public.mtp_import_staging from authenticated;
revoke all on table public.mtp_import_staging from service_role;
alter table public.mtp_import_rejects enable row level security;
revoke all on table public.mtp_import_rejects from public;
revoke all on table public.mtp_import_rejects from anon;
revoke all on table public.mtp_import_rejects from authenticated;
revoke all on table public.mtp_import_rejects from service_role;
alter table public.mtp_tasks enable row level security;
revoke all on table public.mtp_tasks from public;
revoke all on table public.mtp_tasks from anon;
revoke all on table public.mtp_tasks from authenticated;
revoke all on table public.mtp_tasks from service_role;
alter table public.mtp_subtasks enable row level security;
revoke all on table public.mtp_subtasks from public;
revoke all on table public.mtp_subtasks from anon;
revoke all on table public.mtp_subtasks from authenticated;
revoke all on table public.mtp_subtasks from service_role;
alter table public.mtp_events enable row level security;
revoke all on table public.mtp_events from public;
revoke all on table public.mtp_events from anon;
revoke all on table public.mtp_events from authenticated;
revoke all on table public.mtp_events from service_role;
alter table public.mtp_event_windows enable row level security;
revoke all on table public.mtp_event_windows from public;
revoke all on table public.mtp_event_windows from anon;
revoke all on table public.mtp_event_windows from authenticated;
revoke all on table public.mtp_event_windows from service_role;
alter table public.mtp_task_attachments enable row level security;
revoke all on table public.mtp_task_attachments from public;
revoke all on table public.mtp_task_attachments from anon;
revoke all on table public.mtp_task_attachments from authenticated;
revoke all on table public.mtp_task_attachments from service_role;

grant select on table public.mtp_import_batches to authenticated;
grant select on table public.mtp_import_chunks to authenticated;
grant select on table public.mtp_import_rejects to authenticated;
grant select on table public.mtp_tasks to authenticated;
grant select on table public.mtp_subtasks to authenticated;
grant select on table public.mtp_events to authenticated;
grant select on table public.mtp_event_windows to authenticated;
grant select on table public.mtp_task_attachments to authenticated;

create policy mtp_import_batches_owner_select on public.mtp_import_batches
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_import_chunks_owner_select on public.mtp_import_chunks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_import_staging_owner_select on public.mtp_import_staging
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_import_rejects_owner_select on public.mtp_import_rejects
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_tasks_owner_select on public.mtp_tasks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_subtasks_owner_select on public.mtp_subtasks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_events_owner_select on public.mtp_events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_event_windows_owner_select on public.mtp_event_windows
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mtp_task_attachments_owner_select on public.mtp_task_attachments
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on sequence public.mtp_import_staging_id_seq from public;
revoke all on sequence public.mtp_import_staging_id_seq from anon;
revoke all on sequence public.mtp_import_staging_id_seq from authenticated;
revoke all on sequence public.mtp_import_staging_id_seq from service_role;
revoke all on sequence public.mtp_import_rejects_id_seq from public;
revoke all on sequence public.mtp_import_rejects_id_seq from anon;
revoke all on sequence public.mtp_import_rejects_id_seq from authenticated;
revoke all on sequence public.mtp_import_rejects_id_seq from service_role;

revoke all on function public.mtp_reject_detail_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mtp_nfc(text) from public, anon, authenticated, service_role;
revoke all on function public.mtp_netstring(text) from public, anon, authenticated, service_role;
revoke all on function public.mtp_canon_source_id(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_null() from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_bool(boolean) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_int(bigint) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_text(text) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_date(date) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_bytes(bytea) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_nullable_text(text) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_nullable_int(bigint) from public, anon, authenticated, service_role;
revoke all on function public.mtp_enc_nullable_date(date) from public, anon, authenticated, service_role;
revoke all on function public.mtp_row_bytes(text, text, text, integer, boolean, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mtp_row_hash(text, text, text, integer, boolean, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mtp_set_hash(bytea[]) from public, anon, authenticated, service_role;
revoke all on function public.mtp_touch_version() from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_purge_batch_staging(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_claim(bytea, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_heartbeat(uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_stage(uuid, bigint, integer, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.mtp_set_hash_active(uuid) from public, anon, authenticated, service_role;
revoke all on function public.mtp_set_hash_tombstoned(uuid) from public, anon, authenticated, service_role;
revoke all on function public.mtp_counts(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_finalize(uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_abort(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.mtp_import_purge_staging() from public, anon, authenticated, service_role;

grant execute on function public.mtp_import_claim(bytea, integer, integer) to authenticated;
grant execute on function public.mtp_import_heartbeat(uuid, bigint) to authenticated;
grant execute on function public.mtp_import_stage(uuid, bigint, integer, text, text, boolean) to authenticated;
grant execute on function public.mtp_import_finalize(uuid, bigint) to authenticated;
grant execute on function public.mtp_import_abort(uuid, bigint, text) to authenticated;
grant execute on function public.mtp_import_purge_staging() to authenticated;

comment on table public.mtp_tasks is
  'L0b partial normalized projection. Google Drive remains authoritative until a separate L1 cutover.';
comment on table public.mtp_event_windows is
  'Ordered positional values; L0b does not claim stable window identity across reorder.';
