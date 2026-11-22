import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const account = "link.60";
export const stateCookie = "__Host-link-inbox-tiktok-state";
export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

export class IntegrationError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export class TikTokRequestRejection extends IntegrationError {}

export function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

export function failure(error) {
  return error instanceof IntegrationError
    ? json({ error: error.message }, error.status)
    : json({ error: "تعذّر إكمال طلب تيك توك. جرّب مرة أخرى." }, 502);
}

function client(key, options) {
  return createClient(process.env.INBOX_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...options,
  });
}

export async function requireManager(accessToken) {
  if (!accessToken) throw new IntegrationError("سجّل الدخول أولًا.", 401);
  if (!process.env.INBOX_SUPABASE_URL || !process.env.INBOX_SUPABASE_PUBLISHABLE_KEY) {
    throw new IntegrationError("وضع الفريق غير مفعّل.", 503);
  }
  const supabase = client(process.env.INBOX_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new IntegrationError("جلسة الدخول غير صالحة.", 401);
  await requireMembership(supabase, data.user.id);
  return data.user.id;
}

export async function requireMembership(supabase, userId) {
  const { data } = await supabase.from("link_inbox_members").select("user_id")
    .eq("user_id", userId).eq("active", true).eq("role", "manager").maybeSingle().throwOnError();
  if (!data) throw new IntegrationError("هالعملية متاحة لمدير صندوق الوارد.", 403);
}

export function managerToken(request) {
  return request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
}

export function setup(accessToken, { webhook = false } = {}) {
  const { TIKTOK_CLIENT_ID: clientId, TIKTOK_CLIENT_SECRET: secret,
    TIKTOK_AUTHORIZATION_URL: authorizeUrl, TIKTOK_REDIRECT_URI: redirectUri,
    INBOX_TIKTOK_DB_TOKEN: dbToken, INBOX_SUPABASE_URL: databaseUrl,
    INBOX_SUPABASE_PUBLISHABLE_KEY: publishableKey } = process.env;
  if (!clientId || !secret || !authorizeUrl || !redirectUri || !databaseUrl
    || !publishableKey || !/^[a-f0-9]{64}$/.test(dbToken ?? "")) {
    throw new IntegrationError("إعدادات ربط تيك توك على الخادم غير مكتملة.", 503);
  }
  const authorization = new URL(authorizeUrl);
  const callback = new URL(redirectUri);
  if (authorization.origin !== "https://www.tiktok.com" || callback.protocol !== "https:"
    || callback.pathname !== "/api/tiktok/callback" || callback.search || callback.hash) {
    throw new IntegrationError("رابط التفويض أو العودة غير صالح.", 503);
  }
  const db = (accessToken || webhook) && client(publishableKey, {
    global: { headers: {
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      "x-inbox-tiktok-key": dbToken,
    } },
  });
  return { authorization, callback, clientId, secret, db };
}

export function sealManagerToken(accessToken, state) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(process.env.INBOX_TIKTOK_DB_TOKEN, "hex"), iv);
  cipher.setAAD(Buffer.from(state));
  const sealed = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

export function openManagerToken(encoded, state) {
  const sealed = Buffer.from(encoded, "base64url");
  const decipher = createDecipheriv("aes-256-gcm",
    Buffer.from(process.env.INBOX_TIKTOK_DB_TOKEN, "hex"), sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from(state));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8");
}

export async function databaseAction(config, operation, payload = {}) {
  if (config.openid) payload = { openid: config.openid, data: payload };
  const { data } = await config.db.rpc("link_inbox_tiktok_backend", { operation, payload }).throwOnError();
  return data;
}

export async function tiktok(path, { query, body, token } = {}) {
  const url = new URL(`https://business-api.tiktok.com/open_api/v1.3/${path}/`);
  if (query) url.search = new URLSearchParams(query);
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body && { "Content-Type": "application/json" }),
      ...(token && { "Access-Token": token }),
    },
    body: body && JSON.stringify(body),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.code !== 0 || !result.data) {
    const code = Number.isSafeInteger(result.code) ? ` (رمز ${result.code})` : "";
    const rejected = (response.status >= 400 && response.status < 500)
      || (response.ok && result.code >= 40000 && result.code < 50000);
    const ErrorType = rejected ? TikTokRequestRejection : IntegrationError;
    throw new ErrorType(`تيك توك رفض الطلب${code}. تحقّق من تفويض الحساب والصلاحية.`);
  }
  return result.data;
}

function tokenFields(data) {
  if (typeof data.access_token !== "string" || !data.access_token
    || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new IntegrationError("ردّ تيك توك لا يحتوي بيانات تفويض صالحة.");
  }
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    ...(data.refresh_token && { refresh_token: data.refresh_token }),
    ...(typeof data.scope === "string" && {
      can_reply: data.scope.split(/[, ]+/).includes("comment.list.manage"),
    }),
  };
}

export async function saveConnection(config, data) {
  if (typeof data.open_id !== "string" || !data.open_id || !data.refresh_token
    || typeof data.scope !== "string" || !data.scope.split(/[, ]+/).includes("comment.list")) {
    throw new IntegrationError("تفويض تيك توك لا يتضمن صلاحية قراءة التعليقات.");
  }
  const saved = await databaseAction(config, "save_connection", {
    ...tokenFields(data), business_id: data.open_id,
  });
  if (!saved) throw new IntegrationError("هذا التفويض يعود لحساب تيك توك مختلف.", 409);
  return saved.can_reply === true;
}

export async function getConnection(config, existing) {
  const { clientId, secret } = config;
  const data = existing ?? await databaseAction(config, "get_connection");
  if (!data) throw new IntegrationError("فوّض حساب تيك توك أولًا من زر ربط الحساب.", 409);
  if (Date.parse(data.expires_at) > Date.now() + 60_000) return data;

  const claimed = await databaseAction(config, "claim_refresh", { expires_at: data.expires_at });
  if (!claimed) throw new IntegrationError("جارٍ تجديد التفويض. جرّب الاستيراد مرة ثانية.", 409);
  const lock = claimed.refresh_lock_until;
  try {
    const refreshed = await tiktok("tt_user/oauth2/refresh_token", { body: {
      client_id: clientId, client_secret: secret, grant_type: "refresh_token", refresh_token: data.refresh_token,
    } });
    if (refreshed.open_id && refreshed.open_id !== data.business_id) {
      throw new IntegrationError("تعذّر تأكيد حساب تيك توك بعد التجديد.");
    }
    const updated = await databaseAction(config, "finish_refresh", { ...tokenFields(refreshed), lock });
    if (!updated) throw new IntegrationError("تغيّر تفويض الحساب. جرّب الاستيراد مرة ثانية.", 409);
    return updated;
  } catch (error) {
    await databaseAction(config, "release_refresh", { lock }).catch(() => {});
    throw error;
  }
}
