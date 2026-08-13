import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { geocodeThaiPlace } from "@/lib/utils/geocode";
import { requireAuth } from "@/lib/auth";
import { refreshJourneySafe, flipJourneyDatesIfDue } from "@/lib/journey";

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
    // Explicit column list — `leads` has 180+ columns but the card UI uses
    // ~30. Picking only what LeadCard/pipeline render keeps the response
    // ~3-4× smaller (1MB → ~250KB at 150 leads).
    await flipJourneyDatesIfDue(db);
    const result = await db.request().query(`
      SELECT l.id, l.full_name, l.phone, l.email, l.installation_address, l.house_number,
             l.customer_type, l.customer_grade, l.customer_group, l.status, l.journey_step, l.journey_sub, l.source, l.tag, l.note, l.contact_date, l.created_at,
             l.next_follow_up, l.revisit_date, l.lost_reason,
             l.assigned_user_id, l.zone, l.line_id,
             l.survey_date, l.survey_time_slot, l.install_date, l.install_date_end, l.install_actual_date, l.install_completed_at, l.install_extra_cost,
             l.pre_doc_no, l.pre_total_price, l.payment_confirmed, l.quotation_amount, l.order_total,
             COALESCE(NULLIF(l.project_alias, N''), NULLIF(l.project_name, N''), p.name) as project_name,
             l.project_alias, p.district, p.province,
             pk.name as package_name, pk.price as package_price,
             u.full_name as assigned_name, u.username as assigned_username,
             (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id AND note IS NOT NULL ORDER BY created_at DESC) as last_activity_note,
             (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id AND activity_type IN ('call','visit','line','other','follow_up','loan_followup') ORDER BY created_at DESC) as last_activity_date,
             (SELECT TOP 1 title FROM lead_activities WHERE lead_id = l.id AND activity_type IN ('call','visit','line','other','follow_up','loan_followup') ORDER BY created_at DESC) as last_activity_title,
             (SELECT TOP 1 activity_type FROM lead_activities WHERE lead_id = l.id AND activity_type IN ('call','visit','line','other','follow_up','loan_followup') ORDER BY created_at DESC) as last_activity_type,
             (SELECT COUNT(*) FROM payments WHERE lead_id = l.id AND slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL) as order_paid_count,
             (SELECT COUNT(*) FROM payments WHERE lead_id = l.id AND slip_field LIKE 'order_installment_%' AND (confirmed_at IS NOT NULL OR cheque_received_at IS NOT NULL)) as order_ready_count,
             (SELECT COUNT(*) FROM payments WHERE lead_id = l.id AND slip_field LIKE 'order_installment_%') as order_total_count,
             -- นับเฉพาะงวด "ก่อนติดตั้ง" — งวดที่ติ๊ก "ชำระหลังติดตั้ง" เก็บเงินที่ Step 05
             -- จึงต้องไม่บล็อกไม่ให้งานขึ้นกระดานรอติดตั้ง/กำลังติดตั้ง
             (SELECT COUNT(*) FROM payments p2 WHERE p2.lead_id = l.id AND p2.slip_field LIKE 'order_installment_%'
                AND NOT (TRY_CAST(REPLACE(p2.slip_field, 'order_installment_', '') AS INT) IN (
                 SELECT TRY_CAST(j.[key] AS INT)
                 FROM OPENJSON(CASE WHEN ISJSON(l.order_installments) = 1 THEN l.order_installments ELSE '[]' END) j
                 WHERE JSON_VALUE(j.value, '$.when') = 'after'))) as order_before_total_count,
             (SELECT COUNT(*) FROM payments p2 WHERE p2.lead_id = l.id AND p2.slip_field LIKE 'order_installment_%'
                AND p2.confirmed_at IS NOT NULL AND NOT (TRY_CAST(REPLACE(p2.slip_field, 'order_installment_', '') AS INT) IN (
                 SELECT TRY_CAST(j.[key] AS INT)
                 FROM OPENJSON(CASE WHEN ISJSON(l.order_installments) = 1 THEN l.order_installments ELSE '[]' END) j
                 WHERE JSON_VALUE(j.value, '$.when') = 'after'))) as order_before_paid_count,
             (SELECT COUNT(*) FROM payments p2 WHERE p2.lead_id = l.id AND p2.slip_field LIKE 'order_installment_%'
                AND (p2.confirmed_at IS NOT NULL OR p2.cheque_received_at IS NOT NULL) AND NOT (TRY_CAST(REPLACE(p2.slip_field, 'order_installment_', '') AS INT) IN (
                 SELECT TRY_CAST(j.[key] AS INT)
                 FROM OPENJSON(CASE WHEN ISJSON(l.order_installments) = 1 THEN l.order_installments ELSE '[]' END) j
                 WHERE JSON_VALUE(j.value, '$.when') = 'after'))) as order_before_ready_count,
             -- 1 = accountant has rejected at least one slip and the uploader
             -- has not re-submitted yet (notes JSON is non-empty).
             CASE
               WHEN l.payment_reject_notes IS NULL THEN 0
               WHEN LTRIM(RTRIM(l.payment_reject_notes)) IN ('', '{}', '[]') THEN 0
               ELSE 1
             END as has_payment_reject
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

    // No phone + house_number dedupe block here on purpose: an existing
    // customer buying a second time (more panels, battery, another round) has
    // the exact same phone + house_number as their first lead, so blocking on
    // that pair made repeat purchases impossible to enter. Each purchase is its
    // own lead. Import paths (Gmail sync etc.) still dedupe on their own keys.

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
      .input("email", sql.NVarChar(200), body.email || null)
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
      .input("line_id", sql.NVarChar(100), body.line_id || null)
      .input("house_number", sql.NVarChar(50), body.house_number || null)
      // pre_primary_reason stays on leads (not in PreSurveyForm scope).
      .input("pre_primary_reason", sql.NVarChar(50), body.pre_primary_reason || null)
      // The 9 PreSurveyForm fields below (pre_appliances, pre_peak_usage,
      // pre_electrical_phase, pre_wants_battery, pre_roof_shape,
      // pre_residence_type, pre_monthly_bill, pre_ac_units, pre_bill_photo_url)
      // moved to lead_data table — INSERT after we have the new lead id.
      // Sheet-sync fields
      .input("customer_code", sql.NVarChar(20), body.customer_code || null)
      .input("seeker_type", sql.NVarChar(50), body.seeker_type || null)
      .input("seeker_name", sql.NVarChar(200), body.seeker_name || null)
      .input("customer_interest", sql.NVarChar(500), body.customer_interest || null)
      .input("home_loan_status", sql.NVarChar(50), body.home_loan_status || null)
      .input("project_note", sql.NVarChar(500), body.project_note || null)
      // Free-text fallbacks — mirror prospects so seeker→lead sync lands in
      // the matching columns. project_name takes effect only when project_id
      // is NULL; project_alias is always free-form.
      .input("project_name", sql.NVarChar(200), body.project_name || null)
      .input("project_alias", sql.NVarChar(200), body.project_alias || null)
      // Electrical / utility
      .input("meter_number", sql.NVarChar(30), body.meter_number || null)
      // Touchpoint tag — JSON array of additional channels touched along the
      // journey (mirrors prospects.tag). `source` stays as immutable
      // first-touch. Accepts an array (will be JSON-stringified) OR a
      // pre-stringified JSON value (already comes that way from seeker→lead
      // promotion).
      .input("tag", sql.NVarChar(500),
        Array.isArray(body.tag) && body.tag.length > 0
          ? JSON.stringify(body.tag)
          : (typeof body.tag === "string" && body.tag ? body.tag : null))
      .query(`
        INSERT INTO leads (
          full_name, phone, email, project_id, installation_address, customer_type, interested_package_id,
          source, payment_type, requirement, note,
          id_card_number, id_card_address, id_card_photo_url, house_reg_photo_url,
          line_id, house_number,
          pre_primary_reason,
          customer_code, seeker_type, seeker_name, customer_interest, home_loan_status, project_note,
          project_name, project_alias,
          meter_number, tag, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @full_name, @phone, @email, @project_id, @installation_address, @customer_type, @interested_package_id,
          @source, @payment_type, @requirement, @note,
          @id_card_number, @id_card_address, @id_card_photo_url, @house_reg_photo_url,
          @line_id, @house_number,
          @pre_primary_reason,
          @customer_code, @seeker_type, @seeker_name, @customer_interest, @home_loan_status, @project_note,
          @project_name, @project_alias,
          @meter_number, @tag, 'pre_survey'
        )
      `);

    // Auto-log lead created (register/walk-in is the first contact). Stamp
    // created_by with the authenticated user so seeker→lead syncs and manual
    // creates both attribute correctly — was hardcoded to 1 (system/admin),
    // which broke "who synced this lead" reporting.
    const leadId = result.recordset[0].id;
    await refreshJourneySafe(db, leadId);
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("source", sql.NVarChar(30), body.source || "walk-in")
      .input("note", sql.NVarChar(sql.MAX), body.note || body.requirement || null)
      .input("created_by", sql.Int, gate.userId)
      .query(`INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by) VALUES (@lead_id, 'lead_created', 'Lead created (' + @source + ')', @note, @created_by)`);

    // lead_data row — populate any of the 9 profile fields that came in on
    // the create payload. Always insert a row even when all 9 are null so
    // future PATCHes can UPDATE without first having to MERGE.
    const monthlyBill = body.monthly_bill ? parseInt(String(body.monthly_bill)) : (body.pre_monthly_bill ?? null);
    const appliances = Array.isArray(body.pre_appliances) ? body.pre_appliances.join(",") : (body.pre_appliances || null);
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("residence_type",   sql.NVarChar(50),      body.pre_residence_type   || null)
      .input("monthly_bill",     sql.Decimal(10, 2),    monthlyBill)
      .input("peak_usage",       sql.NVarChar(50),      body.pre_peak_usage       || null)
      .input("electrical_phase", sql.NVarChar(50),      body.pre_electrical_phase || null)
      .input("wants_battery",    sql.NVarChar(50),      body.pre_wants_battery    || null)
      .input("ac_units",         sql.NVarChar(sql.MAX), body.pre_ac_units         || null)
      .input("appliances",       sql.NVarChar(sql.MAX), appliances)
      .input("roof_shape",       sql.NVarChar(50),      body.pre_roof_shape       || null)
      .input("bill_photo_url",   sql.NVarChar(500),     body.pre_bill_photo_url   || null)
      .query(`
        INSERT INTO lead_data (lead_id, residence_type, monthly_bill, peak_usage, electrical_phase, wants_battery, ac_units, appliances, roof_shape, bill_photo_url)
        VALUES (@lead_id, @residence_type, @monthly_bill, @peak_usage, @electrical_phase, @wants_battery, @ac_units, @appliances, @roof_shape, @bill_photo_url)
      `);

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
