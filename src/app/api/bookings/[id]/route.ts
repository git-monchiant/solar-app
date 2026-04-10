import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, parseInt(id));

    if (body.slip_url !== undefined) {
      sets.push("slip_url = @slip_url");
      request.input("slip_url", sql.NVarChar(500), body.slip_url);
    }
    if (body.payment_confirmed !== undefined) {
      sets.push("payment_confirmed = @payment_confirmed");
      request.input("payment_confirmed", sql.Bit, body.payment_confirmed);
      if (body.payment_confirmed) {
        sets.push("confirmed_at = GETDATE()");
      }
    }
    if (body.status !== undefined) {
      sets.push("status = @status");
      request.input("status", sql.NVarChar(30), body.status);
    }
    if (body.confirmed !== undefined) {
      sets.push("confirmed = @confirmed");
      request.input("confirmed", sql.Bit, body.confirmed);
    }

    sets.push("updated_at = GETDATE()");

    const result = await request.query(`UPDATE bookings SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id`);

    // If payment confirmed, update lead status + log activity
    if (body.payment_confirmed && result.recordset.length > 0) {
      const booking = result.recordset[0];
      await db.request()
        .input("lead_id", sql.Int, booking.lead_id)
        .query(`UPDATE leads SET status = 'purchased', updated_at = GETDATE() WHERE id = @lead_id`);
      await db.request()
        .input("lead_id", sql.Int, booking.lead_id)
        .input("title", sql.NVarChar(200), `Payment confirmed: ${booking.booking_number}`)
        .input("slip_url", sql.NVarChar(sql.MAX), body.slip_url || null)
        .query(`INSERT INTO lead_activities (lead_id, activity_type, title, note) VALUES (@lead_id, 'status_change', @title, @slip_url)`);
    }

    return NextResponse.json(result.recordset[0]);
  } catch (error) {
    console.error("PATCH booking error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
