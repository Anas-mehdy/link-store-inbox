-- Both queries run with the employee's existing row-level access.
create function link_inbox_private.search_text(value text)
returns text language sql immutable strict parallel safe set search_path = '' as $$
  select lower(translate(value, 'أإآٱ٠١٢٣٤٥٦٧٨٩ـًٌٍَُِّْ', 'اااا0123456789'))
$$;

create function public.link_inbox_search(term text)
returns setof public.link_inbox_conversations
language sql stable security invoker set search_path = '' as $$
  select c.* from public.link_inbox_conversations c
  where strpos(link_inbox_private.search_text(concat_ws(' ', c.name, '@' || c.handle,
    c.body, c.source, c.tiktok_video_id, c.tiktok_comment_id)),
    link_inbox_private.search_text(btrim(term))) > 0
$$;

create function public.link_inbox_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', count(*),
    'new', count(*) filter (where status = 'new'),
    'open', count(*) filter (where status = 'open'),
    'done', count(*) filter (where status = 'done'))
  from public.link_inbox_conversations
$$;

revoke all on function link_inbox_private.search_text(text), public.link_inbox_search(text),
  public.link_inbox_counts() from public, anon, authenticated;
grant execute on function link_inbox_private.search_text(text), public.link_inbox_search(text),
  public.link_inbox_counts() to authenticated;
