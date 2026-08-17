\set ON_ERROR_STOP on

-- This file runs only against the isolated PostgreSQL service created by CI.
-- It must never be pointed at Production.

insert into auth.users (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Real RPC lifecycle: claimed -> busy -> claimed_stale -> claimed_retry ->
-- duplicate_processed. Also prove an old attempt cannot finish a newer lease.
set role service_role;
do $$
declare
  v_decision text;
  v_attempt integer;
  v_ok boolean;
begin
  delete from public.mtp_line_events where event_id = 'sql-sequence-event';

  select decision, attempt_count
    into v_decision, v_attempt
    from public.mtp_claim_line_event(
      'sql-sequence-event',
      '00000000-0000-0000-0000-000000000001',
      30
    );
  if v_decision <> 'claimed' or v_attempt <> 1 then
    raise exception 'expected claimed/1, got %/%', v_decision, v_attempt;
  end if;

  select decision, attempt_count
    into v_decision, v_attempt
    from public.mtp_claim_line_event('sql-sequence-event', null, 30);
  if v_decision <> 'busy' or v_attempt <> 1 then
    raise exception 'expected busy/1, got %/%', v_decision, v_attempt;
  end if;

  update public.mtp_line_events
     set processing_started_at = pg_catalog.now() - interval '31 seconds'
   where event_id = 'sql-sequence-event';

  select decision, attempt_count
    into v_decision, v_attempt
    from public.mtp_claim_line_event('sql-sequence-event', null, 30);
  if v_decision <> 'claimed_stale' or v_attempt <> 2 then
    raise exception 'expected claimed_stale/2, got %/%', v_decision, v_attempt;
  end if;

  select public.mtp_finish_line_event(
    'sql-sequence-event', 1, 'processed', null
  ) into v_ok;
  if v_ok then
    raise exception 'attempt N-1 unexpectedly finalized attempt N';
  end if;

  select public.mtp_finish_line_event(
    'sql-sequence-event', 2, 'failed', 'synthetic_failure'
  ) into v_ok;
  if not v_ok then
    raise exception 'current attempt could not be finalized as failed';
  end if;

  select decision, attempt_count
    into v_decision, v_attempt
    from public.mtp_claim_line_event('sql-sequence-event', null, 30);
  if v_decision <> 'claimed_retry' or v_attempt <> 3 then
    raise exception 'expected claimed_retry/3, got %/%', v_decision, v_attempt;
  end if;

  select public.mtp_finish_line_event(
    'sql-sequence-event', 3, 'processed', null
  ) into v_ok;
  if not v_ok then
    raise exception 'retry attempt could not be finalized as processed';
  end if;

  select decision, attempt_count
    into v_decision, v_attempt
    from public.mtp_claim_line_event('sql-sequence-event', null, 30);
  if v_decision <> 'duplicate_processed' or v_attempt <> 3 then
    raise exception 'expected duplicate_processed/3, got %/%', v_decision, v_attempt;
  end if;
end;
$$;
reset role;

-- RLS/grant gate: neither client role can reach the ledger or its RPCs.
do $$
declare
  v_role text;
  v_signature text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.mtp_line_events', 'select')
       or has_table_privilege(v_role, 'public.mtp_line_events', 'insert')
       or has_table_privilege(v_role, 'public.mtp_line_events', 'update')
       or has_table_privilege(v_role, 'public.mtp_line_events', 'delete') then
      raise exception '% unexpectedly has ledger table privileges', v_role;
    end if;

    foreach v_signature in array array[
      'public.mtp_claim_line_event(text,uuid,integer)',
      'public.mtp_finish_line_event(text,integer,text,text)',
      'public.mtp_cleanup_line_events(timestamptz)'
    ] loop
      if has_function_privilege(v_role, v_signature, 'execute') then
        raise exception '% unexpectedly executes %', v_role, v_signature;
      end if;
    end loop;
  end loop;
end;
$$;

set role anon;
do $$
begin
  begin
    perform count(*) from public.mtp_line_events;
    raise exception 'anon unexpectedly read mtp_line_events';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform * from public.mtp_claim_line_event('anon-denied', null, 30);
    raise exception 'anon unexpectedly executed mtp_claim_line_event';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.mtp_finish_line_event('anon-denied', 1, 'failed', null);
    raise exception 'anon unexpectedly executed mtp_finish_line_event';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.mtp_cleanup_line_events(pg_catalog.now());
    raise exception 'anon unexpectedly executed mtp_cleanup_line_events';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Authenticated clients retain only the four columns written by line-sync.js.
insert into public.mtp_line_mutations (
  id,
  owner_id,
  operation,
  status,
  expires_at,
  created_at,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '{"action":"add","type":"personal","title":"SQL privilege test"}'::jsonb,
  'confirmed',
  pg_catalog.now() + interval '10 minutes',
  pg_catalog.now(),
  pg_catalog.now()
)
on conflict (id) do update
  set status = excluded.status,
      error_code = null,
      source_event_id = null,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

update public.mtp_line_mutations
   set status = 'applied',
       error_code = 'sql_test',
       applied_at = pg_catalog.now(),
       updated_at = pg_catalog.now()
 where id = '10000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1
      from public.mtp_line_mutations
     where id = '10000000-0000-4000-8000-000000000001'
       and status = 'applied'
       and error_code = 'sql_test'
       and applied_at is not null
  ) then
    raise exception 'allowed authenticated queue completion update did not persist';
  end if;

  begin
    update public.mtp_line_mutations
       set source_event_id = 'squatted-event-id'
     where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'authenticated unexpectedly updated source_event_id';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.mtp_line_mutations
       set operation = '{"action":"delete"}'::jsonb
     where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'authenticated unexpectedly updated operation';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.mtp_line_mutations
       set owner_id = '00000000-0000-0000-0000-000000000002'
     where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'authenticated unexpectedly updated owner_id';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.mtp_line_mutations
       set expires_at = pg_catalog.now() + interval '1 day'
     where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'authenticated unexpectedly updated expires_at';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform count(*) from public.mtp_line_events;
    raise exception 'authenticated unexpectedly read mtp_line_events';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform * from public.mtp_claim_line_event('authenticated-denied', null, 30);
    raise exception 'authenticated unexpectedly executed mtp_claim_line_event';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.mtp_finish_line_event(
      'authenticated-denied', 1, 'failed', null
    );
    raise exception 'authenticated unexpectedly executed mtp_finish_line_event';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.mtp_cleanup_line_events(pg_catalog.now());
    raise exception 'authenticated unexpectedly executed mtp_cleanup_line_events';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Retention removes only old terminal rows; active and recent terminal rows stay.
