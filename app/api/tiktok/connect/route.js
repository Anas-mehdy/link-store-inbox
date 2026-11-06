import { randomBytes, createHmac } from "node:crypto";
import { failure, IntegrationError, json, requireManager, setup, stateCookie } from "../server";

export async function POST(request) {
  try {
    const userId = await requireManager(request);
    const { authorization, callback, secret } = setup();
    if (new URL(request.url).origin !== callback.origin) {
      throw new IntegrationError("افتح الداشبورد من الرابط المسجّل للتفويض.", 409);
    }
    const state = randomBytes(32).toString("hex");
    const value = `${state}.${userId}.${Date.now() + 600_000}`;
    const signature = createHmac("sha256", secret).update(value).digest("hex");
    authorization.searchParams.set("scope", "comment.list");
    authorization.searchParams.set("redirect_uri", callback.href);
    authorization.searchParams.set("state", state);
    const response = json({ url: authorization.href });
    response.cookies.set(stateCookie, `${value}.${signature}`, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
