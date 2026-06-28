import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logLeadActivity } from "@/lib/lead-activity-log";

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

type LineMessage = { type?: string; text?: string; altText?: string };

function summarizeMessages(messages: LineMessage[]): string {
  const parts = messages.map((m) => {
    if (m?.type === "text" && m.text) return m.text;
    if (m?.altText) return m.altText;
    if (m?.type) return `[${m.type}]`;
    return "[message]";
  });
  return parts.join(" · ").slice(0, 180);
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { lead_id, messages } = await request.json();
    if (!lead_id || !messages?.length) {
      return NextResponse.json({ error: "Missing lead_id or messages" }, { status: 400 });
    }

    // Hard kill switch via env — wins over the DB setting. Set LINE_ENABLED=false
    // on dev so testers literally can't push messages even if someone flips the
    // DB flag. Anything other than the exact string "false" leaves the gate open.
    if ((process.env.LINE_ENABLED || "").toLowerCase() === "false") {
      return NextResponse.json({ error: "LINE is hard-disabled via env (LINE_ENABLED=false)" }, { status: 403 });
    }
    const db = await getDb();
    // Soft app-level kill switch. Default ON for prod safety; admin toggles
    // via /settings → ช่องทางติดต่อ → "เปิดใช้งาน LINE".
    const cfg = await db.request().query(`SELECT value FROM app_settings WHERE [key] = 'line_enabled'`);
    if (cfg.recordset[0]?.value === "0") {
      return NextResponse.json({ error: "LINE is disabled in app settings" }, { status: 403 });
    }
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

    await logLeadActivity(db, {
      leadId: lead_id,
      activityType: "line_sent",
      title: `ส่ง LINE ให้ลูกค้า (${messages.length} ข้อความ)`,
      note: summarizeMessages(messages),
      userId: gate.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/line/send error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed", detail: message }, { status: 500 });
  }
}
