drop policy if exists "rooms members read" on public.rooms;
drop policy if exists "rooms members and public groups read" on public.rooms;
create policy "rooms members and public groups read" on public.rooms
for select to authenticated
using (
  (kind = 'group' and status = 'active')
  or exists (
    select 1 from public.room_members rm
    where rm.room_id = rooms.id
      and rm.user_id = (select auth.uid())
      and rm.left_at is null
  )
);

drop policy if exists "messages room members read" on public.messages;
create policy "messages active members read" on public.messages
for select to authenticated
using (exists (
  select 1 from public.room_members rm
  where rm.room_id = messages.room_id
    and rm.user_id = (select auth.uid())
    and rm.left_at is null
));

drop policy if exists "messages self send" on public.messages;
create policy "messages active members send" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.room_members rm
    where rm.room_id = messages.room_id
      and rm.user_id = (select auth.uid())
      and rm.left_at is null
  )
);

drop policy if exists "room members self insert" on public.room_members;
create policy "room members self insert" on public.room_members
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "room members self update" on public.room_members;
create policy "room members self update" on public.room_members
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "rooms create" on public.rooms;
create policy "rooms create" on public.rooms
for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "rooms own update" on public.rooms;
create policy "rooms own update" on public.rooms
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));
