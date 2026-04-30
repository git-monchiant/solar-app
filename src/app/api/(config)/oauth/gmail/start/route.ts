import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/gmail";
import crypto from "crypto";

// GET /api/oauth/gmail/start
// Returns the Google consent URL. Client navigates to it via window.location
// after fetching (so the x-user-id auth header still works on this request,
// even though the browser hop to Google won't send it).
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  try {
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = `${gate.userId}:${nonce}`;
    const url = buildAuthUrl(state);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("oauth/gmail/start error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
