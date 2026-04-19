import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

// All booking data now lives on leads.pre_*. This endpoint is a thin wrapper so
// existing callers keep working while the underlying storage is leads.
export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT l.id, l.id as lead_id, l.full_name as lead_name, l.phone as lead_phone, l.installation_address,
             l.pre_doc_no as booking_number,
             l.pre_total_price as total_price,
             l.pre_package_id as package_id,
             l.pre_note as note,
             l.pre_booked_at as created_at,
             l.payment_confirmed,
             l.status,
             pk.name as package_name, pk.price as package_price,
             pr.name as project_name,
             u.full_name as created_by_name
      FROM leads l
      LEFT JOIN packages pk ON l.pre_package_id = pk.id
      LEFT JOIN projects pr ON l.project_id = pr.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      WHERE l.pre_doc_no IS NOT NULL
      ORDER BY l.pre_booked_at DESC
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/bookings error:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await getDb();

    // Generate booking number: SM-YYNNN from existing leads.pre_doc_no
    const year = new Date().getFullYear().toString().slice(-2);
    const maxResult = await db.request().query(`
      SELECT MAX(CAST(RIGHT(pre_doc_no, 3) AS INT)) as max_num FROM leads WHERE pre_doc_no LIKE 'SM-${year}%'
    `);
    const nextNum = ((maxResult.recordset[0].max_num || 0) + 1).toString().padStart(3, "0");
    const bookingNumber = `SM-${year}${nextNum}`;

    await db.request()
      .input("lead_id", sql.Int, body.lead_id)
      .input("pre_doc_no", sql.NVarChar(20), bookingNumber)
      .input("pre_package_id", sql.Int, body.package_id)
      .input("pre_total_price", sql.Decimal(12, 2), body.total_price)
      .input("pre_note", sql.NVarChar(sql.MAX), body.note || null)
      .query(`
        UPDATE leads
        SET pre_doc_no = @pre_doc_no,
            pre_package_id = @pre_package_id,
            pre_total_price = @pre_total_price,
            pre_note = @pre_note,
            pre_booked_at = GETDATE(),
            status = 'booked',
            updated_at = GETDATE()
        WHERE id = @lead_id
      `);

    await db.request()
      .input("lead_id", sql.Int, body.lead_id)
      .input("title", sql.NVarChar(200), `Booking created: ${bookingNumber}`)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by)
        VALUES (@lead_id, 'booking_created', @title, @note, 1)
      `);
    await db.request()
      .input("lead_id", sql.Int, body.lead_id)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by)
        VALUES (@lead_id, 'status_change', 'Status: รอติดตาม → Booked', 'register', 'booked', 1)
      `);

    return NextResponse.json({
      id: body.lead_id,                // back-compat: callers treat this as booking id, now equals lead id
      lead_id: body.lead_id,
      booking_number: bookingNumber,
      total_price: body.total_price,
      package_id: body.package_id,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/bookings error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
