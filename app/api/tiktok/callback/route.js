import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { IntegrationError, openManagerToken, privateHeaders, requireManager, saveConnection, setup, stateCookie, tiktok } from "../server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams;
  if (!query.has("auth_code") && !query.has("code") && !query.has("error") && !query.has("state")) {
    return new NextResponse("TikTok OAuth callback endpoint is online.", { headers: privateHeaders });
  }

  let outcome = "error";
  try {
    const { secret, callback } = setup();
    const cookie = request.cookies.get(stateCookie)?.value ?? "";
    const [state, userId, expiry, sealed, signature] = cookie.split(".");
    const expected = createHmac("sha256", secret).update(`${state}.${userId}.${expiry}.${sealed}`).digest();
    const provided = Buffer.from(signature ?? "", "hex");
    if (url.origin !== callback.origin || !state || state !== query.get("state")
      || !(Number(expiry) > Date.now()) || provided.length !== expected.length
      || !timingSafeEqual(provided, expected)) {
      throw new IntegrationError("انتهت جلسة التفويض أو كانت غير صالحة.");
    }
    const code = query.get("auth_code") ?? query.get("code");
    if (query.has("error") || !code) throw new IntegrationError("لم يكتمل تفويض تيك توك.");
    const accessToken = openManagerToken(sealed, state);
    if (await requireManager(accessToken) !== userId) throw new IntegrationError("جلسة التفويض غير صالحة.");
    const config = setup(accessToken);
    const tokens = await tiktok("tt_user/oauth2/token", { body: {
      client_id: config.clientId, client_secret: config.secret, grant_type: "authorization_code",
      auth_code: code, redirect_uri: config.callback.href,
    } });
    const canReply = await saveConnection(config, tokens);
    outcome = canReply ? "connected" : "read-only";
  } catch (error) {
    if (error instanceof IntegrationError && error.status === 409) outcome = "wrong-account";
  }
  const response = NextResponse.redirect(new URL(`/?tiktok=${outcome}#tiktok`, url.origin), {
    status: 303, headers: privateHeaders,
  });
  response.cookies.set(stateCookie, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
