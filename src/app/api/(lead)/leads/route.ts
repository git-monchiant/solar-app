import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { geocodeThaiPlace } from "@/lib/utils/geocode";
import { requireAuth } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, pk.price as package_price,
             u.full_name as assigned_name,
             (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id AND note IS NOT NULL ORDER BY created_at DESC) as last_activity_note,
             (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN packages pk ON l.interested_package_id = pk.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      ORDER BY l.created_at DESC
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
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
      .input("installation_address", sql.NVarChar(500), body.installation_address || null)
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
      .input("pre_appliances", sql.NVarChar(200), body.pre_appliances || null)
      .input("line_id", sql.NVarChar(100), body.line_id || null)
      .input("house_number", sql.NVarChar(50), body.house_number || null)
      // Pre-survey interest fields surfaced on the new-lead form
      .input("pre_primary_reason", sql.NVarChar(50), body.pre_primary_reason || null)
      .input("pre_peak_usage", sql.NVarChar(20), body.pre_peak_usage || null)
      .input("pre_electrical_phase", sql.NVarChar(20), body.pre_electrical_phase || null)
      .input("pre_wants_battery", sql.NVarChar(20), body.pre_wants_battery || null)
      .input("pre_roof_shape", sql.NVarChar(20), body.pre_roof_shape || null)
      .input("pre_residence_type", sql.NVarChar(30), body.pre_residence_type || null)
      .input("pre_monthly_bill", sql.Int, body.monthly_bill ? parseInt(String(body.monthly_bill)) : null)
      // Sheet-sync fields
      .input("customer_code", sql.NVarChar(20), body.customer_code || null)
      .input("seeker_type", sql.NVarChar(50), body.seeker_type || null)
      .input("seeker_name", sql.NVarChar(200), body.seeker_name || null)
      .input("customer_interest", sql.NVarChar(500), body.customer_interest || null)
      .input("home_loan_status", sql.NVarChar(50), body.home_loan_status || null)
      .input("project_note", sql.NVarChar(500), body.project_note || null)
      // Electrical / utility
      .input("meter_number", sql.NVarChar(30), body.meter_number || null)
      .query(`
        INSERT INTO leads (
          full_name, phone, project_id, installation_address, customer_type, interested_package_id,
          source, payment_type, requirement, note,
          id_card_number, id_card_address, id_card_photo_url, house_reg_photo_url,
          pre_appliances, line_id, house_number,
          pre_primary_reason, pre_peak_usage, pre_electrical_phase, pre_wants_battery,
          pre_roof_shape, pre_residence_type, pre_monthly_bill,
          customer_code, seeker_type, seeker_name, customer_interest, home_loan_status, project_note,
          meter_number, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @full_name, @phone, @project_id, @installation_address, @customer_type, @interested_package_id,
          @source, @payment_type, @requirement, @note,
          @id_card_number, @id_card_address, @id_card_photo_url, @house_reg_photo_url,
          @pre_appliances, @line_id, @house_number,
          @pre_primary_reason, @pre_peak_usage, @pre_electrical_phase, @pre_wants_battery,
          @pre_roof_shape, @pre_residence_type, @pre_monthly_bill,
          @customer_code, @seeker_type, @seeker_name, @customer_interest, @home_loan_status, @project_note,
          @meter_number, 'pre_survey'
        )
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
