alter table public.messages
  add column if not exists reply_to_id bigint references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create table if not exists public.message_deletions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;
alter table public.message_deletions enable row level security;

drop policy if exists "message reactions room read" on public.message_reactions;
create policy "message reactions room read" on public.message_reactions
for select to authenticated
using (public.is_room_member((select room_id from public.messages where id = message_reactions.message_id)));

drop policy if exists "message reactions self insert" on public.message_reactions;
create policy "message reactions self insert" on public.message_reactions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_room_member((select room_id from public.messages where id = message_reactions.message_id))
);

drop policy if exists "message reactions self delete" on public.message_reactions;
create policy "message reactions self delete" on public.message_reactions
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "message deletions own read" on public.message_deletions;
create policy "message deletions own read" on public.message_deletions
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "message deletions self insert" on public.message_deletions;
create policy "message deletions self insert" on public.message_deletions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_room_member((select room_id from public.messages where id = message_deletions.message_id))
);

drop policy if exists "message deletions self delete" on public.message_deletions;
create policy "message deletions self delete" on public.message_deletions
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "messages own update" on public.messages;
create policy "messages own update" on public.messages
for update to authenticated
using (
  sender_id = (select auth.uid())
  and public.is_room_member(messages.room_id)
)
with check (
  sender_id = (select auth.uid())
  and public.is_room_member(messages.room_id)
);

create or replace function public.guard_message_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.room_id <> old.room_id or new.sender_id <> old.sender_id or new.created_at <> old.created_at then
    raise exception 'Message identity cannot be changed';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'Deleted message cannot be restored';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_mutation on public.messages;
create trigger messages_guard_mutation
before update on public.messages
for each row execute function public.guard_message_mutation();

do $$
declare t text;
begin
  foreach t in array array['public.message_reactions','public.message_deletions'] loop
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
