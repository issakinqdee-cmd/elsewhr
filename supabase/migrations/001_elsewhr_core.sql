create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  age smallint check (age is null or age >= 18),
  country text,
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  bio text,
  primary_photo_path text,
  primary_photo_url text,
  discoverable boolean not null default true,
  online_visible boolean not null default true,
  verified_at timestamptz,
  is_plus boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'random' check (kind in ('random','direct','group')),
  status text not null default 'active' check (status in ('waiting','active','ended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id,user_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  media_type text check (media_type is null or media_type in ('image','gif','voice','video')),
  media_path text,
  view_once boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id,receiver_id),
  check (requester_id <> receiver_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('paypal')),
  provider_subscription_id text not null unique,
  plan text not null check (plan in ('monthly','yearly')),
  status text not null default 'created',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists connections_updated_at on public.connections;
create trigger connections_updated_at before update on public.connections
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "profiles public discoverable read" on public.profiles;
create policy "profiles public discoverable read" on public.profiles
for select to anon, authenticated
using (discoverable = true or id = (select auth.uid()));

drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "rooms members read" on public.rooms;
create policy "rooms members read" on public.rooms
for select to authenticated
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = id and rm.user_id = (select auth.uid())
  )
);

drop policy if exists "rooms create" on public.rooms;
create policy "rooms create" on public.rooms
for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "room members self insert" on public.room_members;
create policy "room members self insert" on public.room_members
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "room members own read" on public.room_members;
create policy "room members own read" on public.room_members
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "messages room members read" on public.messages;
create policy "messages room members read" on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = messages.room_id and rm.user_id = (select auth.uid())
  )
);

drop policy if exists "messages self send" on public.messages;
create policy "messages self send" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.room_members rm
    where rm.room_id = messages.room_id and rm.user_id = (select auth.uid())
  )
);

drop policy if exists "connections participants read" on public.connections;
create policy "connections participants read" on public.connections
for select to authenticated
using (requester_id = (select auth.uid()) or receiver_id = (select auth.uid()));

drop policy if exists "connections requester create" on public.connections;
create policy "connections requester create" on public.connections
for insert to authenticated
with check (requester_id = (select auth.uid()));

drop policy if exists "connections participant update" on public.connections;
create policy "connections participant update" on public.connections
for update to authenticated
using (requester_id = (select auth.uid()) or receiver_id = (select auth.uid()))
with check (requester_id = (select auth.uid()) or receiver_id = (select auth.uid()));

drop policy if exists "blocks own read" on public.blocks;
create policy "blocks own read" on public.blocks
for select to authenticated
using (blocker_id = (select auth.uid()));

drop policy if exists "blocks own insert" on public.blocks;
create policy "blocks own insert" on public.blocks
for insert to authenticated
with check (blocker_id = (select auth.uid()));

drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports
for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists "reports own read" on public.reports;
create policy "reports own read" on public.reports
for select to authenticated
using (reporter_id = (select auth.uid()));

drop policy if exists "subscriptions own read" on public.subscriptions;
create policy "subscriptions own read" on public.subscriptions
for select to authenticated
using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatar owner insert" on storage.objects;
create policy "avatar owner insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

drop policy if exists "avatar owner delete" on storage.objects;
create policy "avatar owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end
$$;
