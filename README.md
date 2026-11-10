# Link Store Customer Inbox

With Node.js 22 or later, run `npm ci` and `npm run dev`. With no inbox environment variables, the existing demo uses sample conversations in memory.

## Team mode

1. Apply the SQL migration under `supabase/migrations` to the Supabase project selected for the inbox. Test on a preview database first.
2. Set `INBOX_SUPABASE_URL` and `INBOX_SUPABASE_PUBLISHABLE_KEY` in `.env.local` or the deployment environment. Use a publishable key beginning with `sb_publishable_`.
3. Create each teammate's account in Supabase Auth and add a row to `public.link_inbox_members` using the account UUID, display name and either `manager` or `agent`. Set `active` to false to remove inbox access.

Active team members can read the inbox, change conversation status and save internal drafts. Managers can also assign conversations. Team mode starts empty and shows up to the 100 newest conversations once data is present. TikTok comments can be imported manually from an owned video.

## TikTok comments

Apply the migrations in order. The TikTok integration also requires the server-only
`INBOX_TIKTOK_DB_TOKEN`, a random 32-byte hex string whose SHA-256 digest is stored in
`link_inbox_private.tiktok_backend_key`, and these server-side variables:

- `TIKTOK_CLIENT_ID` and `TIKTOK_CLIENT_SECRET` from Link Store Analytics in TikTok API for Business.
- `TIKTOK_AUTHORIZATION_URL` from the app's TikTok account holder authorization settings.
- `TIKTOK_REDIRECT_URI` set to the exact registered dashboard callback on the same origin.
  The existing production registration is `https://link-store-inbox.vercel.app/api/tiktok/callback`.
  To test OAuth in Preview, register its stable callback URL first and configure it in that environment.

Sign in as an inbox manager, open Settings, and authorize with the TikTok account
`@link.60`. Paste the full URL of one of its videos to import public top-level customer
comments. Follow the next-page button when available. Reimporting a page preserves
existing conversation state and drafts. The inbox shows its newest 100 conversations.
Managers can publish one public reply per imported comment after granting comment management in TikTok. Internal drafts remain separate. An unconfirmed send is held for verification to prevent duplicate replies.