insert into public.mtp_line_events (
  event_id, status, attempt_count, processing_started_at, processed_at, updated_at
)
values
  ('cleanup-old-processed', 'processed', 1, pg_catalog.now() - interval '40 days', pg_catalog.now() - interval '40 days', pg_catalog.now() - interval '40 days'),
  ('cleanup-old-failed', 'failed', 1, pg_catalog.now() - interval '40 days', null, pg_catalog.now() - interval '40 days'),
  ('cleanup-old-processing', 'processing', 1, pg_catalog.now() - interval '40 days', null, pg_catalog.now() - interval '40 days'),
  ('cleanup-recent-processed', 'processed', 1, pg_catalog.now(), pg_catalog.now(), pg_catalog.now())
on conflict (event_id) do update
  set status = excluded.status,
      attempt_count = excluded.attempt_count,
      processing_started_at = excluded.processing_started_at,
      processed_at = excluded.processed_at,
      updated_at = excluded.updated_at;

set role service_role;
do $$
declare
  v_deleted bigint;
begin
  select public.mtp_cleanup_line_events(
    pg_catalog.now() - interval '30 days'
  ) into v_deleted;
  if v_deleted <> 2 then
    raise exception 'cleanup expected 2 terminal rows, deleted %', v_deleted;
  end if;

  if exists (
    select 1 from public.mtp_line_events
     where event_id in ('cleanup-old-processed', 'cleanup-old-failed')
  ) then
    raise exception 'cleanup left an old terminal row';
  end if;

  if not exists (
    select 1 from public.mtp_line_events
     where event_id = 'cleanup-old-processing' and status = 'processing'
  ) then
    raise exception 'cleanup removed an active processing row';
  end if;

  if not exists (
    select 1 from public.mtp_line_events
     where event_id = 'cleanup-recent-processed' and status = 'processed'
  ) then
    raise exception 'cleanup removed a recent terminal row';
  end if;
end;
$$;
reset role;

select 'LINE event ledger SQL/RLS lifecycle: PASS' as result;
