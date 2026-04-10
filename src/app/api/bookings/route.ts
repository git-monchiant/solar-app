import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT b.*, l.full_name as lead_name, l.phone as lead_phone, l.house_number,
             p.name as package_name, p.price as package_price,
             pr.name as project_name,
             u.full_name as created_by_name
      FROM bookings b
      JOIN leads l ON b.lead_id = l.id
      JOIN packages p ON b.package_id = p.id
      LEFT JOIN projects pr ON l.project_id = pr.id
      LEFT JOIN users u ON b.created_by = u.id
      ORDER BY b.created_at DESC
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/bookings error:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await getDb();

    // Generate booking number: SM-YYNNN
    const year = new Date().getFullYear().toString().slice(-2);
    const countResult = await db.request().query(`
      SELECT COUNT(*) as cnt FROM bookings WHERE booking_number LIKE 'SM-${year}%'
    `);
    const nextNum = (countResult.recordset[0].cnt + 1).toString().padStart(3, "0");
    const bookingNumber = `SM-${year}${nextNum}`;

    const result = await db
      .request()
      .input("booking_number", sql.NVarChar(20), bookingNumber)
      .input("lead_id", sql.Int, body.lead_id)
      .input("package_id", sql.Int, body.package_id)
      .input("total_price", sql.Decimal(12, 2), body.total_price)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .query(`
        INSERT INTO bookings (booking_number, lead_id, package_id, total_price, note)
        OUTPUT INSERTED.*
        VALUES (@booking_number, @lead_id, @package_id, @total_price, @note)
      `);

    // Update lead status
    await db
      .request()
      .input("lead_id", sql.Int, body.lead_id)
      .query(`UPDATE leads SET status = 'booked', updated_at = GETDATE() WHERE id = @lead_id`);

    // Auto-log booking created as activity
    await db
      .request()
      .input("lead_id", sql.Int, body.lead_id)
      .input("title", sql.NVarChar(200), `Booking created: ${bookingNumber}`)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, note)
        VALUES (@lead_id, 'booking_created', @title, @note)
      `);

    return NextResponse.json(result.recordset[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/bookings error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
