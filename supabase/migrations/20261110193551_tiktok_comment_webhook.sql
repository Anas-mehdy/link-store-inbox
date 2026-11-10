begin;

alter table link_inbox_private.tiktok_backend_key
  add column webhook_setup_digest bytea check (octet_length(webhook_setup_digest) = 32),
  add column webhook_setup_expires_at timestamptz;

create or replace function link_inbox_private.tiktok_backend(operation text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection public.link_inbox_tiktok_connection%rowtype;
  target public.link_inbox_conversations%rowtype;
  delivery public.link_inbox_drafts%rowtype;
  key_header text := current_setting('request.headers', true)::jsonb ->> 'x-inbox-tiktok-key';
begin
  if key_header is null or length(key_header) <> 64
    or not exists (
      select 1 from link_inbox_private.tiktok_backend_key
      where secret_digest = sha256(convert_to(key_header, 'UTF8'))
    )
  then
    raise insufficient_privilege using message = 'TikTok inbox backend access denied';
  end if;

  -- Service calls require the existing server key and a matching TikTok account.
  -- This role cannot save a connection or publish replies.
  if (select auth.uid()) is null then
    if operation = 'activate_webhook' then
      update link_inbox_private.tiktok_backend_key
      set webhook_setup_digest = null, webhook_setup_expires_at = null
      where webhook_setup_expires_at > clock_timestamp()
        and webhook_setup_digest = sha256(convert_to(payload ->> 'proof', 'UTF8'));
      return to_jsonb(found);
    end if;

    if operation not in ('get_connection', 'claim_refresh', 'finish_refresh',
      'release_refresh', 'import_comments') then
      raise insufficient_privilege using message = 'TikTok webhook operation denied';
    end if;
    if not exists (
      select 1 from public.link_inbox_tiktok_connection
      where account = 'link.60' and business_id = payload ->> 'openid'
    ) then
      return null;
    end if;
    payload := payload -> 'data';
  elsif link_inbox_private.current_role() is distinct from 'manager' then
    raise insufficient_privilege using message = 'TikTok inbox backend access denied';
  end if;

  case operation
    when 'get_connection' then
      select * into connection from public.link_inbox_tiktok_connection where account = 'link.60';

    when 'save_connection' then
      insert into public.link_inbox_tiktok_connection as existing
        (account, business_id, access_token, refresh_token, expires_at, can_reply)
      values ('link.60', payload ->> 'business_id', payload ->> 'access_token',
        payload ->> 'refresh_token', (payload ->> 'expires_at')::timestamptz,
        coalesce((payload ->> 'can_reply')::boolean, false))
      on conflict (account) do update set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
        refresh_lock_until = null, can_reply = excluded.can_reply
      where existing.business_id = excluded.business_id
      returning * into connection;

    when 'claim_refresh' then
      update public.link_inbox_tiktok_connection
      set refresh_lock_until = clock_timestamp() + interval '30 seconds'
      where account = 'link.60' and expires_at = (payload ->> 'expires_at')::timestamptz
        and (refresh_lock_until is null or refresh_lock_until < clock_timestamp())
      returning * into connection;

    when 'finish_refresh' then
      update public.link_inbox_tiktok_connection set access_token = payload ->> 'access_token',
        refresh_token = coalesce(payload ->> 'refresh_token', refresh_token),
        expires_at = (payload ->> 'expires_at')::timestamptz, refresh_lock_until = null,
        can_reply = coalesce((payload ->> 'can_reply')::boolean, can_reply)
      where account = 'link.60' and refresh_lock_until = (payload ->> 'lock')::timestamptz
      returning * into connection;

    when 'release_refresh' then
      update public.link_inbox_tiktok_connection set refresh_lock_until = null
      where account = 'link.60' and refresh_lock_until = (payload ->> 'lock')::timestamptz;
      return null;

    when 'import_comments' then
      if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) > 30 then
        raise invalid_parameter_value using message = 'Invalid TikTok import page';
      end if;
      insert into public.link_inbox_conversations
        (tiktok_comment_id, tiktok_video_id, type, name, handle, body, source, received_at)
      select comment_id, video_id, 'comment', name, handle, body, source, received_at
      from jsonb_to_recordset(payload) as comment(
        comment_id text, video_id text, name text, handle text, body text, source text, received_at timestamptz
      )
      on conflict (tiktok_comment_id) do nothing;
      return null;

    when 'claim_reply' then
      select * into target from public.link_inbox_conversations
      where id = (payload ->> 'conversation_id')::uuid and type = 'comment'
        and tiktok_video_id is not null and tiktok_comment_id is not null;
      if not found then return jsonb_build_object('status', 'missing'); end if;

      insert into public.link_inbox_drafts (id, conversation_id, body, tiktok_delivery)
      values (gen_random_uuid(), target.id, payload ->> 'body', 'pending')
      on conflict (conversation_id) where tiktok_delivery <> 'draft' do nothing
      returning * into delivery;
      if not found then return jsonb_build_object('status', 'already_reserved'); end if;

      return jsonb_build_object('id', delivery.id, 'status', 'pending',
        'video_id', target.tiktok_video_id, 'comment_id', target.tiktok_comment_id);

    when 'finish_reply' then
      if nullif(payload ->> 'reply_id', '') is null then
        raise invalid_parameter_value using message = 'Missing TikTok reply ID';
      end if;
      update public.link_inbox_drafts
      set tiktok_delivery = 'published', tiktok_reply_id = payload ->> 'reply_id'
      where id = (payload ->> 'id')::uuid and author_id = (select auth.uid())
        and tiktok_delivery = 'pending';
      return to_jsonb(found);

    when 'release_reply' then
      delete from public.link_inbox_drafts
      where id = (payload ->> 'id')::uuid and author_id = (select auth.uid())
        and tiktok_delivery = 'pending';
      return to_jsonb(found);

    when 'flag_reply' then
      update public.link_inbox_drafts set tiktok_delivery = 'unknown'
      where id = (payload ->> 'id')::uuid and author_id = (select auth.uid())
        and tiktok_delivery = 'pending';
      return to_jsonb(found);

    else
      raise invalid_parameter_value using message = 'Invalid TikTok inbox operation';
  end case;

  if connection.account is null then return null; end if;
  return to_jsonb(connection);
end;
$$;


grant usage on schema link_inbox_private to anon;
grant execute on function link_inbox_private.tiktok_backend(text, jsonb) to anon;
grant execute on function public.link_inbox_tiktok_backend(text, jsonb) to anon;

create index link_inbox_conversations_video_time
  on public.link_inbox_conversations (tiktok_video_id, received_at desc, id desc)
  where tiktok_video_id is not null;

create function public.link_inbox_tiktok_videos()
returns table(video_id text, comment_count bigint, latest_comment_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select tiktok_video_id, count(*), max(received_at)
  from public.link_inbox_conversations
  where tiktok_video_id is not null
  group by tiktok_video_id
  order by max(received_at) desc, tiktok_video_id
$$;

revoke all on function public.link_inbox_tiktok_videos() from public, anon, authenticated;
grant execute on function public.link_inbox_tiktok_videos() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'link_inbox_conversations'
  ) then
    alter publication supabase_realtime add table public.link_inbox_conversations;
  end if;
end;
$$;

commit;
