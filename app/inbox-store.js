const conversationFields = `
  id, type, name, handle, body, source, status, assigned_to, priority, received_at, tiktok_video_id, tiktok_comment_id,
  drafts:link_inbox_drafts(id, body, author_id, created_at, tiktok_delivery)
`;
const dateFormat = new Intl.DateTimeFormat("ar-SA", {
  calendar: "gregory", dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
});

export async function loadInbox(client, userId) {
  const { data: members } = await client.from("link_inbox_members")
    .select("user_id, display_name, role").eq("active", true)
    .order("display_name").throwOnError();
  const member = members.find(person => person.user_id === userId);
  if (!member) return {};

  const items = await loadConversations(client, members);
  return { member, members, items };
}

export const inboxPageSize = 100;

export async function loadConversations(client, members, { video, before } = {}) {
  let query = client.from("link_inbox_conversations")
    .select(conversationFields)
    .order("received_at", { ascending: false })
    .order("id", { ascending: false })
    .order("created_at", { referencedTable: "drafts" })
    .limit(inboxPageSize);
  if (video) query = query.eq("tiktok_video_id", video);
  if (before) {
    const { received_at: time, id } = before;
    query = query.or(`received_at.lt.${time},and(received_at.eq.${time},id.lt.${id})`);
  }
  const { data } = await query.throwOnError();
  return data.map(row => inboxItem(row, members));
}

export async function loadTikTokVideos(client) {
  const { data } = await client.rpc("link_inbox_tiktok_videos").throwOnError();
  return data;
}

export function inboxItem(row, members) {
  return {
    ...row,
    avatar: row.name.slice(0, 1),
    time: dateFormat.format(new Date(row.received_at)),
    assigned: row.assigned_to ?? "",
    replies: (row.drafts ?? []).map(draft => ({
      id: draft.id,
      by: members.find(person => person.user_id === draft.author_id)?.display_name ?? "عضو سابق",
      text: draft.body,
      delivery: draft.tiktok_delivery,
    })),
  };
}

export function mergeConversations(previous, incoming) {
  const byId = new Map(incoming.map(item => [item.id, item]));
  for (const item of previous) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) =>
    right.received_at.localeCompare(left.received_at) || right.id.localeCompare(left.id));
}

export async function saveConversation(client, id, changes) {
  await client.from("link_inbox_conversations").update(changes).eq("id", id)
    .select("id").single().throwOnError();
}

export async function saveDraft(client, { id, conversationId, text }) {
  await client.from("link_inbox_drafts").upsert(
    { id, conversation_id: conversationId, body: text },
    { onConflict: "id", ignoreDuplicates: true },
  ).throwOnError();
}

export async function publishTikTokReply(client, { conversationId, body }) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("سجّل الدخول أولًا.");
  const response = await fetch("/api/tiktok/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, body }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
