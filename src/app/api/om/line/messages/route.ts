import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb, pushLineMessage, OM_LINE } from "@/lib/om/line";
import { mediaUrl, publicBaseUrl } from "@/lib/om/media";

// GET ?line_user_id=Uxxx — ประวัติแชตของคนนั้น (แล้ว mark ว่าอ่านแล้ว)
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const lineUserId = req.nextUrl.searchParams.get("line_user_id") || "";
  if (!lineUserId) return NextResponse.json({ error: "line_user_id required" }, { status: 400 });

  const db = await getOmDb();
  const r = await db.request()
    .input("id", sql.NVarChar(64), lineUserId)
    .query(`SELECT TOP 200 id, direction, message_type, text, payload, admin_user_id, created_at
            FROM om_line_messages WHERE line_user_id = @id
            ORDER BY created_at DESC, id DESC`);
  await db.request()
    .input("id", sql.NVarChar(64), lineUserId)
    .query(`UPDATE om_line_messages SET is_read = 1
            WHERE line_user_id = @id AND direction = 'in' AND is_read = 0`);

  return NextResponse.json({ messages: fixDates(r.recordset).reverse() });
}

// POST — แอดมินตอบ: push ไป LINE (ถ้าเปิดใช้) + เก็บลงประวัติเสมอ
//   ข้อความ: { line_user_id, text }
//   รูป/วิดีโอ: { line_user_id, media_token } (อัปโหลดผ่าน /api/om/line/media ก่อน)
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const { line_user_id: lineUserId, text, media_token: mediaToken } = await req.json().catch(() => ({}));
  if (!lineUserId || (typeof text !== "string" || !text.trim()) === !mediaToken) {
    return NextResponse.json({ error: "ต้องมี line_user_id + อย่างใดอย่างหนึ่ง: text หรือ media_token" }, { status: 400 });
  }

  const db = await getOmDb();
  const base = publicBaseUrl(req.nextUrl.origin);

  let messageType = "text";
  let lineMessage: Record<string, string>;
  let payload: string | null = null;

  if (mediaToken) {
    const m = await db.request()
      .input("token", sql.NVarChar(48), String(mediaToken))
      .query(`SELECT kind FROM om_line_media WHERE token = @token AND source = 'admin'`);
    const kind = m.recordset[0]?.kind as "image" | "video" | undefined;
    if (!kind) return NextResponse.json({ error: "ไม่พบไฟล์ที่อัปโหลด" }, { status: 404 });

    const url = mediaUrl(base, String(mediaToken));
    messageType = kind;
    payload = JSON.stringify({ media_token: mediaToken });
    lineMessage =
      kind === "image"
        ? { type: "image", originalContentUrl: url, previewImageUrl: url }
        : { type: "video", originalContentUrl: url, previewImageUrl: `${base}/om/video-preview.png` };
  } else {
    lineMessage = { type: "text", text: String(text).trim() };
  }

  const push = await pushLineMessage(lineUserId, [lineMessage]);
  if (OM_LINE.enabled && !push.ok) {
    return NextResponse.json({ error: `ส่งไป LINE ไม่สำเร็จ (${push.status}): ${push.body}` }, { status: 502 });
  }

  await db.request()
    .input("line_user_id", sql.NVarChar(64), lineUserId)
    .input("message_type", sql.NVarChar(30), messageType)
    .input("text", sql.NVarChar(sql.MAX), mediaToken ? null : String(text).trim())
    .input("payload", sql.NVarChar(sql.MAX), payload)
    .input("admin_user_id", sql.Int, gate.userId)
    .query(`INSERT INTO om_line_messages (line_user_id, direction, message_type, text, payload, admin_user_id, is_read)
            VALUES (@line_user_id, 'out', @message_type, @text, @payload, @admin_user_id, 1)`);

  return NextResponse.json({ ok: true, pushed: push.ok });
}
