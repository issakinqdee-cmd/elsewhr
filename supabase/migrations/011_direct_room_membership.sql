create or replace function public.get_or_create_direct_room(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing_room uuid;
  new_room uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if target_user is null or target_user = me then raise exception 'Invalid target user'; end if;

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
