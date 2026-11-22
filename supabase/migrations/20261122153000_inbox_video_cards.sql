create table public.link_inbox_video_cards (
  video_id text primary key check (video_id ~ '^[0-9]{15,22}$'),
  internal_title text check (length(internal_title) between 1 and 100),
  caption text,
  cover_url text,
  fetched_at timestamptz
);
alter table public.link_inbox_video_cards enable row level security;
revoke all on public.link_inbox_video_cards from public, anon, authenticated;
grant select, insert (video_id, internal_title), update (video_id, internal_title)
  on public.link_inbox_video_cards to authenticated;

create policy inbox_cards_read on public.link_inbox_video_cards for select to authenticated
  using ((select link_inbox_private.current_role()) is not null);
create policy inbox_cards_create on public.link_inbox_video_cards for insert to authenticated
  with check (exists (select 1 from public.link_inbox_conversations c
    where c.tiktok_video_id = video_id));
create policy inbox_cards_edit on public.link_inbox_video_cards for update to authenticated
  using ((select link_inbox_private.current_role()) is not null)
  with check (exists (select 1 from public.link_inbox_conversations c
    where c.tiktok_video_id = video_id));

create function public.link_inbox_video_catalog()
returns table(video_id text, comment_count bigint, latest_comment_at timestamptz,
  internal_title text, caption text, cover_url text, fetched_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select v.video_id, v.comment_count, v.latest_comment_at,
    m.internal_title, m.caption, m.cover_url, m.fetched_at
  from public.link_inbox_tiktok_videos() v
  left join public.link_inbox_video_cards m using (video_id)
  order by v.latest_comment_at desc, v.video_id
$$;

-- Automatic source refreshes must never overwrite a name saved by the team.
create function link_inbox_private.store_video_preview(target_id text, caption_text text, cover text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  key_header text := current_setting('request.headers',true)::jsonb ->> 'x-inbox-tiktok-key';
begin
  if link_inbox_private.current_role() is null or key_header is null or not exists (
    select 1 from link_inbox_private.tiktok_backend_key
    where secret_digest = sha256(convert_to(key_header,'UTF8'))
  ) then raise insufficient_privilege; end if;
  if not exists (select 1 from public.link_inbox_conversations where tiktok_video_id = target_id)
  then raise no_data_found; end if;
  insert into public.link_inbox_video_cards as card (video_id,caption,cover_url,fetched_at)
  values (target_id,nullif(left(caption_text,4000),''),nullif(cover,''),now())
  on conflict (video_id) do update set caption=coalesce(excluded.caption,card.caption),
    cover_url=coalesce(excluded.cover_url,card.cover_url), fetched_at=excluded.fetched_at;
end;
$$;
create function public.link_inbox_store_video_preview(target_id text, caption_text text, cover text)
returns void language sql security invoker set search_path = '' as $$
  select link_inbox_private.store_video_preview(target_id,caption_text,cover)
$$;
revoke all on function public.link_inbox_video_catalog(), public.link_inbox_store_video_preview(text,text,text),
  link_inbox_private.store_video_preview(text,text,text) from public, anon, authenticated;
grant execute on function public.link_inbox_video_catalog(), public.link_inbox_store_video_preview(text,text,text),
  link_inbox_private.store_video_preview(text,text,text) to authenticated;
