alter table public.messages
  add column if not exists media_name text,
  add column if not exists media_size bigint;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  26214400,
  array[
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "attachment member read" on storage.objects;
drop policy if exists "attachment member insert" on storage.objects;
drop policy if exists "attachment owner update" on storage.objects;
drop policy if exists "attachment owner delete" on storage.objects;

create policy "attachment member read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and exists (
    select 1
    from public.room_members rm
    where rm.room_id = (storage.foldername(name))[1]::uuid
      and rm.user_id = (select auth.uid())
      and rm.left_at is null
  )
);

create policy "attachment member insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.room_members rm
    where rm.room_id = (storage.foldername(name))[1]::uuid
      and rm.user_id = (select auth.uid())
      and rm.left_at is null
  )
);

create policy "attachment owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'attachments'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'attachments'
  and owner_id = (select auth.uid())::text
);

create policy "attachment owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attachments'
  and owner_id = (select auth.uid())::text
);
