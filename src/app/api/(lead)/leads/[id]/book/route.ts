import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mintDocNo } from "@/lib/doc-number";
import { syncOperationalSlas } from "@/lib/sla-service";

// POST /api/leads/[id]/book
// Body: { package_id, total_price, note? }
// Generates pre_doc_no (SM-YYNNN) and writes lead.pre_* fields. Status is
// left unchanged here — the caller advances it when the full flow is complete.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json();
    const packageId = parseInt(String(body.package_id || 0));
    const totalPrice = parseFloat(String(body.total_price || 0));
    // total_price = 0 is allowed for ฟรีค่าสำรวจ; reject only negatives so a
    // typo can't quietly negate the booking amount.
    if (!packageId || totalPrice < 0) {
      return NextResponse.json({ error: "package_id and non-negative total_price required" }, { status: 400 });
    }

    const db = await getDb();

    // Generate the booking doc-no via shared helper (config-aware,
    // idempotent — see lib/doc-number.ts).
    const docNo = await mintDocNo(db, leadId, "booking");

    const bookingUpdate = await db.request()
      .input("id", sql.Int, leadId)
      .input("package_id", sql.Int, packageId)
      .input("total_price", sql.Decimal(12, 2), totalPrice)
      .input("note", sql.NVarChar(sql.MAX), body.note ?? null)
      .query(`
        UPDATE leads
        SET pre_package_id = @package_id,
            pre_total_price = @total_price,
            pre_note = @note,
            pre_booked_at = COALESCE(pre_booked_at, GETDATE()),
            updated_at = GETDATE()
        OUTPUT DELETED.pre_booked_at AS previous_booked_at
        WHERE id = @id
      `);

    if (!bookingUpdate.recordset[0]?.previous_booked_at) {
      await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("title", sql.NVarChar(200), `Pre-survey doc created: ${docNo}`)
        .input("note", sql.NVarChar(sql.MAX), body.note ?? null)
        .input("created_by", sql.Int, gate.userId)
        .query(`
          INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by)
          VALUES (@lead_id, 'presurvey_doc_created', @title, @note, @created_by)
        `);
    }

    await syncOperationalSlas(db, leadId, gate.userId);

    return NextResponse.json({ doc_no: docNo, lead_id: leadId }, { status: 201 });
  } catch (e) {
    console.error("POST /api/leads/[id]/book error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
