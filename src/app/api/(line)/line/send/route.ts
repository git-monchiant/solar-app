import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { lead_id, messages } = await request.json();
    if (!lead_id || !messages?.length) {
      return NextResponse.json({ error: "Missing lead_id or messages" }, { status: 400 });
    }

    const db = await getDb();
    const lead = await db.request()
      .input("id", sql.Int, lead_id)
      .query(`SELECT line_id FROM leads WHERE id = @id`);

    const lineId = lead.recordset[0]?.line_id;
    if (!lineId) {
      return NextResponse.json({ error: "Lead not linked to LINE" }, { status: 400 });
    }

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to: lineId, messages }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("LINE send error:", err);
      return NextResponse.json({ error: "LINE send failed", detail: err }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/line/send error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed", detail: message }, { status: 500 });
  }
}
