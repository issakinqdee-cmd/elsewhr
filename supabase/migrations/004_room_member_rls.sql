create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room
      and user_id = auth.uid()
      and left_at is null
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "room members same-room read" on public.room_members;
create policy "room members same-room read" on public.room_members
for select to authenticated
using (public.is_room_member(room_members.room_id));

drop policy if exists "rooms members and public groups read" on public.rooms;
create policy "rooms members and public groups read" on public.rooms
for select to authenticated
using (
  (kind = 'group' and status = 'active')
  or public.is_room_member(rooms.id)
);

drop policy if exists "messages active members read" on public.messages;
create policy "messages active members read" on public.messages
for select to authenticated
using (public.is_room_member(messages.room_id));

drop policy if exists "messages active members send" on public.messages;
create policy "messages active members send" on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_room_member(messages.room_id)
);

drop policy if exists "rooms own delete" on public.rooms;
create policy "rooms own delete" on public.rooms
for delete to authenticated
using (created_by = auth.uid());
