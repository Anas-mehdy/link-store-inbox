begin;

alter table public.link_inbox_conversations
  add column tiktok_comment_id text unique,
  add column tiktok_video_id text;

create table public.link_inbox_tiktok_connection (
  account text primary key check (account = 'link.60'),
  business_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  refresh_lock_until timestamptz
);

alter table public.link_inbox_tiktok_connection enable row level security;
revoke all on public.link_inbox_tiktok_connection from public, anon, authenticated;
grant select, insert, update on public.link_inbox_tiktok_connection to service_role;
grant select, insert on public.link_inbox_conversations to service_role;
grant select on public.link_inbox_members to service_role;

commit;
