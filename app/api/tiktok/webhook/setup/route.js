import { databaseAction, failure, IntegrationError, json, managerToken, requireManager, setup, tiktok } from "../../server";

async function settings(request, activate) {
  try {
    const accessToken = managerToken(request);
    const proof = activate && request.headers.get("x-inbox-webhook-setup");
    if (!proof) await requireManager(accessToken);
    const config = setup(proof ? null : accessToken, { webhook: Boolean(proof) });
    const host = process.env.VERCEL_BRANCH_URL ?? config.callback.host;
    if (proof && request.headers.get("x-inbox-webhook-host") !== host) {
      throw new IntegrationError("رابط استقبال التعليقات مختلف عن النسخة المطلوبة.", 409);
    }
    if (proof && (!/^[a-f\d]{64}$/.test(proof)
      || !await databaseAction(config, "activate_webhook", { proof }))) {
      throw new IntegrationError("تفويض تفعيل المزامنة غير صالح.", 403);
    }

    const callback = new URL("/api/tiktok/webhook", `https://${host}`).href;
    const credentials = { app_id: config.clientId, secret: config.secret, event_type: "COMMENT" };
    const read = () => tiktok("business/webhook/list", { query: credentials });
    const existing = await read();
    const registered = value => value.callback_url === callback && !value.item_list?.length;
    if (registered(existing)) return json({ status: "active" });
    if (existing.callback_url || existing.item_list?.length) {
      if (activate) throw new IntegrationError("يوجد اشتراك تعليقات بإعداد مختلف في تطبيق تيك توك.", 409);
      return json({ status: "conflict" });
    }
    if (!activate) return json({ status: "inactive" });

    await tiktok("business/webhook/update", { body: { ...credentials, callback_url: callback } });
    if (!registered(await read())) {
      throw new IntegrationError("تعذّر تأكيد تفعيل مزامنة التعليقات من تيك توك.");
    }
    return json({ status: "active" });
  } catch (error) {
    return failure(error);
  }
}

export function GET(request) {
  return settings(request, false);
}

export function POST(request) {
  return settings(request, true);
}
