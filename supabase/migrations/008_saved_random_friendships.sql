create or replace function public.connect_or_accept_user(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_id uuid;
  current_status text;
  reverse_id uuid;
  reverse_status text;
  final_status text := 'pending';
  saved_room uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if target_user is null or target_user = me then raise exception 'Invalid target user'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(me::text, target_user::text) || ':' || greatest(me::text, target_user::text), 0
  ));

  select id, status into current_id, current_status
  from public.connections
  where requester_id = me and receiver_id = target_user
  limit 1
  for update;

  select id, status into reverse_id, reverse_status
  from public.connections
  where requester_id = target_user and receiver_id = me
  limit 1
  for update;

  if current_status = 'accepted' or reverse_status = 'accepted' or reverse_status = 'pending' then
    if current_id is null then
      insert into public.connections(requester_id, receiver_id, status)
      values (me, target_user, 'accepted')
      returning id into current_id;
    else
      update public.connections set status = 'accepted' where id = current_id;
    end if;

    if reverse_id is not null then
      update public.connections set status = 'accepted' where id = reverse_id;
    end if;

    final_status := 'accepted';

    select r.id into saved_room
    from public.rooms r
    where r.kind = 'random'
      and r.status = 'active'
      and exists (
        select 1 from public.room_members rm
        where rm.room_id = r.id and rm.user_id = me and rm.left_at is null
      )
      and exists (
        select 1 from public.room_members rm
        where rm.room_id = r.id and rm.user_id = target_user and rm.left_at is null
      )
    order by r.created_at desc
    limit 1
    for update;

    if saved_room is not null then
      update public.rooms set kind = 'direct', title = null, description = null
      where id = saved_room;
    end if;
  else
    if current_id is null then
      insert into public.connections(requester_id, receiver_id, status)
      values (me, target_user, 'pending')
      returning id into current_id;
    else
      update public.connections
      set status = 'pending'
      where id = current_id;
    end if;
    final_status := 'pending';
  end if;

  return jsonb_build_object(
    'connection_id', current_id,
    'status', final_status,
    'room_id', saved_room
  );
end;
$$;

create or replace function public.accept_connection(connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
  me uuid := auth.uid();
  requester uuid;
  saved_room uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select requester_id into requester
  from public.connections
  where id = connection_id
    and status = 'pending'
    and receiver_id = me
  for update;

  if requester is null then raise exception 'Connection request not found'; end if;

  update public.connections
  set status = 'accepted'
  where id = connection_id
     or (
       requester_id = me
       and receiver_id = requester
       and status = 'pending'
     );

  perform pg_advisory_xact_lock(hashtextextended(
    least(me::text, requester::text) || ':' || greatest(me::text, requester::text), 0
  ));

  select r.id into saved_room
  from public.rooms r
  where r.kind = 'random'
    and r.status = 'active'
    and exists (
      select 1 from public.room_members rm
      where rm.room_id = r.id and rm.user_id = me and rm.left_at is null
    )
    and exists (
      select 1 from public.room_members rm
      where rm.room_id = r.id and rm.user_id = requester and rm.left_at is null
    )
  order by r.created_at desc
  limit 1
  for update;

  if saved_room is not null then
    update public.rooms
    set kind = 'direct', title = null, description = null
    where id = saved_room;
  end if;

  return jsonb_build_object(
    'connection_id', connection_id,
    'status', 'accepted',
    'room_id', saved_room
  );
end;
$;

revoke execute on function public.connect_or_accept_user(uuid) from public, anon;
grant execute on function public.connect_or_accept_user(uuid) to authenticated;
revoke execute on function public.accept_connection(uuid) from public, anon;
grant execute on function public.accept_connection(uuid) to authenticated;
