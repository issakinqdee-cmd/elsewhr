alter table public.rooms
  add column if not exists title text,
  add column if not exists description text;

create table if not exists public.match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  online boolean not null default true,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.match_queue enable row level security;
alter table public.presence enable row level security;

drop policy if exists "presence public read" on public.presence;
create policy "presence public read" on public.presence
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = presence.user_id and p.discoverable = true
  )
  or user_id = (select auth.uid())
);

drop policy if exists "presence own insert" on public.presence;
create policy "presence own insert" on public.presence
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "presence own update" on public.presence;
create policy "presence own update" on public.presence
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "rooms members read" on public.rooms;
drop policy if exists "rooms members and public groups read" on public.rooms;
create policy "rooms members and public groups read" on public.rooms
for select to authenticated
using (
  (kind = 'group' and status = 'active')
  or exists (
    select 1 from public.room_members rm
    where rm.room_id = rooms.id and rm.user_id = (select auth.uid())
  )
);

drop policy if exists "room members same-room read" on public.room_members;
create policy "room members same-room read" on public.room_members
for select to authenticated
using (
  exists (
    select 1 from public.room_members mine
    where mine.room_id = room_members.room_id
      and mine.user_id = (select auth.uid())
  )
);

drop policy if exists "room members self update" on public.room_members;
create policy "room members self update" on public.room_members
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.touch_presence(p_online boolean default true)
returns public.presence
language plpgsql
security invoker
set search_path = public
as $$
declare result public.presence;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.presence (user_id, online, last_seen, updated_at)
  values (auth.uid(), p_online, now(), now())
  on conflict (user_id) do update
    set online = excluded.online, last_seen = now(), updated_at = now()
  returning * into result;
  return result;
end;
$$;

grant execute on function public.touch_presence(boolean) to authenticated;

create or replace function public.join_random_queue()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  other_user uuid;
  matched_room uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));

  select mq.user_id into other_user
  from public.match_queue mq
  where mq.user_id <> me
    and exists (
      select 1 from public.profiles p
      where p.id = mq.user_id and p.discoverable = true
    )
  order by mq.created_at
  for update skip locked
  limit 1;

  if other_user is null then
    insert into public.match_queue(user_id) values (me)
    on conflict (user_id) do update set created_at = now();
    return null;
  end if;

  insert into public.rooms(kind, status, created_by)
  values ('random', 'active', me)
  returning id into matched_room;

  insert into public.room_members(room_id, user_id)
  values (matched_room, me), (matched_room, other_user);

  delete from public.match_queue where user_id in (me, other_user);
  return matched_room;
end;
$$;

revoke all on function public.join_random_queue() from public;
grant execute on function public.join_random_queue() to authenticated;

create or replace function public.leave_random_queue()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.match_queue where user_id = auth.uid();
  return true;
end;
$$;

grant execute on function public.leave_random_queue() to authenticated;

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
    and exists (select 1 from public.room_members a where a.room_id = r.id and a.user_id = me)
    and exists (select 1 from public.room_members b where b.room_id = r.id and b.user_id = target_user)
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

revoke all on function public.get_or_create_direct_room(uuid) from public;
grant execute on function public.get_or_create_direct_room(uuid) to authenticated;

drop trigger if exists presence_updated_at on public.presence;
create trigger presence_updated_at
before update on public.presence
for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['public.profiles','public.rooms','public.room_members','public.messages','public.connections','public.presence'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = split_part(t, '.', 1)
        and tablename = split_part(t, '.', 2)
    ) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end
$$;
