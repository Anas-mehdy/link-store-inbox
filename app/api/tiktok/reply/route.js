import {
  databaseAction, failure, getConnection, IntegrationError, json, managerToken,
  requireManager, setup, tiktok, TikTokRequestRejection,
} from "../server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const accessToken = managerToken(request);
    await requireManager(accessToken);
    const input = await request.json().catch(() => null);
    const body = typeof input?.body === "string" ? input.body.trim() : "";
    if (typeof input?.conversationId !== "string" || !uuid.test(input.conversationId)
      || !body || [...body].length > 1200) {
      throw new IntegrationError("اختَر تعليق واكتب رد بطول أقصاه 1200 حرف.", 400);
    }

    const config = setup(accessToken);
    const connection = await getConnection(config);
    if (!connection.can_reply) {
      throw new IntegrationError("أعد ربط حساب تيك توك من الإعدادات ووافق على صلاحية إدارة التعليقات.", 409);
    }
    const claim = await databaseAction(config, "claim_reply", {
      conversation_id: input.conversationId, body,
    });
    if (claim?.status === "missing") throw new IntegrationError("ما لقينا تعليق تيك توك المطلوب.", 404);
    if (claim?.status !== "pending") {
      throw new IntegrationError("في رد منشور أو طلب إرسال قائم لهالتعليق. حدّث صندوق الوارد.", 409);
    }

    let published;
    try {
      published = await tiktok("business/comment/reply/create", {
        token: connection.access_token,
        body: {
          business_id: connection.business_id, video_id: claim.video_id,
          comment_id: claim.comment_id, text: body,
        },
      });
    } catch (error) {
      if (error instanceof TikTokRequestRejection) {
        await databaseAction(config, "release_reply", { id: claim.id }).catch(() => {});
        throw error;
      }
      return await uncertain(config, claim.id);
    }

    if (typeof published.comment_id !== "string" || !/^\d+$/.test(published.comment_id)
      || published.parent_comment_id !== claim.comment_id || published.video_id !== claim.video_id) {
      return await uncertain(config, claim.id);
    }
    try {
      const saved = await databaseAction(config, "finish_reply", {
        id: claim.id, reply_id: published.comment_id,
      });
      if (saved === true) return json({ id: claim.id });
    } catch {
      // TikTok confirmed publication, so preserve the reservation and avoid reposting.
    }
    return json({ error: "تيك توك أكّد نشر الرد، لكن ما قدرنا نحفظ التأكيد محليًا. لا تعيد الإرسال." }, 502);
  } catch (error) {
    return failure(error);
  }
}

async function uncertain(config, id) {
  await databaseAction(config, "flag_reply", { id }).catch(() => {});
  return json({ error: "ما قدرنا نأكد نشر الرد. تحقّق من التعليق على تيك توك قبل أي محاولة ثانية." }, 502);
}
