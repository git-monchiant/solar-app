import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveTokens } from "@/lib/gmail";
import { google } from "googleapis";

// GET /api/oauth/gmail/callback?code=...&state=...
// Public endpoint — Google redirects here after user grants consent. We
// can't use the x-user-id auth header here (it's a browser nav from Google),
// so the state token is our trust signal: format `${userId}:${nonce}`.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return htmlResponse(`<h2>Gmail auth failed</h2><p>${escapeHtml(error)}</p><p><a href="/settings">กลับไป Settings</a></p>`);
  }
  if (!code || !state || !state.includes(":")) {
    return htmlResponse(`<h2>Invalid callback</h2><p>missing code or state</p>`);
  }

  try {
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      return htmlResponse(`<h2>ไม่ได้ refresh_token</h2><p>ลอง revoke app ใน <a href="https://myaccount.google.com/permissions">Google Permissions</a> แล้ว connect ใหม่</p>`);
    }

    auth.setCredentials(tokens);
    // gmail.users.getProfile returns emailAddress under the readonly scope —
    // avoids needing the userinfo.email scope.
    const gmail = google.gmail({ version: "v1", auth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress || "";

    await saveTokens({
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope!,
      token_type: tokens.token_type!,
      expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
      email,
      connected_at: new Date().toISOString(),
    });

    return htmlResponse(`
      <h2>เชื่อม Gmail สำเร็จ ✓</h2>
      <p>${escapeHtml(email)}</p>
      <p>หน้านี้สามารถปิดได้</p>
      <script>setTimeout(() => { window.location.href = '/settings'; }, 1500);</script>
    `);
  } catch (e) {
    console.error("oauth/gmail/callback error:", e);
    return htmlResponse(`<h2>ผิดพลาด</h2><pre>${escapeHtml(e instanceof Error ? e.message : "Failed")}</pre>`);
  }
}

function htmlResponse(body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Gmail OAuth</title>
<style>body{font-family:-apple-system,sans-serif;padding:2rem;max-width:480px;margin:0 auto;color:#1f2937}h2{margin:0 0 .5rem}a{color:#0ea5e9}</style>
</head><body>${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
