import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logLeadActivity } from "@/lib/lead-activity-log";

// SMSMKT (Clicknext) text-SMS endpoint. Credentials live in .env.local.
const API_URL = process.env.SMSMKT_API_URL || "https://portal-otp.smsmkt.com/api";
const API_KEY = process.env.SMSMKT_API_KEY || "";
const SECRET_KEY = process.env.SMSMKT_SECRET_KEY || "";
const SENDER = process.env.SMSMKT_SENDER || "";
const PROJECT_ID = process.env.SMSMKT_PROJECT_ID || "";

// smsmkt wants the local Thai mobile format (08xxxxxxxx). Strip everything that
// isn't a digit, then fold a +66/66 country prefix back to a leading 0.
function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) return "0" + digits.slice(2);
  return digits;
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { lead_id, message, outcome } = await request.json();
    if (!lead_id || !message?.trim()) {
      return NextResponse.json({ error: "Missing lead_id or message" }, { status: 400 });
    }
    if (!API_KEY || !SECRET_KEY || !SENDER) {
      return NextResponse.json({ error: "SMS service not configured" }, { status: 500 });
    }

    const db = await getDb();
    // App-level kill switch. Settings → ช่องทางติดต่อ → เปิดใช้งาน SMS.
    const cfg = await db.request().query(`SELECT value FROM app_settings WHERE [key] = 'sms_enabled'`);
    if (cfg.recordset[0]?.value !== "1") {
      return NextResponse.json({ error: "SMS is disabled in app settings" }, { status: 403 });
    }
    const lead = await db.request()
      .input("id", sql.Int, lead_id)
      .query(`SELECT phone FROM leads WHERE id = @id`);

    const phone = normalizePhone(lead.recordset[0]?.phone || "");
    if (!phone) {
      return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
    }

    const res = await fetch(`${API_URL}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: API_KEY,
        secret_key: SECRET_KEY,
      },
      body: JSON.stringify({
        message: message.trim(),
        phone,
        sender: SENDER,
        ...(PROJECT_ID ? { project_id: PROJECT_ID } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    // smsmkt returns HTTP 200 with code "000" on success; anything else failed.
    if (!res.ok || data?.code !== "000") {
      console.error("SMS send error:", data);
      return NextResponse.json(
        { error: "SMS send failed", detail: data?.detail || data },
        { status: 502 },
      );
    }

    // When a "ติดต่อไม่ได้ - …" outcome rides along, use it as the title so the
    // timeline shows the reason pill ("ส่ง SMS" chip + the outcome badge).
    // Otherwise the title falls back to a plain SMS-sent line.
    const cleanOutcome = typeof outcome === "string" ? outcome.trim() : "";
    await logLeadActivity(db, {
      leadId: lead_id,
      activityType: "sms_sent",
      title: cleanOutcome || `ส่ง SMS ให้ลูกค้า (${phone})`,
      note: message.trim(),
      userId: gate.userId,
    });

    return NextResponse.json({ ok: true, transaction_id: data?.result?.transaction_id ?? null });
  } catch (error) {
    console.error("POST /api/sms/send error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed", detail: message }, { status: 500 });
  }
}
