import { account, failure, IntegrationError, json, managerToken, setup } from "../server";
import { publicVideoMetadata } from "./metadata";

export async function POST(request) {
  try {
    const token = managerToken(request);
    if (!token) throw new IntegrationError("سجّل الدخول أولًا.", 401);
    const { videoId } = await request.json();
    if (typeof videoId !== "string" || !/^\d{15,22}$/.test(videoId)) return json({}, 400);
    const { db } = setup(token);
    // The authenticated caller must be able to read a comment on this video.
    const { data: rows } = await db.from("link_inbox_conversations").select("id")
      .eq("tiktok_video_id", videoId).limit(1).throwOnError();
    if (!rows.length) return json({}, 404);
    const { data: cached } = await db.from("link_inbox_video_cards").select("caption,cover_url,fetched_at")
      .eq("video_id", videoId).maybeSingle().throwOnError();
    if (Date.now() - Date.parse(cached?.fetched_at) < 5 * 60_000) return json(cached);
    const response = await fetch(`https://www.tiktok.com/@${account}/video/${videoId}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new IntegrationError("تعذّر تحميل معاينة الفيديو.");
    const info = publicVideoMetadata(await response.text(), videoId, account);
    if (!info) throw new IntegrationError("ما توفّرت معاينة من تيك توك.");
    await db.rpc("link_inbox_store_video_preview", {
      target_id: videoId, caption_text: info.caption, cover: info.cover,
    }).throwOnError();
    return json({ caption: info.caption || cached?.caption, cover_url: info.cover || cached?.cover_url,
      fetched_at: new Date().toISOString() });
  } catch (error) {
    return failure(error);
  }
}
