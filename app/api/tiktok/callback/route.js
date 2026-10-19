import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Placeholder only. Never log, store, render, or exchange OAuth codes until
// authorization state, account authorization, and secure server-side storage are implemented.
export async function GET(request) {
  const url = new URL(request.url);
  const hasError = url.searchParams.has("error");
  const hasCode = url.searchParams.has("code");
  const message = hasError
    ? "TikTok authorization was declined or failed. No account was connected."
    : hasCode
      ? "Authorization callback received, but token exchange is not configured. No account was connected."
      : "TikTok OAuth callback endpoint is online. No account was connected.";
  return new NextResponse(message, {
    status: hasError ? 400 : hasCode ? 501 : 200,
    headers: {"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}
  });
}
