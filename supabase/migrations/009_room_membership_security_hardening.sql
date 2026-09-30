drop policy if exists "room members self insert" on public.room_members;

create policy "room members self insert"
on public.room_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.rooms r
    where r.id = room_members.room_id
      and r.kind = 'group'
      and r.status = 'active'
  )
);
