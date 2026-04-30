import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/maps/resolve?url=<short-url>
// Follows HTTP redirects (e.g. maps.app.goo.gl, goo.gl/maps) so the client
// can extract lat/lng from the expanded URL. CORS prevents the browser from
// doing this directly.
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
  "maps.google.com",
  "www.google.com",
  "google.com",
]);

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const raw = req.nextUrl.searchParams.get("url") || "";
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });
  let url: URL;
  try { url = new URL(raw); } catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }
  try {
    // First try HEAD; if the server doesn't support it, fall back to GET.
    let res = await fetch(url.toString(), { method: "HEAD", redirect: "follow" });
    if (!res.ok || res.status >= 400) {
      res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    }
    return NextResponse.json({ url: res.url });
  } catch (e) {
    console.error("GET /api/maps/resolve error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
