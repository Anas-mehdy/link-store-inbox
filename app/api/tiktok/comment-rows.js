import { IntegrationError } from "./server";

export function commentRows(comments, video) {
  const rows = new Map();
  for (const comment of comments) {
    if (comment.status === "HIDDEN" || comment.owner || comment.parent_comment_id) continue;
    const time = Number(comment.create_time);
    const id = comment.comment_id;
    if (typeof id !== "string" || !/^\d+$/.test(id) || !Number.isFinite(time) || time <= 0
      || time > 253402300799) throw new IntegrationError("وصل تعليق بصيغة غير متوقعة.");
    rows.set(id, {
      comment_id: id, video_id: video,
      name: comment.display_name || comment.username || "مستخدم تيك توك",
      handle: comment.username || "",
      body: comment.text || (comment.image_url ? "تعليق بصورة" : ""),
      source: `فيديو تيك توك ${video}`,
      received_at: new Date(time * 1000).toISOString(),
    });
  }
  return rows;
}
