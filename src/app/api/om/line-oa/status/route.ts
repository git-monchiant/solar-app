import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOmDb, OM_LINE } from "@/lib/om/line";

// ภาพรวม Channel — สถานะการเชื่อมต่อ + สถิติผูกตัวตน (ใช้ตัดสินว่าเผยแพร่เมนูแล้วจะถึงใครบ้าง)
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  let bot: { displayName?: string; basicId?: string; premiumId?: string } | null = null;
  if (OM_LINE.enabled && OM_LINE.token) {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${OM_LINE.token}` },
    }).catch(() => null);
    if (res?.ok) bot = await res.json();
  }

  const db = await getOmDb();
  const s = await db.request().query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN is_follow = 1 THEN 1 ELSE 0 END) AS following,
           SUM(CASE WHEN identity_status = 'verified' THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN identity_status = 'verified' AND is_follow = 1 THEN 1 ELSE 0 END) AS reachable
    FROM om_line_users`);

  return NextResponse.json({
    enabled: OM_LINE.enabled,
    mode: OM_LINE.mode,
    has_token: !!OM_LINE.token,
    has_secret: !!OM_LINE.secret,
    webhook_path: "/api/om/webhook/line",
    bot,
    stats: s.recordset[0],
  }, { headers: { "Cache-Control": "no-store" } });
}
