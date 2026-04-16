import { NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT b.id, b.booking_number, b.total_price, b.status as booking_status, b.payment_confirmed, b.created_at as booking_date,
             l.id as lead_id, l.full_name, l.phone, l.payment_type, l.zone,
             p.name as project_name, p.district, p.province,
             pk.name as package_name, pk.kwp,
             u.full_name as created_by_name
      FROM bookings b
      JOIN leads l ON b.lead_id = l.id
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN packages pk ON b.package_id = pk.id
      LEFT JOIN users u ON b.created_by = u.id
      ORDER BY b.created_at DESC
    `);

    const total = result.recordset.reduce((sum, r) => sum + (r.total_price || 0), 0);
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
