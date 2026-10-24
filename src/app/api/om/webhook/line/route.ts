import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { getOmDb, getOmLineProfile, OM_LINE } from "@/lib/om/line";
import { storeMedia } from "@/lib/om/media";

// Webhook ของ LINE channel ทดสอบโมดูล O&M — คนละเส้นกับ /api/webhook/line ของระบบขาย
// เขียนลงตาราง om_line_* เท่านั้น

function verifySignature(body: string, signature: string): boolean {
  if (!OM_LINE.secret) return false;
  const hash = crypto.createHmac("SHA256", OM_LINE.secret).update(body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function upsertLineUser(userId: string, patch: { displayName?: string; pictureUrl?: string; isFollow?: boolean }) {
  const db = await getOmDb();
  await db.request()
    .input("line_user_id", sql.NVarChar(64), userId)
    .input("display_name", sql.NVarChar(200), patch.displayName ?? null)
    .input("picture_url", sql.NVarChar(500), patch.pictureUrl ?? null)
    .input("is_follow", sql.Bit, patch.isFollow === false ? 0 : 1)
    .input("mode", sql.NVarChar(10), OM_LINE.mode)
    .query(`UPDATE om_line_users SET
        display_name = COALESCE(@display_name, display_name),
        picture_url  = COALESCE(@picture_url, picture_url),
        is_follow    = @is_follow,
        last_message_at = SYSDATETIMEOFFSET()
      WHERE line_user_id = @line_user_id;
      IF @@ROWCOUNT = 0
        INSERT INTO om_line_users (line_user_id, display_name, picture_url, is_follow, channel_mode, last_message_at)
        VALUES (@line_user_id, @display_name, @picture_url, @is_follow, @mode, SYSDATETIMEOFFSET());`);
}

async function storeMessage(userId: string, messageType: string, text: string | null, payload: unknown, lineMessageId: string | null) {
  const db = await getOmDb();
  await db.request()
    .input("line_user_id", sql.NVarChar(64), userId)
    .input("message_type", sql.NVarChar(30), messageType)
    .input("text", sql.NVarChar(sql.MAX), text)
    .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .input("line_message_id", sql.NVarChar(100), lineMessageId)
    .query(`INSERT INTO om_line_messages (line_user_id, direction, message_type, text, payload, line_message_id)
            VALUES (@line_user_id, 'in', @message_type, @text, @payload, @line_message_id)`);
}

// รูป/วิดีโอที่ลูกค้าส่งมา: LINE ให้ดึงเนื้อไฟล์จาก api-data ภายใน ~14 วัน — เก็บลง om_line_media
// พังก็ปล่อยผ่าน (คืน null) — ข้อความต้องบันทึกได้เสมอแม้ดึงไฟล์ไม่สำเร็จ
async function fetchIncomingMedia(messageId: string, kind: "image" | "video"): Promise<string | null> {
  if (!OM_LINE.token) return null;
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${OM_LINE.token}` },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || (kind === "image" ? "image/jpeg" : "video/mp4");
    const media = await storeMedia({ kind, mime, buf, source: "line" });
    return media.token;
  } catch (e) {
    console.error("OM LINE fetch media failed:", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-line-signature") || "";
    if (!verifySignature(body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const events = (JSON.parse(body).events || []) as Array<{
      type: string;
      source?: { userId?: string };
      message?: { id?: string; type: string; text?: string };
    }>;

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      if (event.type === "follow") {
        const profile = await getOmLineProfile(userId);
        await upsertLineUser(userId, { displayName: profile?.displayName, pictureUrl: profile?.pictureUrl, isFollow: true });
        await storeMessage(userId, "follow", null, event, null);
      } else if (event.type === "unfollow") {
        await upsertLineUser(userId, { isFollow: false });
      } else if (event.type === "message" && event.message) {
        const profile = await getOmLineProfile(userId);
        await upsertLineUser(userId, { displayName: profile?.displayName, pictureUrl: profile?.pictureUrl });

        const msgType = event.message.type;
        let payload: unknown = event;
        if ((msgType === "image" || msgType === "video") && event.message.id) {
          const mediaToken = await fetchIncomingMedia(event.message.id, msgType);
          if (mediaToken) payload = { media_token: mediaToken, event };
        }
        await storeMessage(
          userId,
          msgType,
          msgType === "text" ? event.message.text ?? null : null,
          payload,
          event.message.id ?? null,
        );
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("OM LINE webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", channel: "om", mode: OM_LINE.mode });
}
