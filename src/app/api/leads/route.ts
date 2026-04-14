import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { geocodeThaiPlace } from "@/lib/geocode";

async function maybeGeocodeProject(projectId: number) {
  const db = await getDb();
  const r = await db.request().input("id", sql.Int, projectId).query(
    `SELECT id, name, district, province FROM projects WHERE id = @id`
  );
  const proj = r.recordset[0];
  if (!proj) return;
  if (proj.district && proj.province) return; // already filled
  const result = await geocodeThaiPlace(proj.name);
  if (!result || (!result.district && !result.province)) return;
  await db.request()
    .input("id", sql.Int, projectId)
    .input("district", sql.NVarChar(100), result.district)
    .input("province", sql.NVarChar(100), result.province)
    .query(`UPDATE projects SET district = COALESCE(district, @district), province = COALESCE(province, @province) WHERE id = @id`);
}

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

    // Auto-create project if user typed a name not in the list
    let projectId = body.project_id || null;
    if (!projectId && body.project_name_input) {
      const existing = await db.request()
        .input("name", sql.NVarChar(200), body.project_name_input)
        .query(`SELECT id FROM projects WHERE name = @name`);
      if (existing.recordset.length > 0) {
        projectId = existing.recordset[0].id;
      } else {
        const created = await db.request()
          .input("name", sql.NVarChar(200), body.project_name_input)
          .query(`INSERT INTO projects (name) OUTPUT INSERTED.id VALUES (@name)`);
        projectId = created.recordset[0].id;
      }
    }

    const result = await db
      .request()
      .input("full_name", sql.NVarChar(200), body.full_name)
      .input("phone", sql.NVarChar(20), body.phone || null)
      .input("project_id", sql.Int, projectId)
      .input("installation_address", sql.NVarChar(50), body.installation_address || null)
      .input("customer_type", sql.NVarChar(50), body.customer_type || null)
      .input("interested_package_id", sql.Int, body.interested_package_id || null)
      .input("source", sql.NVarChar(30), body.source || "walk-in")
      .input("payment_type", sql.NVarChar(30), body.payment_type || null)
      .input("requirement", sql.NVarChar(sql.MAX), body.requirement || null)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .input("id_card_number", sql.NVarChar(20), body.id_card_number || null)
      .input("id_card_address", sql.NVarChar(500), body.id_card_address || null)
      .input("id_card_photo_url", sql.NVarChar(500), body.id_card_photo_url || null)
      .input("house_reg_photo_url", sql.NVarChar(500), body.house_reg_photo_url || null)
      .query(`
        INSERT INTO leads (full_name, phone, project_id, installation_address, customer_type, interested_package_id, source, payment_type, requirement, note, id_card_number, id_card_address, id_card_photo_url, house_reg_photo_url, status)
        OUTPUT INSERTED.*
        VALUES (@full_name, @phone, @project_id, @installation_address, @customer_type, @interested_package_id, @source, @payment_type, @requirement, @note, @id_card_number, @id_card_address, @id_card_photo_url, @house_reg_photo_url, 'registered')
      `);

    // Auto-log lead created (register/walk-in is the first contact)
    const leadId = result.recordset[0].id;
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("source", sql.NVarChar(30), body.source || "walk-in")
      .input("note", sql.NVarChar(sql.MAX), body.note || body.requirement || null)
      .query(`INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by) VALUES (@lead_id, 'lead_created', 'Lead created (' + @source + ')', @note, 1)`);

    // Backfill project district/province if missing (fire-and-forget, don't block response)
    if (body.project_id) {
      maybeGeocodeProject(body.project_id).catch(console.error);
    }

    return NextResponse.json(result.recordset[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/leads error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
