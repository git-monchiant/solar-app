import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

// POST /api/leads/[id]/book
// Body: { package_id, total_price, note? }
// Replaces the legacy /api/bookings POST. Generates pre_doc_no (SM-YYNNN),
// writes lead.pre_* fields, and logs booking_created + status_change activities.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json();
    const packageId = parseInt(String(body.package_id || 0));
    const totalPrice = parseFloat(String(body.total_price || 0));
    if (!packageId || !(totalPrice > 0)) {
      return NextResponse.json({ error: "package_id and positive total_price required" }, { status: 400 });
    }

    const db = await getDb();

    // Generate SM-YYNNN doc number
    const year = new Date().getFullYear().toString().slice(-2);
    const maxRes = await db.request().query(`
      SELECT MAX(CAST(RIGHT(pre_doc_no, 3) AS INT)) as max_num
      FROM leads WHERE pre_doc_no LIKE 'SM-${year}%'
    `);
    const nextNum = ((maxRes.recordset[0].max_num || 0) + 1).toString().padStart(3, "0");
    const docNo = `SM-${year}${nextNum}`;

    // Read current status for the activity log
    const cur = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT status FROM leads WHERE id = @id`);
    if (cur.recordset.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const oldStatus = cur.recordset[0].status as string;

    await db.request()
      .input("id", sql.Int, leadId)
      .input("doc_no", sql.NVarChar(20), docNo)
      .input("package_id", sql.Int, packageId)
      .input("total_price", sql.Decimal(12, 2), totalPrice)
      .input("note", sql.NVarChar(sql.MAX), body.note ?? null)
      .query(`
        UPDATE leads
        SET pre_doc_no = @doc_no,
            pre_package_id = @package_id,
            pre_total_price = @total_price,
            pre_note = @note,
            pre_booked_at = GETDATE(),
            status = 'booked',
            updated_at = GETDATE()
        WHERE id = @id
      `);

    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("title", sql.NVarChar(200), `Booking created: ${docNo}`)
      .input("note", sql.NVarChar(sql.MAX), body.note ?? null)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by)
        VALUES (@lead_id, 'booking_created', @title, @note, 1)
      `);
    if (oldStatus !== "booked") {
      await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("old", sql.NVarChar(30), oldStatus)
        .input("new_", sql.NVarChar(30), "booked")
        .query(`
          INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by)
          VALUES (@lead_id, 'status_change', 'Status change', @old, @new_, 1)
        `);
    }

    return NextResponse.json({ doc_no: docNo, lead_id: leadId }, { status: 201 });
  } catch (e) {
    console.error("POST /api/leads/[id]/book error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
