import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

// Sink for browser-side errors. Deliberately unauthenticated — auth failures
// (401) are exactly the class of bug we need to debug, so requiring a valid
// session here would suppress the most useful reports. user_id is best-effort
// from the x-user-id header that apiFetch already forwards.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userIdHeader = req.headers.get("x-user-id");
    const userId = userIdHeader && /^\d+$/.test(userIdHeader) ? parseInt(userIdHeader) : null;
    const trim = (s: unknown, max: number) =>
      typeof s === "string" ? s.slice(0, max) : null;

    const db = await getDb();
    await db.request()
      .input("user_id", sql.Int, userId)
      .input("source", sql.NVarChar(50), trim(body.source, 50))
      .input("message", sql.NVarChar(2000), trim(body.message, 2000))
      .input("stack", sql.NVarChar(sql.MAX), typeof body.stack === "string" ? body.stack : null)
      .input("url", sql.NVarChar(500), trim(body.url, 500))
      .input("user_agent", sql.NVarChar(500), trim(req.headers.get("user-agent"), 500))
      .input("status_code", sql.Int, typeof body.status_code === "number" ? body.status_code : null)
      .input("request_url", sql.NVarChar(500), trim(body.request_url, 500))
      .query(`
        INSERT INTO client_errors (user_id, source, message, stack, url, user_agent, status_code, request_url)
        VALUES (@user_id, @source, @message, @stack, @url, @user_agent, @status_code, @request_url)
      `);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Never let logging itself produce an error — it would feedback-loop into
    // the same logger from the browser. Silently swallow + status 200.
    console.error("POST /api/client-log error:", e);
    return NextResponse.json({ ok: true });
  }
}
