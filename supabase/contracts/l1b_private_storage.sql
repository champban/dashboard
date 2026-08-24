-- L1B private object Storage source contract.
--
-- THIS IS NOT A MIGRATION AND MUST NOT BE APPLIED TO PRODUCTION FROM THIS
-- BRANCH. The PostgreSQL test runner supplies a throwaway Storage-compatible
-- catalog. Production bucket creation/policies require a separate exact gate.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'mtp-private',
  'mtp-private',
  false,
  5242880,
  array[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf','text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
     where id='mtp-private' and name='mtp-private' and public=false
       and file_size_limit=5242880
       and allowed_mime_types=array[
         'image/jpeg','image/png','image/gif','image/webp',
         'video/mp4','video/quicktime','video/webm',
         'application/pdf','text/plain',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]::text[]
  ) then
    raise exception 'mtp_private_bucket_contract_mismatch';
  end if;
end;
$$;

create policy mtp_private_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id='mtp-private'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] in ('task','note')
    and pg_catalog.array_length(storage.foldername(name),1)>=5
    and (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

create policy mtp_private_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id='mtp-private'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] in ('task','note')
    and pg_catalog.array_length(storage.foldername(name),1)>=5
    and (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

create policy mtp_private_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id='mtp-private'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] in ('task','note')
    and pg_catalog.array_length(storage.foldername(name),1)>=5
    and (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
  with check (
    bucket_id='mtp-private'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] in ('task','note')
    and pg_catalog.array_length(storage.foldername(name),1)>=5
    and (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

create policy mtp_private_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id='mtp-private'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] in ('task','note')
    and pg_catalog.array_length(storage.foldername(name),1)>=5
    and (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

comment on policy mtp_private_owner_select on storage.objects is
  'L1B source-only owner prefix policy; bucket remains uncreated in Production.';
