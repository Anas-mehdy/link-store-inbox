import InboxAccess from "./inbox-access";
import "./dashboard.css";

export default function Home() {
  const url = process.env.INBOX_SUPABASE_URL;
  const key = process.env.INBOX_SUPABASE_PUBLISHABLE_KEY;

  return <InboxAccess config={url || key ? { url, key: key?.startsWith("sb_publishable_") ? key : null } : null} />;
}
