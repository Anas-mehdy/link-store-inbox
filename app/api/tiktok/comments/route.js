import { databaseAction, failure, getConnection, IntegrationError, json, managerToken, requireManager, setup, tiktok } from "../server";

export async function POST(request) {
  try {
    const accessToken = managerToken(request);
    await requireManager(accessToken);
    const input = await request.json().catch(() => null);
    const video = videoId(input?.video);
    const cursor = String(input?.cursor ?? 0);
    if (!video || !/^\d{1,16}$/.test(cursor)) {
      throw new IntegrationError("حط رابط فيديو كامل من حساب ‎@link.60.", 400);
    }
    const config = setup(accessToken);
    const connection = await getConnection(config);
    const result = await tiktok("business/comment/list", {
      token: connection.access_token,
      query: {
        business_id: connection.business_id, video_id: video, cursor, max_count: 30,
        status: "PUBLIC", sort_field: "create_time", sort_order: "desc",
      },
    });
    if (!Array.isArray(result.comments)) throw new IntegrationError("صيغة تعليقات تيك توك غير متوقعة.");
    const nextCursor = result.has_more ? String(result.cursor) : null;
    if (nextCursor && (!/^\d{1,16}$/.test(nextCursor) || nextCursor === cursor)) {
      throw new IntegrationError("تعذّر متابعة صفحات التعليقات.");
    }

    const rows = new Map();
    for (const comment of result.comments) {
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
    if (rows.size) {
      await databaseAction(config, "import_comments", [...rows.values()]);
    }
    return json({ count: rows.size, nextCursor });
  } catch (error) {
    return failure(error);
  }
}

function videoId(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  const url = URL.parse(value.trim());
  if (!url || !["https://www.tiktok.com", "https://tiktok.com"].includes(url.origin)) return null;
  return url.pathname.match(/^\/@link\.60\/video\/(\d{15,22})\/?$/i)?.[1] ?? null;
}
