create function public.link_inbox_needs_reply(term text default '')
returns setof public.link_inbox_conversations
language sql stable security invoker set search_path = '' as $$
  select c.* from public.link_inbox_conversations c
  where c.type = 'comment' and c.status <> 'done'
    and not exists (
      select 1 from public.link_inbox_drafts d
      where d.conversation_id = c.id and d.tiktok_delivery = 'published'
    )
    and (term = '' or c.id in (select s.id from public.link_inbox_search(term) s))
$$;

revoke all on function public.link_inbox_needs_reply(text) from public, anon, authenticated;
grant execute on function public.link_inbox_needs_reply(text) to authenticated;

create or replace function public.link_inbox_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', count(*),
    'new', count(*) filter (where status = 'new'),
    'open', count(*) filter (where status = 'open'),
    'done', count(*) filter (where status = 'done'),
    'needs_reply', (select count(*) from public.link_inbox_needs_reply()))
  from public.link_inbox_conversations
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'link_inbox_drafts'
  ) then
    alter publication supabase_realtime add table public.link_inbox_drafts;
  end if;
end;
$$;
