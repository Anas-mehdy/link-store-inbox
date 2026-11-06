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

export async function requireManager(request) {
  const auth = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i);
  if (!auth) throw new IntegrationError("سجّل الدخول أولًا.", 401);
  if (!process.env.INBOX_SUPABASE_URL || !process.env.INBOX_SUPABASE_PUBLISHABLE_KEY) {
    throw new IntegrationError("وضع الفريق غير مفعّل.", 503);
  }
  const supabase = client(process.env.INBOX_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${auth[1]}` } },
  });
  const { data, error } = await supabase.auth.getUser(auth[1]);
  if (error || !data.user) throw new IntegrationError("جلسة الدخول غير صالحة.", 401);
  await requireMembership(supabase, data.user.id);
  return data.user.id;
}

export async function requireMembership(supabase, userId) {
  const { data } = await supabase.from("link_inbox_members").select("user_id")
    .eq("user_id", userId).eq("active", true).eq("role", "manager").maybeSingle().throwOnError();
  if (!data) throw new IntegrationError("هالعملية متاحة لمدير صندوق الوارد.", 403);
}

export function setup() {
  const { TIKTOK_CLIENT_ID: clientId, TIKTOK_CLIENT_SECRET: secret,
    TIKTOK_AUTHORIZATION_URL: authorizeUrl, TIKTOK_REDIRECT_URI: redirectUri,
    INBOX_SUPABASE_SERVICE_ROLE_KEY: serviceKey, INBOX_SUPABASE_URL: databaseUrl } = process.env;
  if (!clientId || !secret || !authorizeUrl || !redirectUri || !serviceKey || !databaseUrl) {
    throw new IntegrationError("إعدادات ربط تيك توك على الخادم غير مكتملة.", 503);
  }
  const authorization = new URL(authorizeUrl);
  const callback = new URL(redirectUri);
  if (authorization.origin !== "https://www.tiktok.com" || callback.protocol !== "https:"
    || callback.pathname !== "/api/tiktok/callback" || callback.search || callback.hash) {
    throw new IntegrationError("رابط التفويض أو العودة غير صالح.", 503);
  }
  return { authorization, callback, clientId, secret, db: client(serviceKey) };
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
    throw new IntegrationError(`تيك توك رفض الطلب${code}. تحقّق من تفويض الحساب والصلاحية.`);
  }
  return result.data;
}

const table = "link_inbox_tiktok_connection";

function tokenFields(data) {
  if (typeof data.access_token !== "string" || !data.access_token
    || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new IntegrationError("ردّ تيك توك لا يحتوي بيانات تفويض صالحة.");
  }
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    ...(data.refresh_token && { refresh_token: data.refresh_token }),
    refresh_lock_until: null,
  };
}

export async function saveConnection(config, data) {
  if (typeof data.open_id !== "string" || !data.open_id || !data.refresh_token
    || typeof data.scope !== "string" || !data.scope.split(/[, ]+/).includes("comment.list")) {
    throw new IntegrationError("تفويض تيك توك لا يتضمن صلاحية قراءة التعليقات.");
  }
  const { db } = config;
  const { data: existing } = await db.from(table).select("business_id")
    .eq("account", account).maybeSingle().throwOnError();
  const fields = tokenFields(data);
  if (!existing) {
    await db.from(table).insert({ ...fields, account, business_id: data.open_id }).throwOnError();
    return;
  }
  if (existing.business_id !== data.open_id) {
    throw new IntegrationError("هذا التفويض يعود لحساب تيك توك مختلف.", 409);
  }
  await db.from(table).update(fields).eq("account", account).eq("business_id", data.open_id).throwOnError();
}

export async function getConnection(config) {
  const { db, clientId, secret } = config;
  const { data } = await db.from(table).select("business_id, access_token, refresh_token, expires_at")
    .eq("account", account).maybeSingle().throwOnError();
  if (!data) throw new IntegrationError("فوّض حساب تيك توك أولًا من زر ربط الحساب.", 409);
  if (Date.parse(data.expires_at) > Date.now() + 60_000) return data;

  const now = new Date().toISOString();
  const lock = new Date(Date.now() + 30_000).toISOString();
  const { data: claimed } = await db.from(table).update({ refresh_lock_until: lock })
    .eq("account", account).eq("expires_at", data.expires_at)
    .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${now}`)
    .select("business_id").maybeSingle().throwOnError();
  if (!claimed) throw new IntegrationError("جارٍ تجديد التفويض. جرّب الاستيراد مرة ثانية.", 409);
  try {
    const refreshed = await tiktok("tt_user/oauth2/refresh_token", { body: {
      client_id: clientId, client_secret: secret, grant_type: "refresh_token", refresh_token: data.refresh_token,
    } });
    if (refreshed.open_id && refreshed.open_id !== data.business_id) {
      throw new IntegrationError("تعذّر تأكيد حساب تيك توك بعد التجديد.");
    }
    const { data: updated } = await db.from(table).update(tokenFields(refreshed))
      .eq("account", account).eq("refresh_lock_until", lock)
      .select("business_id, access_token").maybeSingle().throwOnError();
    if (!updated) throw new IntegrationError("تغيّر تفويض الحساب. جرّب الاستيراد مرة ثانية.", 409);
    return updated;
  } catch (error) {
    await db.from(table).update({ refresh_lock_until: null })
      .eq("account", account).eq("refresh_lock_until", lock);
    throw error;
  }
}
