import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

// After Phase 2 of the booking→lead.pre_* migration, `id` in this route is the lead id.
// PATCH body still uses the legacy booking field names; we map them to lead columns.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    const leadId = parseInt(id);

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, leadId);

    if (body.pre_slip_url !== undefined) {
      sets.push("pre_slip_url = @pre_slip_url");
      request.input("pre_slip_url", sql.NVarChar(500), body.pre_slip_url);
    }
    if (body.payment_confirmed !== undefined) {
      sets.push("payment_confirmed = @payment_confirmed");
      request.input("payment_confirmed", sql.Bit, body.payment_confirmed ? 1 : 0);
    }
    // Legacy `status` + `confirmed` fields on bookings are no-ops — lead.status is the source
    // of truth and is set explicitly by the caller via /api/leads/<id>.

    if (sets.length === 0) {
      return NextResponse.json({ ok: true });
    }

    sets.push("updated_at = GETDATE()");
    await request.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = @id`);

    if (body.payment_confirmed) {
      const leadRow = await db.request().input("id", sql.Int, leadId)
        .query(`SELECT pre_doc_no FROM leads WHERE id = @id`);
      const docNo = leadRow.recordset[0]?.pre_doc_no;
      await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("title", sql.NVarChar(200), `ลูกค้าโอนเงินมัดจำ ${docNo || ""}`)
        .input("slip_url", sql.NVarChar(sql.MAX), body.pre_slip_url || null)
        .query(`INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by) VALUES (@lead_id, 'payment_confirmed', @title, @slip_url, 1)`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH booking error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
