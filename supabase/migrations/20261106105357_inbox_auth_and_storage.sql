begin;

create schema if not exists link_inbox_private;
revoke all on schema link_inbox_private from public, anon, authenticated;
grant usage on schema link_inbox_private to authenticated;

create table public.link_inbox_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) > 0),
  role text not null check (role in ('manager', 'agent')),
  active boolean not null default true
);

create table public.link_inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('comment', 'dm')),
  name text not null,
  handle text not null,
  body text not null,
  source text not null,
  status text not null default 'new' check (status in ('new', 'open', 'done')),
  assigned_to uuid references public.link_inbox_members (user_id) on delete set null,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  received_at timestamptz not null default now()
);

create table public.link_inbox_drafts (
  id uuid primary key,
  conversation_id uuid not null references public.link_inbox_conversations (id) on delete cascade,
  author_id uuid default auth.uid() references public.link_inbox_members (user_id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index on public.link_inbox_conversations (received_at desc, id desc);
create index on public.link_inbox_conversations (assigned_to);
create index on public.link_inbox_drafts (conversation_id, created_at);
create index on public.link_inbox_drafts (author_id);

alter table public.link_inbox_members enable row level security;
alter table public.link_inbox_conversations enable row level security;
alter table public.link_inbox_drafts enable row level security;

revoke all on public.link_inbox_members, public.link_inbox_conversations, public.link_inbox_drafts
  from public, anon, authenticated;
grant select on public.link_inbox_members, public.link_inbox_conversations, public.link_inbox_drafts
  to authenticated;
grant update (status, assigned_to) on public.link_inbox_conversations to authenticated;
grant insert (id, conversation_id, body) on public.link_inbox_drafts to authenticated;

-- The member policy needs the caller's own membership without recursively applying itself.
create function link_inbox_private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.link_inbox_members
  where user_id = (select auth.uid()) and active
$$;

revoke all on function link_inbox_private.current_role() from public, anon, authenticated;
grant execute on function link_inbox_private.current_role() to authenticated;

create policy inbox_team_roster on public.link_inbox_members
  for select to authenticated
  using (active and (select link_inbox_private.current_role()) is not null);

create policy inbox_team_read_conversations on public.link_inbox_conversations
  for select to authenticated
  using ((select link_inbox_private.current_role()) is not null);

create policy inbox_team_update_conversations on public.link_inbox_conversations
  for update to authenticated
  using ((select link_inbox_private.current_role()) is not null)
  with check ((select link_inbox_private.current_role()) is not null);

create function link_inbox_private.check_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is distinct from old.assigned_to and current_user = 'authenticated' then
    if link_inbox_private.current_role() is distinct from 'manager' then
      raise insufficient_privilege using message = 'Only inbox managers can assign conversations';
    end if;
    if new.assigned_to is not null and not exists (
      select 1 from public.link_inbox_members where user_id = new.assigned_to and active
    ) then
      raise check_violation using message = 'Assignee must be an active inbox member';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function link_inbox_private.check_assignment() from public, anon, authenticated;
create trigger inbox_check_assignment before update of assigned_to on public.link_inbox_conversations
  for each row execute function link_inbox_private.check_assignment();

create policy inbox_team_read_drafts on public.link_inbox_drafts
  for select to authenticated
  using ((select link_inbox_private.current_role()) is not null);

create policy inbox_team_create_drafts on public.link_inbox_drafts
  for insert to authenticated
  with check (
    (select link_inbox_private.current_role()) is not null and author_id = (select auth.uid())
  );

commit;
