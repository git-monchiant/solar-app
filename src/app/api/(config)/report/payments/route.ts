import { NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT l.id, l.pre_doc_no as booking_number, l.pre_total_price as total_price,
             l.status as booking_status, l.payment_confirmed, l.pre_booked_at as booking_date,
             l.id as lead_id, l.full_name, l.phone, l.payment_type, l.zone,
             p.name as project_name, p.district, p.province,
             pk.name as package_name, pk.kwp,
             u.full_name as created_by_name
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN packages pk ON l.pre_package_id = pk.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      WHERE l.pre_doc_no IS NOT NULL
      ORDER BY l.pre_booked_at DESC
    `);

    const total = result.recordset.reduce((sum, r) => sum + Number(r.total_price || 0), 0);
    const confirmed = result.recordset.filter(r => r.payment_confirmed).length;

    return NextResponse.json({
      payments: fixDates(result.recordset),
      summary: {
        total_bookings: result.recordset.length,
        total_value: total,
        confirmed,
        pending: result.recordset.length - confirmed,
      },
    });
  } catch (error) {
    console.error("GET /api/report/payments error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
