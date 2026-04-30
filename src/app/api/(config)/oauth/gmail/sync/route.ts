import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getGmailClient } from "@/lib/gmail";
import { extractEmailBody, parseRegistrationEmail } from "@/lib/gmail-parser";
import { getDb, sql } from "@/lib/db";

// POST /api/oauth/gmail/sync
// Pulls Sena Solar registration emails and inserts them as leads.
// Dedupe via leads.gmail_message_id; safe to call repeatedly.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;

  const gmail = await getGmailClient();
  if (!gmail) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || `from:sales@senasolarenergy.com subject:("มีผู้สนใจติดตั้งโซลาร์") newer_than:90d`;
  const maxResults = Math.min(100, parseInt(searchParams.get("max") || "100"));

  try {
    const db = await getDb();
    const list = await gmail.users.messages.list({ userId: "me", q, maxResults });
    const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

    let imported = 0, skipped = 0, errors = 0;
    const samples: Array<{ name: string; phone: string; email: string | null }> = [];

    for (const id of ids) {
      try {
        const exists = await db.request()
          .input("gmail_id", sql.NVarChar(64), id)
          .query(`SELECT TOP 1 id FROM leads WHERE gmail_message_id = @gmail_id`);
        if (exists.recordset.length) { skipped++; continue; }

        const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
        const headers = msg.data.payload?.headers ?? [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        const body = extractEmailBody(msg.data.payload) || msg.data.snippet || "";
        const parsed = parseRegistrationEmail(body);

        if (!parsed.full_name && !parsed.phone) { errors++; continue; }

        const note = `[Gmail registration]\nวันที่: ${date}\nsubject: ${subject}\n\n` +
          `ชื่อ: ${parsed.full_name}\nemail: ${parsed.email || "-"}\nโทร: ${parsed.phone}\n` +
          `จังหวัด: ${parsed.province || "-"}\nประเภทที่อยู่: ${parsed.residence || "-"}\n` +
          `ค่าไฟต่อเดือน: ${parsed.monthly_bill || "-"}\nหลังคา: ${parsed.roof_shape || "-"}`;

        await db.request()
          .input("full_name", sql.NVarChar(200), parsed.full_name.slice(0, 200) || "(no name)")
          .input("phone", sql.NVarChar(20), parsed.phone.slice(0, 20))
          .input("email", sql.NVarChar(200), parsed.email ? parsed.email.slice(0, 200) : null)
          .input("source", sql.NVarChar(50), "email")
          .input("note", sql.NVarChar(sql.MAX), note)
          .input("zone", sql.NVarChar(100), parsed.province ? parsed.province.slice(0, 100) : null)
          .input("residence", sql.NVarChar(30), parsed.residence ? parsed.residence.slice(0, 30) : null)
          .input("roof_shape", sql.NVarChar(20), parsed.roof_shape ? parsed.roof_shape.slice(0, 20) : null)
          .input("monthly_bill", sql.Decimal(12, 2), parsed.monthly_bill)
          .input("gmail_id", sql.NVarChar(64), id)
          .query(`
            INSERT INTO leads (
              full_name, phone, email, source, status, note,
              zone, pre_residence_type, pre_roof_shape, pre_monthly_bill,
              gmail_message_id, contact_date, created_at
            ) VALUES (
              @full_name, @phone, @email, @source, 'pre_survey', @note,
              @zone, @residence, @roof_shape, @monthly_bill,
              @gmail_id, GETDATE(), GETDATE()
            )
          `);
        imported++;
        if (samples.length < 5) samples.push({ name: parsed.full_name, phone: parsed.phone, email: parsed.email });
      } catch (e) {
        console.error(`sync error on ${id}:`, e);
        errors++;
      }
    }

    return NextResponse.json({ scanned: ids.length, imported, skipped, errors, samples });
  } catch (e) {
    console.error("oauth/gmail/sync error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
