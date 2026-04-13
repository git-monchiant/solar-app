import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDb, sql } from "@/lib/db";

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

function verifySignature(body: string, signature: string): boolean {
  const hash = crypto.createHmac("SHA256", CHANNEL_SECRET).update(body).digest("base64");
  return hash === signature;
}

async function getLineProfile(userId: string) {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ displayName: string; userId: string; pictureUrl?: string }>;
}

async function replyMessage(replyToken: string, messages: { type: string; text: string }[]) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function upsertLineUser(userId: string, displayName?: string, pictureUrl?: string) {
  const db = await getDb();
  const existing = await db.request()
    .input("line_user_id", sql.NVarChar(100), userId)
    .query(`SELECT id FROM line_users WHERE line_user_id = @line_user_id`);

  if (existing.recordset.length > 0) {
    await db.request()
      .input("line_user_id", sql.NVarChar(100), userId)
      .input("display_name", sql.NVarChar(200), displayName || null)
      .input("picture_url", sql.NVarChar(500), pictureUrl || null)
      .input("last_message_at", sql.DateTime2, new Date())
      .query(`UPDATE line_users SET display_name = COALESCE(@display_name, display_name), picture_url = COALESCE(@picture_url, picture_url), last_message_at = @last_message_at WHERE line_user_id = @line_user_id`);
    return existing.recordset[0].id;
  } else {
    const result = await db.request()
      .input("line_user_id", sql.NVarChar(100), userId)
      .input("display_name", sql.NVarChar(200), displayName || null)
      .input("picture_url", sql.NVarChar(500), pictureUrl || null)
      .query(`INSERT INTO line_users (line_user_id, display_name, picture_url, last_message_at) OUTPUT INSERTED.id VALUES (@line_user_id, @display_name, @picture_url, GETDATE())`);
    return result.recordset[0].id;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-line-signature") || "";

    if (!verifySignature(body, signature)) {
      console.error("LINE webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(body);
    const events = data.events || [];

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      if (event.type === "follow") {
        const profile = await getLineProfile(userId);
        await upsertLineUser(userId, profile?.displayName, profile?.pictureUrl);
      }

      if (event.type === "message" && event.message.type === "text") {
        const profile = await getLineProfile(userId);
        await upsertLineUser(userId, profile?.displayName, profile?.pictureUrl);
      }

      // Image message — log only
      if (event.type === "message" && event.message.type === "image") {
        console.log("LINE IMAGE received from:", userId);
        await upsertLineUser(userId);
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("LINE webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
