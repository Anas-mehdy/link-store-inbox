begin;

create table link_inbox_private.tiktok_backend_key (
  singleton boolean primary key default true check (singleton),
  secret_digest bytea not null check (octet_length(secret_digest) = 32)
);
alter table link_inbox_private.tiktok_backend_key enable row level security;
revoke all on link_inbox_private.tiktok_backend_key from public, anon, authenticated;

-- The browser's manager session and the server's secret are both required.
create function link_inbox_private.tiktok_backend(operation text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection public.link_inbox_tiktok_connection%rowtype;
  key_header text := current_setting('request.headers', true)::jsonb ->> 'x-inbox-tiktok-key';
begin
  if (select auth.uid()) is null
    or link_inbox_private.current_role() is distinct from 'manager'
    or key_header is null or length(key_header) <> 64
    or not exists (
      select 1 from link_inbox_private.tiktok_backend_key
      where secret_digest = sha256(convert_to(key_header, 'UTF8'))
    )
  then
    raise insufficient_privilege using message = 'TikTok inbox backend access denied';
  end if;

  case operation
    when 'get_connection' then
      select * into connection from public.link_inbox_tiktok_connection where account = 'link.60';

    when 'save_connection' then
      insert into public.link_inbox_tiktok_connection as existing
        (account, business_id, access_token, refresh_token, expires_at)
      values ('link.60', payload ->> 'business_id', payload ->> 'access_token',
        payload ->> 'refresh_token', (payload ->> 'expires_at')::timestamptz)
      on conflict (account) do update set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
        refresh_lock_until = null
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
        expires_at = (payload ->> 'expires_at')::timestamptz, refresh_lock_until = null
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

    else
      raise invalid_parameter_value using message = 'Invalid TikTok inbox operation';
  end case;

  if connection.account is null then return null; end if;
  return to_jsonb(connection);
end;
$$;

revoke all on function link_inbox_private.tiktok_backend(text, jsonb) from public, anon, authenticated;
grant execute on function link_inbox_private.tiktok_backend(text, jsonb) to authenticated;

-- PostgREST exposes the invoker wrapper. The privileged function stays in the private schema.
create function public.link_inbox_tiktok_backend(operation text, payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select link_inbox_private.tiktok_backend(operation, payload)
$$;

revoke all on function public.link_inbox_tiktok_backend(text, jsonb) from public, anon, authenticated;
grant execute on function public.link_inbox_tiktok_backend(text, jsonb) to authenticated;

commit;
