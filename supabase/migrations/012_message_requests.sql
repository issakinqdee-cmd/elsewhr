create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  room_id uuid null references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);

create unique index if not exists message_requests_one_pending_pair
on public.message_requests(sender_id, receiver_id)
where status = 'pending';

create index if not exists message_requests_receiver_status_idx
on public.message_requests(receiver_id, status, created_at desc);

create index if not exists message_requests_sender_status_idx
on public.message_requests(sender_id, status, created_at desc);

alter table public.message_requests enable row level security;

revoke all on table public.message_requests from anon, authenticated;
grant select, insert, update on table public.message_requests to authenticated;

drop policy if exists "message requests participant read" on public.message_requests;
drop policy if exists "message requests sender create" on public.message_requests;
drop policy if exists "message requests receiver respond" on public.message_requests;

create policy "message requests participant read"
on public.message_requests
for select
to authenticated
using (
  sender_id = (select auth.uid())
  or receiver_id = (select auth.uid())
);

create policy "message requests sender create"
on public.message_requests
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_id <> receiver_id
);

create policy "message requests receiver respond"
on public.message_requests
for update
to authenticated
using (
  receiver_id = (select auth.uid())
  and status = 'pending'
)
with check (
  receiver_id = (select auth.uid())
  and status in ('accepted','declined')
);

create or replace function public.send_message_request(target_user uuid, request_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  request_id uuid;
  trimmed_body text := btrim(request_body);
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if target_user is null or target_user = me then raise exception 'Invalid recipient'; end if;
  if char_length(trimmed_body) < 1 then raise exception 'Write a message first'; end if;
  if char_length(trimmed_body) > 2000 then raise exception 'Message is too long'; end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = me and blocked_id = target_user)
       or (blocker_id = target_user and blocked_id = me)
  ) then
    raise exception 'This member is unavailable';
  end if;

  if exists (
    select 1 from public.connections
    where status = 'accepted'
      and (
        (requester_id = me and receiver_id = target_user)
        or (requester_id = target_user and receiver_id = me)
      )
  ) then
    raise exception 'You are already connected. Open the conversation instead.';
  end if;

  select id into request_id
  from public.message_requests
  where sender_id = me
    and receiver_id = target_user
    and status = 'pending'
  order by created_at desc
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  insert into public.message_requests(sender_id, receiver_id, body)
  values (me, target_user, trimmed_body)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.accept_message_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  request_row public.message_requests;
  sender uuid;
  created_room_id uuid;
  existing_connection_id uuid;
  reverse_connection_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select *
  into request_row
  from public.message_requests
  where id = request_id
    and receiver_id = me
  for update;

  if request_row.id is null then raise exception 'Message request not found'; end if;
  if request_row.status = 'accepted' and request_row.room_id is not null then
    return request_row.room_id;
  end if;
  if request_row.status <> 'pending' then raise exception 'This request has already been declined'; end if;

  sender := request_row.sender_id;

  perform pg_advisory_xact_lock(hashtextextended(
    least(me::text, sender::text) || ':' || greatest(me::text, sender::text), 0
  ));

  select id into existing_connection_id
  from public.connections
  where requester_id = sender and receiver_id = me
  limit 1
  for update;

  select id into reverse_connection_id
  from public.connections
  where requester_id = me and receiver_id = sender
  limit 1
  for update;

  if existing_connection_id is not null then
    update public.connections set status = 'accepted' where id = existing_connection_id;
  elsif reverse_connection_id is not null then
    update public.connections set status = 'accepted' where id = reverse_connection_id;
  else
    insert into public.connections(requester_id, receiver_id, status)
    values (sender, me, 'accepted')
    returning id into existing_connection_id;
  end if;

  created_room_id := public.get_or_create_direct_room(sender);

  insert into public.messages(room_id, sender_id, body)
  values (created_room_id, sender, request_row.body);

  update public.message_requests
  set status = 'accepted',
      room_id = created_room_id,
      responded_at = now()
  where id = request_row.id;

  return created_room_id;
end;
$$;

create or replace function public.deny_message_request(request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;

  update public.message_requests
  set status = 'declined',
      responded_at = now()
  where id = request_id
    and receiver_id = me
    and status = 'pending';

  if not found then
    raise exception 'Message request not found';
  end if;

  return true;
end;
$$;

revoke execute on function public.send_message_request(uuid,text) from public, anon;
grant execute on function public.send_message_request(uuid,text) to authenticated;

revoke execute on function public.accept_message_request(uuid) from public, anon;
grant execute on function public.accept_message_request(uuid) to authenticated;

revoke execute on function public.deny_message_request(uuid) from public, anon;
grant execute on function public.deny_message_request(uuid) to authenticated;

create or replace function public.get_or_create_direct_room(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing_room uuid;
  new_room uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if target_user is null or target_user = me then raise exception 'Invalid target user'; end if;

  if not exists (
    select 1
    from public.connections
    where status = 'accepted'
      and (
        (requester_id = me and receiver_id = target_user)
        or (requester_id = target_user and receiver_id = me)
      )
  ) then
    raise exception 'Accept the connection or message request before starting a conversation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(me::text, target_user::text) || ':' || greatest(me::text, target_user::text), 0
  ));

  select r.id into existing_room
  from public.rooms r
  where r.kind = 'direct' and r.status = 'active'
    and exists (
      select 1 from public.room_members a
      where a.room_id = r.id and a.user_id = me and a.left_at is null
    )
    and exists (
      select 1 from public.room_members b
      where b.room_id = r.id and b.user_id = target_user and b.left_at is null
    )
  order by r.created_at desc
  limit 1;

  if existing_room is not null then return existing_room; end if;

  insert into public.rooms(kind, status, created_by)
  values ('direct', 'active', me)
  returning id into new_room;

  insert into public.room_members(room_id, user_id)
  values (new_room, me), (new_room, target_user);

  return new_room;
end;
$$;

alter publication supabase_realtime add table public.message_requests;
