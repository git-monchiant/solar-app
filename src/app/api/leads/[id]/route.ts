import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

const statusLabels: Record<string, string> = {
  register: "รอติดตาม",
  survey: "สำรวจหน้างาน", quote: "รอใบเสนอราคา", order: "รออนุมัติ/ชำระ",
  install: "กำลังติดตั้ง", warranty: "ออกใบรับประกัน", gridtie: "ขอขนานไฟ",
  closed: "ติดตั้งเรียบร้อย", lost: "ยกเลิก",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const result = await db
      .request()
      .input("id", sql.Int, parseInt(id))
      .query(`
        SELECT l.*, p.name as project_name, pk.name as package_name, pk.price as package_price,
               u.full_name as assigned_name,
               b.id as booking_id, b.booking_number, b.total_price as booking_price, b.status as booking_status, b.payment_confirmed, b.confirmed, b.package_id as booked_package_id, b.created_at as booking_date,
               lu.display_name as line_display_name, lu.picture_url as line_picture_url
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        LEFT JOIN bookings b ON b.lead_id = l.id
        LEFT JOIN line_users lu ON lu.line_user_id = l.line_id
        WHERE l.id = @id
      `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json(fixDates(result.recordset)[0]);
  } catch (error) {
    console.error("GET /api/leads/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    const leadId = parseInt(id);

    // Get current status before update
    let oldStatus: string | null = null;
    if (body.status !== undefined) {
      const current = await db.request().input("id", sql.Int, leadId)
        .query(`SELECT status FROM leads WHERE id = @id`);
      if (current.recordset.length > 0) {
        oldStatus = current.recordset[0].status;
      }
    }

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, leadId);

    if (body.status !== undefined) {
      sets.push("status = @status");
      request.input("status", sql.NVarChar(30), body.status);
    }
    if (body.note !== undefined) {
      sets.push("note = @note");
      request.input("note", sql.NVarChar(sql.MAX), body.note);
    }
    if (body.interested_package_id !== undefined) {
      sets.push("interested_package_id = @interested_package_id");
      request.input("interested_package_id", sql.Int, body.interested_package_id);
    }
    if (body.id_card_number !== undefined) {
      sets.push("id_card_number = @id_card_number");
      request.input("id_card_number", sql.NVarChar(20), body.id_card_number);
    }
    if (body.id_card_address !== undefined) {
      sets.push("id_card_address = @id_card_address");
      request.input("id_card_address", sql.NVarChar(500), body.id_card_address);
    }
    if (body.meter_number !== undefined) {
      sets.push("meter_number = @meter_number");
      request.input("meter_number", sql.NVarChar(30), body.meter_number);
    }
    if (body.id_card_photo_url !== undefined) {
      sets.push("id_card_photo_url = @id_card_photo_url");
      request.input("id_card_photo_url", sql.NVarChar(500), body.id_card_photo_url);
    }
    if (body.house_reg_photo_url !== undefined) {
      sets.push("house_reg_photo_url = @house_reg_photo_url");
      request.input("house_reg_photo_url", sql.NVarChar(500), body.house_reg_photo_url);
    }
    if (body.interested_package_ids !== undefined) {
      sets.push("interested_package_ids = @interested_package_ids");
      request.input("interested_package_ids", sql.NVarChar(200), body.interested_package_ids);
    }
    if (body.phone !== undefined) {
      sets.push("phone = @phone");
      request.input("phone", sql.NVarChar(20), body.phone);
    }
    if (body.installation_address !== undefined) {
      sets.push("installation_address = @installation_address");
      request.input("installation_address", sql.NVarChar(500), body.installation_address);
    }
    if (body.full_name !== undefined) {
      sets.push("full_name = @full_name");
      request.input("full_name", sql.NVarChar(200), body.full_name);
    }
    if (body.lost_reason !== undefined) {
      sets.push("lost_reason = @lost_reason");
      request.input("lost_reason", sql.NVarChar(sql.MAX), body.lost_reason);
    }
    if (body.revisit_date !== undefined) {
      sets.push("revisit_date = @revisit_date");
      request.input("revisit_date", sql.Date, body.revisit_date ? new Date(body.revisit_date + "T12:00:00") : null);
    }
    if (body.source !== undefined) {
      sets.push("source = @source");
      request.input("source", sql.NVarChar(30), body.source);
    }
    if (body.payment_type !== undefined) {
      sets.push("payment_type = @payment_type");
      request.input("payment_type", sql.NVarChar(30), body.payment_type);
    }
    if (body.finance_status !== undefined) {
      sets.push("finance_status = @finance_status");
      request.input("finance_status", sql.NVarChar(30), body.finance_status);
    }
    if (body.requirement !== undefined) {
      sets.push("requirement = @requirement");
      request.input("requirement", sql.NVarChar(sql.MAX), body.requirement);
    }
    if (body.assigned_staff !== undefined) {
      sets.push("assigned_staff = @assigned_staff");
      request.input("assigned_staff", sql.NVarChar(100), body.assigned_staff);
    }
    if (body.assigned_user_id !== undefined) {
      sets.push("assigned_user_id = @assigned_user_id");
      request.input("assigned_user_id", sql.Int, body.assigned_user_id);
    }
    if (body.survey_date !== undefined) {
      sets.push("survey_date = @survey_date");
      request.input("survey_date", sql.Date, body.survey_date ? new Date(body.survey_date + "T12:00:00") : null);
    }
    if (body.next_follow_up !== undefined) {
      sets.push("next_follow_up = @next_follow_up");
      request.input("next_follow_up", sql.Date, body.next_follow_up ? new Date(body.next_follow_up + "T12:00:00") : null);
    }
    if (body.survey_time_slot !== undefined) {
      sets.push("survey_time_slot = @survey_time_slot");
      request.input("survey_time_slot", sql.NVarChar(20), body.survey_time_slot);
    }
    if (body.zone !== undefined) {
      sets.push("zone = @zone");
      request.input("zone", sql.NVarChar(100), body.zone);
    }
    if (body.survey_confirmed !== undefined) {
      sets.push("survey_confirmed = @survey_confirmed");
      request.input("survey_confirmed", sql.Bit, body.survey_confirmed ? 1 : 0);
    }
    if (body.pre_residence_type !== undefined) {
      sets.push("pre_residence_type = @pre_residence_type");
      request.input("pre_residence_type", sql.NVarChar(30), body.pre_residence_type);
    }
    if (body.survey_note !== undefined) {
      sets.push("survey_note = @survey_note");
      request.input("survey_note", sql.NVarChar(sql.MAX), body.survey_note);
    }
    if (body.quotation_note !== undefined) {
      sets.push("quotation_note = @quotation_note");
      request.input("quotation_note", sql.NVarChar(sql.MAX), body.quotation_note);
    }
    if (body.quotation_files !== undefined) {
      sets.push("quotation_files = @quotation_files");
      request.input("quotation_files", sql.NVarChar(sql.MAX), body.quotation_files);
    }
    if (body.quotation_amount !== undefined) {
      sets.push("quotation_amount = @quotation_amount");
      request.input("quotation_amount", sql.Decimal(12, 2), body.quotation_amount);
    }
    if (body.order_total !== undefined) {
      sets.push("order_total = @order_total");
      request.input("order_total", sql.Decimal(12, 2), body.order_total);
    }
    if (body.order_pct_before !== undefined) {
      sets.push("order_pct_before = @order_pct_before");
      request.input("order_pct_before", sql.Int, body.order_pct_before);
    }
    if (body.order_pct_after !== undefined) {
      sets.push("order_pct_after = @order_pct_after");
      request.input("order_pct_after", sql.Int, body.order_pct_after);
    }
    if (body.order_before_paid !== undefined) {
      sets.push("order_before_paid = @order_before_paid");
      request.input("order_before_paid", sql.Bit, body.order_before_paid);
    }
    if (body.order_before_slip !== undefined) {
      sets.push("order_before_slip = @order_before_slip");
      request.input("order_before_slip", sql.NVarChar(sql.MAX), body.order_before_slip);
    }
    if (body.order_after_paid !== undefined) {
      sets.push("order_after_paid = @order_after_paid");
      request.input("order_after_paid", sql.Bit, body.order_after_paid);
    }
    if (body.order_after_slip !== undefined) {
      sets.push("order_after_slip = @order_after_slip");
      request.input("order_after_slip", sql.NVarChar(sql.MAX), body.order_after_slip);
    }
    if (body.install_date !== undefined) {
      sets.push("install_date = @install_date");
      request.input("install_date", sql.Date, body.install_date ? new Date(body.install_date + "T12:00:00") : null);
    }
    if (body.install_time_slot !== undefined) {
      sets.push("install_time_slot = @install_time_slot");
      request.input("install_time_slot", sql.NVarChar(20), body.install_time_slot);
    }
    if (body.install_confirmed !== undefined) {
      sets.push("install_confirmed = @install_confirmed");
      request.input("install_confirmed", sql.Bit, body.install_confirmed ? 1 : 0);
    }
    if (body.install_photos !== undefined) {
      sets.push("install_photos = @install_photos");
      request.input("install_photos", sql.NVarChar(sql.MAX), body.install_photos);
    }
    if (body.install_note !== undefined) {
      sets.push("install_note = @install_note");
      request.input("install_note", sql.NVarChar(sql.MAX), body.install_note);
    }
    if (body.install_extra_note !== undefined) {
      sets.push("install_extra_note = @install_extra_note");
      request.input("install_extra_note", sql.NVarChar(sql.MAX), body.install_extra_note);
    }
    if (body.install_extra_cost !== undefined) {
      sets.push("install_extra_cost = @install_extra_cost");
      request.input("install_extra_cost", sql.Decimal(12, 2), body.install_extra_cost);
    }
    if (body.install_completed_at !== undefined) {
      sets.push("install_completed_at = GETDATE()");
    }
    if (body.review_sent !== undefined) {
      sets.push("review_sent = @review_sent");
      request.input("review_sent", sql.Bit, body.review_sent);
    }
    if (body.review_rating !== undefined) {
      sets.push("review_rating = @review_rating");
      request.input("review_rating", sql.Int, body.review_rating);
    }
    if (body.review_quality !== undefined) {
      sets.push("review_quality = @review_quality");
      request.input("review_quality", sql.Int, body.review_quality);
    }
    if (body.review_service !== undefined) {
      sets.push("review_service = @review_service");
      request.input("review_service", sql.Int, body.review_service);
    }
    if (body.review_punctuality !== undefined) {
      sets.push("review_punctuality = @review_punctuality");
      request.input("review_punctuality", sql.Int, body.review_punctuality);
    }
    if (body.review_comment !== undefined) {
      sets.push("review_comment = @review_comment");
      request.input("review_comment", sql.NVarChar(sql.MAX), body.review_comment);
    }
    if (body.survey_photos !== undefined) {
      sets.push("survey_photos = @survey_photos");
      request.input("survey_photos", sql.NVarChar(sql.MAX), body.survey_photos);
    }
    if (body.survey_inverter !== undefined) {
      sets.push("survey_inverter = @survey_inverter");
      request.input("survey_inverter", sql.NVarChar(100), body.survey_inverter);
    }
    if (body.survey_electrical_phase !== undefined) {
      sets.push("survey_electrical_phase = @survey_electrical_phase");
      request.input("survey_electrical_phase", sql.NVarChar(20), body.survey_electrical_phase);
    }
    if (body.survey_wants_battery !== undefined) {
      sets.push("survey_wants_battery = @survey_wants_battery");
      request.input("survey_wants_battery", sql.NVarChar(20), body.survey_wants_battery);
    }
    if (body.survey_battery_kwh !== undefined) {
      sets.push("survey_battery_kwh = @survey_battery_kwh");
      request.input("survey_battery_kwh", sql.Int, body.survey_battery_kwh);
    }
    if (body.survey_panel_id !== undefined) {
      sets.push("survey_panel_id = @survey_panel_id");
      request.input("survey_panel_id", sql.Int, body.survey_panel_id);
    }
    if (body.survey_panel_count !== undefined) {
      sets.push("survey_panel_count = @survey_panel_count");
      request.input("survey_panel_count", sql.Int, body.survey_panel_count);
    }
    // Survey duplicates of pre_*
    if (body.survey_residence_type !== undefined) {
      sets.push("survey_residence_type = @survey_residence_type");
      request.input("survey_residence_type", sql.NVarChar(30), body.survey_residence_type);
    }
    if (body.survey_monthly_bill !== undefined) {
      sets.push("survey_monthly_bill = @survey_monthly_bill");
      request.input("survey_monthly_bill", sql.Int, body.survey_monthly_bill);
    }
    if (body.survey_peak_usage !== undefined) {
      sets.push("survey_peak_usage = @survey_peak_usage");
      request.input("survey_peak_usage", sql.NVarChar(20), body.survey_peak_usage);
    }
    if (body.survey_appliances !== undefined) {
      sets.push("survey_appliances = @survey_appliances");
      request.input("survey_appliances", sql.NVarChar(200), Array.isArray(body.survey_appliances) ? body.survey_appliances.join(",") : body.survey_appliances);
    }
    if (body.survey_ac_units !== undefined) {
      sets.push("survey_ac_units = @survey_ac_units");
      request.input("survey_ac_units", sql.NVarChar(200), body.survey_ac_units);
    }
    // Must-have on-site
    if (body.survey_roof_material !== undefined) {
      sets.push("survey_roof_material = @survey_roof_material");
      request.input("survey_roof_material", sql.NVarChar(40), body.survey_roof_material);
    }
    if (body.survey_roof_orientation !== undefined) {
      sets.push("survey_roof_orientation = @survey_roof_orientation");
      request.input("survey_roof_orientation", sql.NVarChar(60), body.survey_roof_orientation);
    }
    if (body.survey_floors !== undefined) {
      sets.push("survey_floors = @survey_floors");
      request.input("survey_floors", sql.Int, body.survey_floors);
    }
    if (body.survey_roof_area_m2 !== undefined) {
      sets.push("survey_roof_area_m2 = @survey_roof_area_m2");
      request.input("survey_roof_area_m2", sql.Int, body.survey_roof_area_m2);
    }
    if (body.survey_grid_type !== undefined) {
      sets.push("survey_grid_type = @survey_grid_type");
      request.input("survey_grid_type", sql.NVarChar(20), body.survey_grid_type);
    }
    if (body.survey_utility !== undefined) {
      sets.push("survey_utility = @survey_utility");
      request.input("survey_utility", sql.NVarChar(10), body.survey_utility);
    }
    if (body.survey_ca_number !== undefined) {
      sets.push("survey_ca_number = @survey_ca_number");
      request.input("survey_ca_number", sql.NVarChar(20), body.survey_ca_number);
    }
    if (body.survey_meter_size !== undefined) {
      sets.push("survey_meter_size = @survey_meter_size");
      request.input("survey_meter_size", sql.NVarChar(20), body.survey_meter_size);
    }
    if (body.survey_db_distance_m !== undefined) {
      sets.push("survey_db_distance_m = @survey_db_distance_m");
      request.input("survey_db_distance_m", sql.Int, body.survey_db_distance_m);
    }
    // Nice-to-have on-site
    if (body.survey_shading !== undefined) {
      sets.push("survey_shading = @survey_shading");
      request.input("survey_shading", sql.NVarChar(20), body.survey_shading);
    }
    if (body.survey_roof_age !== undefined) {
      sets.push("survey_roof_age = @survey_roof_age");
      request.input("survey_roof_age", sql.NVarChar(20), body.survey_roof_age);
    }
    if (body.survey_roof_tilt !== undefined) {
      sets.push("survey_roof_tilt = @survey_roof_tilt");
      request.input("survey_roof_tilt", sql.Int, body.survey_roof_tilt);
    }
    if (body.pre_monthly_bill !== undefined) {
      sets.push("pre_monthly_bill = @pre_monthly_bill");
      request.input("pre_monthly_bill", sql.Int, body.pre_monthly_bill);
    }
    if (body.pre_electrical_phase !== undefined) {
      sets.push("pre_electrical_phase = @pre_electrical_phase");
      request.input("pre_electrical_phase", sql.NVarChar(20), body.pre_electrical_phase);
    }
    if (body.pre_wants_battery !== undefined) {
      sets.push("pre_wants_battery = @pre_wants_battery");
      request.input("pre_wants_battery", sql.NVarChar(20), body.pre_wants_battery);
    }
    if (body.pre_roof_shape !== undefined) {
      sets.push("pre_roof_shape = @pre_roof_shape");
      request.input("pre_roof_shape", sql.NVarChar(20), body.pre_roof_shape);
    }
    if (body.pre_appliances !== undefined) {
      sets.push("pre_appliances = @pre_appliances");
      request.input("pre_appliances", sql.NVarChar(200), Array.isArray(body.pre_appliances) ? body.pre_appliances.join(",") : body.pre_appliances);
    }
    if (body.pre_ac_units !== undefined) {
      sets.push("pre_ac_units = @pre_ac_units");
      request.input("pre_ac_units", sql.NVarChar(200), body.pre_ac_units);
    }
    if (body.pre_peak_usage !== undefined) {
      sets.push("pre_peak_usage = @pre_peak_usage");
      request.input("pre_peak_usage", sql.NVarChar(20), body.pre_peak_usage);
    }
    if (body.pre_primary_reason !== undefined) {
      sets.push("pre_primary_reason = @pre_primary_reason");
      request.input("pre_primary_reason", sql.NVarChar(50), body.pre_primary_reason);
    }
    if (body.pre_bill_photo_url !== undefined) {
      sets.push("pre_bill_photo_url = @pre_bill_photo_url");
      request.input("pre_bill_photo_url", sql.NVarChar(500), body.pre_bill_photo_url);
    }
    if (body.slip_url !== undefined) {
      sets.push("slip_url = @slip_url");
      request.input("slip_url", sql.NVarChar(500), body.slip_url);
    }
    // Warranty (step 06)
    if (body.warranty_inverter_sn !== undefined) {
      sets.push("warranty_inverter_sn = @warranty_inverter_sn");
      request.input("warranty_inverter_sn", sql.NVarChar(100), body.warranty_inverter_sn);
    }
    if (body.warranty_doc_no !== undefined) {
      sets.push("warranty_doc_no = @warranty_doc_no");
      request.input("warranty_doc_no", sql.NVarChar(30), body.warranty_doc_no);
    }
    if (body.warranty_start_date !== undefined) {
      sets.push("warranty_start_date = @warranty_start_date");
      request.input("warranty_start_date", sql.Date, body.warranty_start_date ? new Date(body.warranty_start_date + "T12:00:00") : null);
    }
    if (body.warranty_end_date !== undefined) {
      sets.push("warranty_end_date = @warranty_end_date");
      request.input("warranty_end_date", sql.Date, body.warranty_end_date ? new Date(body.warranty_end_date + "T12:00:00") : null);
    }
    if (body.warranty_issued_at !== undefined) {
      sets.push("warranty_issued_at = GETDATE()");
    }
    if (body.warranty_doc_url !== undefined) {
      sets.push("warranty_doc_url = @warranty_doc_url");
      request.input("warranty_doc_url", sql.NVarChar(500), body.warranty_doc_url);
    }
    if (body.warranty_customer_signature_url !== undefined) {
      sets.push("warranty_customer_signature_url = @warranty_customer_signature_url");
      request.input("warranty_customer_signature_url", sql.NVarChar(500), body.warranty_customer_signature_url);
    }
    // Grid-tie / ขอขนานไฟ (step 07)
    if (body.grid_utility !== undefined) {
      sets.push("grid_utility = @grid_utility");
      request.input("grid_utility", sql.NVarChar(10), body.grid_utility);
    }
    if (body.grid_app_no !== undefined) {
      sets.push("grid_app_no = @grid_app_no");
      request.input("grid_app_no", sql.NVarChar(50), body.grid_app_no);
    }
    if (body.grid_erc_submitted_date !== undefined) {
      sets.push("grid_erc_submitted_date = @grid_erc_submitted_date");
      request.input("grid_erc_submitted_date", sql.Date, body.grid_erc_submitted_date ? new Date(body.grid_erc_submitted_date + "T12:00:00") : null);
    }
    if (body.grid_submitted_date !== undefined) {
      sets.push("grid_submitted_date = @grid_submitted_date");
      request.input("grid_submitted_date", sql.Date, body.grid_submitted_date ? new Date(body.grid_submitted_date + "T12:00:00") : null);
    }
    if (body.grid_inspection_date !== undefined) {
      sets.push("grid_inspection_date = @grid_inspection_date");
      request.input("grid_inspection_date", sql.Date, body.grid_inspection_date ? new Date(body.grid_inspection_date + "T12:00:00") : null);
    }
    if (body.grid_approved_date !== undefined) {
      sets.push("grid_approved_date = @grid_approved_date");
      request.input("grid_approved_date", sql.Date, body.grid_approved_date ? new Date(body.grid_approved_date + "T12:00:00") : null);
    }
    if (body.grid_meter_changed_date !== undefined) {
      sets.push("grid_meter_changed_date = @grid_meter_changed_date");
      request.input("grid_meter_changed_date", sql.Date, body.grid_meter_changed_date ? new Date(body.grid_meter_changed_date + "T12:00:00") : null);
    }
    if (body.grid_permit_doc_url !== undefined) {
      sets.push("grid_permit_doc_url = @grid_permit_doc_url");
      request.input("grid_permit_doc_url", sql.NVarChar(500), body.grid_permit_doc_url);
    }
    if (body.grid_note !== undefined) {
      sets.push("grid_note = @grid_note");
      request.input("grid_note", sql.NVarChar(sql.MAX), body.grid_note);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push("updated_at = GETDATE()");

    const result = await request.query(`
      UPDATE leads SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id
    `);

    // Auto-log status change as activity (with duplicate prevention)
    if (body.status !== undefined && oldStatus && oldStatus !== body.status) {
      const dup = await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("old_status", sql.NVarChar(30), oldStatus)
        .input("new_status", sql.NVarChar(30), body.status)
        .query(`SELECT TOP 1 id FROM lead_activities WHERE lead_id = @lead_id AND activity_type = 'status_change' AND old_status = @old_status AND new_status = @new_status AND created_at > DATEADD(SECOND, -30, GETDATE())`);
      if (dup.recordset.length === 0) {
        const oldLabel = statusLabels[oldStatus] || oldStatus;
        const newLabel = statusLabels[body.status] || body.status;
        await db.request()
          .input("lead_id", sql.Int, leadId)
          .input("activity_type", sql.NVarChar(30), "status_change")
          .input("title", sql.NVarChar(200), `Status: ${oldLabel} → ${newLabel}`)
          .input("old_status", sql.NVarChar(30), oldStatus)
          .input("new_status", sql.NVarChar(30), body.status)
          .query(`
            INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by)
            VALUES (@lead_id, @activity_type, @title, @old_status, @new_status, 1)
          `);
      }
    }

    return NextResponse.json(fixDates(result.recordset)[0]);
  } catch (error) {
    console.error("PATCH /api/leads/[id] error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
