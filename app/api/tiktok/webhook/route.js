import { createHmac, timingSafeEqual } from "node:crypto";
import { commentRows } from "../comment-rows";
import { databaseAction, getConnection, json, setup, tiktok } from "../server";

export const maxDuration = 30;

const idPattern = /^\d{15,22}$/;

function signed(raw, header, secret) {
  const fields = new Map(header?.split(",").map(part => part.trim().split("=")));
  const timestamp = fields.get("t") ?? "";
  const signature = fields.get("s") ?? "";
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f\d]{64}$/i.test(signature)
    || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

function parseComment(content) {
  return JSON.parse(content, (key, value, context) => {
    // TikTok sends snowflake IDs as JSON numbers. Keep the source digits.
    if ((key === "video_id" || key === "comment_id") && typeof value === "number") {
      return context.source;
    }
    return value;
  });
}

export async function POST(request) {
  try {
    const config = setup(null, { webhook: true });
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.byteLength > 65_536) return json({}, 413);
    if (!signed(raw, request.headers.get("tiktok-signature"), config.secret)) return json({}, 401);

    const envelope = JSON.parse(raw.toString("utf8"));
    if (envelope?.client_key !== config.clientId) return json({}, 403);
    if (envelope.event !== "comment.update") return json({});
    if (typeof envelope.user_openid !== "string" || !envelope.user_openid
      || typeof envelope.content !== "string") return json({}, 400);

    const event = parseComment(envelope.content);
    if (event?.comment_type !== "comment" || !["insert", "set_to_public"].includes(event.comment_action)) {
      return json({});
    }
    const { video_id: video, comment_id: id } = event;
    if (!idPattern.test(video ?? "") || !idPattern.test(id ?? "")) return json({}, 400);

    config.openid = envelope.user_openid;
    const existing = await databaseAction(config, "get_connection");
    if (!existing) return json({});
    const connection = await getConnection(config, existing);
    const result = await tiktok("business/comment/list", {
      token: connection.access_token,
      query: {
        business_id: connection.business_id, video_id: video, comment_ids: JSON.stringify([id]),
        status: "PUBLIC",
      },
    });
    if (!Array.isArray(result.comments)) throw new Error("Invalid TikTok comment response");
    const comment = result.comments.find(row => row.comment_id === id);
    if (!comment) {
      // A new comment may be temporarily absent from the listing.
      const createdAt = Number(envelope.create_time);
      return json({}, Number.isFinite(createdAt) && Date.now() / 1000 - createdAt < 600 ? 503 : 200);
    }
    const rows = commentRows([comment], video);
    if (rows.size) await databaseAction(config, "import_comments", [...rows.values()]);
    return json({});
  } catch (error) {
    if (error instanceof SyntaxError) return json({}, 400);
    const logId = request.headers.get("x-tt-logid");
    console.error("TikTok comment webhook processing failed", {
      logId: /^[a-z0-9]{1,100}$/i.test(logId ?? "") ? logId : undefined,
      status: error.status,
      code: error.code,
    });
    return json({}, 503);
  }
}
