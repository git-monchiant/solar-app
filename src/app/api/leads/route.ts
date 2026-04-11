import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT l.*, p.name as project_name, pk.name as package_name, pk.price as package_price,
             u.full_name as assigned_name,
             b.booking_number, b.total_price as booking_price, b.status as booking_status,
             (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id AND note IS NOT NULL ORDER BY created_at DESC) as last_activity_note,
             (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN packages pk ON l.interested_package_id = pk.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      LEFT JOIN bookings b ON b.lead_id = l.id
      ORDER BY l.created_at DESC
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await getDb();

    const result = await db
      .request()
      .input("full_name", sql.NVarChar(200), body.full_name)
      .input("phone", sql.NVarChar(20), body.phone || null)
      .input("project_id", sql.Int, body.project_id || null)
      .input("house_number", sql.NVarChar(50), body.house_number || null)
      .input("customer_type", sql.NVarChar(50), body.customer_type || null)
      .input("interested_package_id", sql.Int, body.interested_package_id || null)
      .input("source", sql.NVarChar(30), body.source || "walk-in")
      .input("payment_type", sql.NVarChar(30), body.payment_type || null)
      .input("requirement", sql.NVarChar(sql.MAX), body.requirement || null)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .query(`
        INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, source, payment_type, requirement, note, status)
        OUTPUT INSERTED.*
        VALUES (@full_name, @phone, @project_id, @house_number, @customer_type, @interested_package_id, @source, @payment_type, @requirement, @note, 'registered')
      `);

    // Auto-log lead created (register/walk-in is the first contact)
    const leadId = result.recordset[0].id;
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("source", sql.NVarChar(30), body.source || "walk-in")
      .input("note", sql.NVarChar(sql.MAX), body.note || body.requirement || null)
      .query(`INSERT INTO lead_activities (lead_id, activity_type, title, note) VALUES (@lead_id, 'lead_created', 'Lead created (' + @source + ')', @note)`);

    return NextResponse.json(result.recordset[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/leads error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
