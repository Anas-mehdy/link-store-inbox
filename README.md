# Link Store Customer Inbox

With Node.js 22 or later, run `npm ci` and `npm run dev`. With no inbox environment variables, the existing demo uses sample conversations in memory.

## Team mode

1. Apply the SQL migration under `supabase/migrations` to the Supabase project selected for the inbox. Test on a preview database first.
2. Set `INBOX_SUPABASE_URL` and `INBOX_SUPABASE_PUBLISHABLE_KEY` in `.env.local` or the deployment environment. Use a publishable key beginning with `sb_publishable_`.
3. Create each teammate's account in Supabase Auth and add a row to `public.link_inbox_members` using the account UUID, display name and either `manager` or `agent`. Set `active` to false to remove inbox access.

Active team members can read the inbox, change conversation status and save internal drafts. Managers can also assign conversations. Team mode starts empty and shows up to the 100 newest conversations once data is present. TikTok ingestion and reply delivery are separate integration steps.
