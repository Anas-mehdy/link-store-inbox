const conversationFields = `
  id, type, name, handle, body, source, status, assigned_to, priority, received_at, tiktok_video_id,
  drafts:link_inbox_drafts(id, body, author_id, created_at)
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

  const { data } = await client.from("link_inbox_conversations")
    .select(conversationFields)
    .order("received_at", { ascending: false })
    .order("id", { ascending: false })
    .order("created_at", { referencedTable: "drafts" })
    .limit(100)
    .throwOnError();

  return {
    member, members, items: data.map(row => ({
      ...row,
      avatar: row.name.slice(0, 1),
      time: dateFormat.format(new Date(row.received_at)),
      assigned: row.assigned_to ?? "",
      replies: row.drafts.map(draft => ({
        id: draft.id,
        by: members.find(person => person.user_id === draft.author_id)?.display_name ?? "عضو سابق",
        text: draft.body,
      })),
    })),
  };
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
