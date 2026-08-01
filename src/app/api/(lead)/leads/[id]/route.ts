import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logLeadActivity, fmtThaiDate } from "@/lib/lead-activity-log";
import { validateDocNo } from "@/lib/doc-number";
import { getGridTieFinalMissing } from "@/lib/gridTie";

const statusLabels: Record<string, string> = {
  pre_survey: "รอติดตาม",
  survey: "รอสำรวจ", quote: "รอใบเสนอราคา", order: "รออนุมัติ/ชำระ",
  install: "กำลังติดตั้ง", warranty: "ออกใบรับประกัน", gridtie: "ขอขนานไฟ",
  closed: "ส่งมอบแล้ว", lost: "ยกเลิก", returned: "ส่งกลับ Seeker",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = await getDb();
    const result = await db
      .request()
      .input("id", sql.Int, parseInt(id))
      .query(`
        SELECT l.*,
               COALESCE(NULLIF(l.project_alias, N''), NULLIF(l.project_name, N''), p.name) as project_display_name,
               p.name as project_official_name,
               pk.name as package_name, pk.price as package_price,
               u.full_name as assigned_name, u.username as assigned_username,
               lu.display_name as line_display_name,
               CASE WHEN lu.picture_blob IS NOT NULL THEN '/api/line-avatar/' + lu.line_user_id ELSE NULL END AS line_picture_url,
               CAST(CASE
                 WHEN EXISTS (SELECT 1 FROM prospects WHERE lead_id = l.id)
                   AND (l.note IS NULL OR l.note NOT LIKE N'สถานะจาก sheet:%')
                 THEN 1 ELSE 0
               END AS BIT) as from_prospect,
               (SELECT COUNT(*) FROM payments WHERE lead_id = l.id AND slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL) as order_paid_count,
               -- Aliased lead_data columns so callers still see pre_* at the
               -- top level — keeps PreSurveyForm + done views backwards
               -- compatible after the schema move in migration 037.
               d.residence_type AS pre_residence_type,
               d.monthly_bill AS pre_monthly_bill,
               d.peak_usage AS pre_peak_usage,
               d.electrical_phase AS pre_electrical_phase,
               d.wants_battery AS pre_wants_battery,
               d.ac_units AS pre_ac_units,
               d.appliances AS pre_appliances,
               d.roof_shape AS pre_roof_shape,
               d.bill_photo_url AS pre_bill_photo_url,
               -- Questionnaire §1 (migration 038) — no pre_ alias because
               -- these were never on leads to begin with.
               d.house_age,
               d.occupant_total,
               d.occupant_elderly,
               d.occupant_kids,
               d.occupant_pets,
               -- Questionnaire §2 (migration 039).
               d.monthly_bill_max,
               d.meter_size,
               -- Questionnaire §3 (migration 040).
               d.home_at_daytime,
               d.daytime_occupants,
               d.work_at_home,
               d.business_type,
               d.work_days_per_week,
               d.ac_split,
               d.ev_charge_period,
               -- Questionnaire §4 (migration 041).
               d.future_ev,
               d.future_ev_charger,
               d.future_extend_home,
               d.future_more_members,
               d.future_smart_home,
               d.future_battery,
               -- Questionnaire §5/§6/§7 (migration 042).
               d.outage_priorities,
               d.bill_rise_action,
               d.had_roof_leak,
               d.did_roof_repair,
               d.had_electrical_issue,
               d.did_panel_replacement,
               d.self_generates,
               d.ev_ready,
               d.blackout_resilient,
               d.future_usage_trend,
               -- Questionnaire §8 (migration 043 + 049).
               d.decision_factors,
               d.decision_timeline
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        LEFT JOIN line_users lu ON lu.line_user_id = l.line_id
        LEFT JOIN lead_data d ON d.lead_id = l.id
        WHERE l.id = @id
      `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    // l.* exposes the raw l.project_name (free-text fallback). Overlay it with
    // the COALESCEd display name so UI's `project_name` always shows the
    // best-available label (free text when no project_id, official name
    // otherwise). project_official_name remains for callers that need the
    // strict joined value.
    const row = fixDates(result.recordset)[0];
    row.project_name = row.project_display_name;
    delete row.project_display_name;
    return NextResponse.json(row);
  } catch (error) {
    console.error("GET /api/leads/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    const leadId = parseInt(id);

    // Snapshot fields we care about for activity logging — read once so any
    // appointment changes (survey_date, install_date, next_follow_up,
    // survey_confirmed, install_confirmed, install_completed_at) and status
    // transitions can be diffed against the new body in a single round-trip.
    let oldStatus: string | null = null;
    let oldRow: {
      status: string | null;
      payment_confirmed: boolean | number | null;
      survey_date: Date | null;
      survey_time_slot: string | null;
      install_date: Date | null;
      install_time_slot: string | null;
      next_follow_up: Date | null;
      survey_confirmed: boolean | number | null;
      install_confirmed: boolean | number | null;
      install_completed_at: Date | null;
      grid_utility: string | null;
      grid_app_no: string | null;
      grid_applicant_type: string | null;
      grid_document_checklist: string | null;
      grid_application_doc_url: string | null;
      grid_permit_doc_url: string | null;
    } | null = null;
    {
      const current = await db.request().input("id", sql.Int, leadId).query(`
        SELECT status, payment_confirmed,
               survey_date, survey_time_slot, install_date, install_time_slot, next_follow_up,
               survey_confirmed, install_confirmed, install_completed_at,
               grid_utility, grid_app_no, grid_applicant_type, grid_document_checklist,
               grid_application_doc_url, grid_permit_doc_url
        FROM leads WHERE id = @id
      `);
      if (current.recordset.length > 0) {
        oldRow = current.recordset[0];
        oldStatus = oldRow?.status ?? null;
        if (body.status !== undefined) {
          // Guard: can't move forward from pre_survey → survey (or beyond)
          // without a confirmed payment. The body may set payment_confirmed in
          // the same PATCH, so accept that too.
          const ADVANCED = new Set(["survey", "quote", "order", "install", "warranty", "gridtie", "closed"]);
          const movingForward = oldStatus === "pre_survey" && ADVANCED.has(body.status);
          const willBePaid = body.payment_confirmed === true || oldRow?.payment_confirmed === true;
          if (movingForward && !willBePaid) {
            return NextResponse.json(
              { error: "ต้องยืนยันชำระเงิน (payment_confirmed) ก่อนจึงจะเลื่อนไปขั้น survey ได้" },
              { status: 400 }
            );
          }

          // Entering Step 05 (install) requires actual received money for every
          // installment due before installation. A cheque receipt without
          // confirmed_at is intentionally not sufficient. Installments marked
          // "after" are collected in Step 05 and are excluded from this gate.
          if (body.status === "install" && oldStatus !== "install") {
            const planRes = await db.request().input("lead_id", sql.Int, leadId).query(`
              SELECT order_installments, order_pct_before, order_total,
                     order_discount_amount, pre_total_price
              FROM leads WHERE id = @lead_id
            `);
            const saved = planRes.recordset[0] ?? {};
            const rawPlan = body.order_installments !== undefined
              ? body.order_installments
              : saved.order_installments;
            let plan: Array<{ pct?: number; when?: string }> = [];
            try {
              const parsed = rawPlan ? JSON.parse(rawPlan) : [];
              if (Array.isArray(parsed)) plan = parsed;
            } catch {
              return NextResponse.json({ error: "Invalid order_installments JSON" }, { status: 400 });
            }
            if (plan.length === 0) {
              const beforePct = Number(saved.order_pct_before ?? 100);
              plan = beforePct >= 100
                ? [{ pct: 100, when: "before" }]
                : [{ pct: beforePct, when: "before" }, { pct: 100 - beforePct, when: "after" }];
            }

            const paidRes = await db.request().input("lead_id", sql.Int, leadId).query(`
              SELECT slip_field FROM payments
              WHERE lead_id = @lead_id AND confirmed_at IS NOT NULL
                AND (slip_field LIKE 'order_installment_%' OR slip_field = 'order_before_slip')
            `);
            const paidFields = new Set<string>(paidRes.recordset.map((r: { slip_field: string }) => r.slip_field));
            const paidIdx = new Set<number>(
              [...paidFields]
                .filter(field => field.startsWith("order_installment_"))
                .map(field => parseInt(field.replace("order_installment_", "")))
                .filter(idx => !Number.isNaN(idx))
            );

            const orderTotal = Number(body.order_total ?? saved.order_total ?? 0);
            const discountAmount = Math.min(orderTotal, Number(body.order_discount_amount ?? saved.order_discount_amount ?? 0));
            const depositPaid = Number(saved.pre_total_price ?? 0);
            const netTotal = Math.max(0, orderTotal - discountAmount - depositPaid);
            let autoIdx = plan.length - 1;
            for (let idx = plan.length - 1; idx >= 0; idx--) {
              if (!paidIdx.has(idx)) { autoIdx = idx; break; }
            }
            const fixedPct = plan.reduce(
              (sum, row, idx) => idx === autoIdx ? sum : sum + (Number(row?.pct) || 0),
              0,
            );
            const autoPct = Math.max(0, 100 - fixedPct);
            const requiredBefore = plan
              .map((row, idx) => ({
                idx,
                when: row?.when === "after" ? "after" : "before",
                amount: Math.round((netTotal * (idx === autoIdx ? autoPct : Number(row?.pct) || 0)) / 100),
              }))
              .filter(row => row.when === "before" && row.amount > 0);
            const missingBefore = paidFields.has("order_before_slip")
              ? []
              : requiredBefore.filter(row => !paidIdx.has(row.idx));
            if (missingBefore.length > 0) {
              return NextResponse.json(
                { error: `ต้องยืนยันรับเงินจริงงวดก่อนติดตั้งให้ครบก่อน (เหลือ ${missingBefore.length} งวด)` },
                { status: 409 },
              );
            }
          }

          if (body.status === "closed" && oldStatus !== "closed") {
            const missing = getGridTieFinalMissing({
              grid_utility: body.grid_utility !== undefined ? body.grid_utility : oldRow?.grid_utility,
              grid_app_no: body.grid_app_no !== undefined ? body.grid_app_no : oldRow?.grid_app_no,
              grid_applicant_type: body.grid_applicant_type !== undefined ? body.grid_applicant_type : oldRow?.grid_applicant_type,
              grid_document_checklist: body.grid_document_checklist !== undefined ? body.grid_document_checklist : oldRow?.grid_document_checklist,
              grid_application_doc_url: body.grid_application_doc_url !== undefined ? body.grid_application_doc_url : oldRow?.grid_application_doc_url,
              grid_permit_doc_url: body.grid_permit_doc_url !== undefined ? body.grid_permit_doc_url : oldRow?.grid_permit_doc_url,
            });
            if (missing.length > 0) {
              return NextResponse.json(
                { error: "ข้อมูลขอขนานไฟยังไม่ครบ", missing },
                { status: 409 },
              );
            }
          }
        }
      }
    }

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, leadId);

    // ── lead_data fields ─────────────────────────────────────────────────
    // PreSurveyForm's "ข้อมูล" tab fields live in lead_data (migration 037).
    // Collect any pre_* keys from body that target that table, then UPSERT
    // after the leads UPDATE. Field names here drop the pre_ prefix to match
    // the new schema; API surface keeps pre_xxx for backwards compatibility.
    type LdEntry = { col: string; sqlType: sql.ISqlType | sql.ISqlTypeFactory; value: unknown };
    const ldFields: LdEntry[] = [];
    const pushLd = (col: string, sqlType: sql.ISqlType | sql.ISqlTypeFactory, value: unknown) => {
      if (value === undefined) return;
      ldFields.push({ col, sqlType, value });
    };
    pushLd("residence_type",   sql.NVarChar(50),      body.pre_residence_type);
    pushLd("monthly_bill",     sql.Decimal(10, 2),    body.pre_monthly_bill);
    pushLd("peak_usage",       sql.NVarChar(50),      body.pre_peak_usage);
    pushLd("electrical_phase", sql.NVarChar(50),      body.pre_electrical_phase);
    pushLd("wants_battery",    sql.NVarChar(50),      body.pre_wants_battery);
    pushLd("ac_units",         sql.NVarChar(sql.MAX), body.pre_ac_units);
    pushLd("appliances",       sql.NVarChar(sql.MAX), Array.isArray(body.pre_appliances) ? body.pre_appliances.join(",") : body.pre_appliances);
    pushLd("roof_shape",       sql.NVarChar(50),      body.pre_roof_shape);
    pushLd("bill_photo_url",   sql.NVarChar(500),     body.pre_bill_photo_url);
    // Questionnaire §1 fields (migration 038).
    pushLd("house_age",        sql.NVarChar(20),      body.house_age);
    pushLd("occupant_total",   sql.Int,               body.occupant_total);
    pushLd("occupant_elderly", sql.Int,               body.occupant_elderly);
    pushLd("occupant_kids",    sql.Int,               body.occupant_kids);
    pushLd("occupant_pets",    sql.Int,               body.occupant_pets);
    // Questionnaire §2 (migration 039).
    pushLd("monthly_bill_max", sql.Decimal(10, 2),    body.monthly_bill_max);
    pushLd("meter_size",       sql.NVarChar(50),      body.meter_size);
    // Questionnaire §3 (migration 040).
    pushLd("home_at_daytime",    sql.NVarChar(10),      body.home_at_daytime);
    pushLd("daytime_occupants",  sql.NVarChar(200),     body.daytime_occupants);
    pushLd("work_at_home",       sql.NVarChar(10),      body.work_at_home);
    pushLd("business_type",      sql.NVarChar(100),     body.business_type);
    pushLd("work_days_per_week", sql.NVarChar(20),      body.work_days_per_week);
    pushLd("ac_split",           sql.NVarChar(sql.MAX), body.ac_split);
    pushLd("ev_charge_period",   sql.NVarChar(20),      body.ev_charge_period);
    // Questionnaire §4 (migration 041).
    pushLd("future_ev",           sql.NVarChar(20), body.future_ev);
    pushLd("future_ev_charger",   sql.NVarChar(10), body.future_ev_charger);
    pushLd("future_extend_home",  sql.NVarChar(10), body.future_extend_home);
    pushLd("future_more_members", sql.NVarChar(10), body.future_more_members);
    pushLd("future_smart_home",   sql.NVarChar(10), body.future_smart_home);
    pushLd("future_battery",      sql.NVarChar(10), body.future_battery);
    // Questionnaire §5/§6/§7 (migration 042).
    pushLd("outage_priorities",     sql.NVarChar(500), body.outage_priorities);
    pushLd("bill_rise_action",      sql.NVarChar(50),  body.bill_rise_action);
    pushLd("had_roof_leak",         sql.NVarChar(10),  body.had_roof_leak);
    pushLd("did_roof_repair",       sql.NVarChar(10),  body.did_roof_repair);
    pushLd("had_electrical_issue",  sql.NVarChar(10),  body.had_electrical_issue);
    pushLd("did_panel_replacement", sql.NVarChar(10),  body.did_panel_replacement);
    pushLd("self_generates",        sql.NVarChar(10),  body.self_generates);
    pushLd("ev_ready",              sql.NVarChar(20),  body.ev_ready);
    pushLd("blackout_resilient",    sql.NVarChar(10),  body.blackout_resilient);
    pushLd("future_usage_trend",    sql.NVarChar(20),  body.future_usage_trend);
    // Questionnaire §8 (migration 043 + 049).
    pushLd("decision_factors",      sql.NVarChar(sql.MAX), body.decision_factors);
    pushLd("decision_timeline",     sql.NVarChar(200),     body.decision_timeline);
    // ─────────────────────────────────────────────────────────────────────

    if (body.status !== undefined) {
      sets.push("status = @status");
      request.input("status", sql.NVarChar(30), body.status);
    }
    if (body.line_id !== undefined) {
      sets.push("line_id = @line_id");
      request.input("line_id", sql.NVarChar(100), body.line_id);
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
    if (body.package_note !== undefined) {
      sets.push("package_note = @package_note");
      request.input("package_note", sql.NVarChar(500), body.package_note || null);
    }
    if (body.quotation_type !== undefined) {
      sets.push("quotation_type = @quotation_type");
      request.input("quotation_type", sql.NVarChar(20), body.quotation_type || null);
    }
    if (body.phone !== undefined) {
      sets.push("phone = @phone");
      request.input("phone", sql.NVarChar(20), body.phone);
    }
    if (body.email !== undefined) {
      sets.push("email = @email");
      request.input("email", sql.NVarChar(200), body.email);
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
      request.input("revisit_date", sql.Date, body.revisit_date ? toSqlDate(body.revisit_date) : null);
    }
    if (body.project_id !== undefined) {
      sets.push("project_id = @project_id");
      request.input("project_id", sql.Int, body.project_id);
    }
    if (body.customer_type !== undefined) {
      sets.push("customer_type = @customer_type");
      request.input("customer_type", sql.NVarChar(50), body.customer_type);
    }
    if (body.customer_group !== undefined) {
      sets.push("customer_group = @customer_group");
      request.input("customer_group", sql.NVarChar(50), body.customer_group);
    }
    if (body.customer_grade !== undefined) {
      sets.push("customer_grade = @customer_grade");
      request.input("customer_grade", sql.NVarChar(2), body.customer_grade);
    }
    if (body.source !== undefined) {
      sets.push("source = @source");
      request.input("source", sql.NVarChar(30), body.source);
    }
    if (body.tag !== undefined) {
      sets.push("tag = @tag");
      // Accept array (will be JSON-stringified) or already-stringified JSON
      const tagVal = Array.isArray(body.tag)
        ? (body.tag.length > 0 ? JSON.stringify(body.tag) : null)
        : (typeof body.tag === "string" && body.tag ? body.tag : null);
      request.input("tag", sql.NVarChar(500), tagVal);
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
      request.input("survey_date", sql.Date, body.survey_date ? toSqlDate(body.survey_date) : null);
    }
    if (body.next_follow_up !== undefined) {
      sets.push("next_follow_up = @next_follow_up");
      request.input("next_follow_up", sql.Date, body.next_follow_up ? toSqlDate(body.next_follow_up) : null);
    }
    if (body.payment_followup_date !== undefined) {
      sets.push("payment_followup_date = @payment_followup_date");
      request.input("payment_followup_date", sql.Date, body.payment_followup_date ? new Date(String(body.payment_followup_date).slice(0, 10) + "T12:00:00") : null);
    }
    if (body.payment_followup_enabled !== undefined) {
      sets.push("payment_followup_enabled = @payment_followup_enabled");
      request.input("payment_followup_enabled", sql.Bit, body.payment_followup_enabled ? 1 : 0);
    }
    if (body.survey_time_slot !== undefined) {
      sets.push("survey_time_slot = @survey_time_slot");
      request.input("survey_time_slot", sql.NVarChar(100), body.survey_time_slot);
    }
    if (body.zone !== undefined) {
      sets.push("zone = @zone");
      request.input("zone", sql.NVarChar(100), body.zone);
    }
    if (body.survey_confirmed !== undefined) {
      sets.push("survey_confirmed = @survey_confirmed");
      request.input("survey_confirmed", sql.Bit, body.survey_confirmed ? 1 : 0);
    }
    // pre_residence_type — moved to lead_data table (migration 037).
    // Collected in leadDataPatch; UPSERTed after the leads UPDATE below.
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
    if (body.quotation_accepted_idx !== undefined) {
      sets.push("quotation_accepted_idx = @quotation_accepted_idx");
      request.input("quotation_accepted_idx", sql.Int, body.quotation_accepted_idx);
    }
    if (body.order_installments !== undefined) {
      // Guard: an installment that's already confirmed (payments.confirmed_at IS NOT NULL)
      // can't be edited or removed. Block updates that would shrink the array
      // below a paid index, or change a paid row's pct/method/loan_bank/when.
      try {
        const newArr: Array<{ pct?: number; when?: string; method?: string; loan_bank?: string | null }> = body.order_installments ? JSON.parse(body.order_installments) : [];
        if (Array.isArray(newArr)) {
          const paidRows = await db.request()
            .input("lead_id", sql.Int, leadId)
            .query(`
              SELECT slip_field FROM payments
              WHERE lead_id = @lead_id
                AND confirmed_at IS NOT NULL
                AND slip_field LIKE 'order_installment_%'
            `);
          const paidIdx = paidRows.recordset
            .map((r: { slip_field: string }) => parseInt(r.slip_field.replace("order_installment_", "")))
            .filter((n: number) => !isNaN(n));
          // 1. Shrink check
          for (const idx of paidIdx) {
            if (idx >= newArr.length) {
              return NextResponse.json({ error: `งวดที่ ${idx + 1} ชำระแล้ว — ลบ/ลดจำนวนงวดไม่ได้ ต้องถอน confirm ก่อน` }, { status: 409 });
            }
          }
          // 2. Compare paid rows with prior values — frontend should already block, but verify here too
          const prevRow = await db.request().input("id", sql.Int, leadId).query(`SELECT order_installments FROM leads WHERE id = @id`);
          const prevArr = prevRow.recordset[0]?.order_installments ? JSON.parse(prevRow.recordset[0].order_installments) : [];
          for (const idx of paidIdx) {
            const prev = prevArr[idx];
            const next = newArr[idx];
            if (!prev || !next) continue;
            const changed = prev.pct !== next.pct || prev.when !== next.when || prev.method !== next.method || prev.loan_bank !== next.loan_bank;
            if (changed) {
              return NextResponse.json({ error: `งวดที่ ${idx + 1} ชำระแล้ว — แก้ไขข้อมูลไม่ได้ ต้องถอน confirm ก่อน` }, { status: 409 });
            }
          }
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          return NextResponse.json({ error: "Invalid order_installments JSON" }, { status: 400 });
        }
        // Not a validation error — re-throw to outer catch
        throw e;
      }
      sets.push("order_installments = @order_installments");
      request.input("order_installments", sql.NVarChar(sql.MAX), body.order_installments);
    }
    const quotationPricingTouched =
      body.order_total !== undefined ||
      body.order_discount_pct !== undefined ||
      body.order_discount_amount !== undefined ||
      body.order_discount_note !== undefined;
    let lockedQuotationPricing: {
      total: number;
      discountPct: number;
      discountAmount: number;
      discountNote: string | null;
    } | null = null;
    if (quotationPricingTouched) {
      const quotationState = await db
        .request()
        .input("lead_id", sql.Int, leadId)
        .query(`
          SELECT quotation_files, quotation_accepted_idx
          FROM leads
          WHERE id = @lead_id
        `);
      const quotationRow = quotationState.recordset[0];
      const acceptedIndex =
        body.quotation_accepted_idx !== undefined &&
        body.quotation_accepted_idx !== null
          ? Number(body.quotation_accepted_idx)
          : quotationRow?.quotation_accepted_idx;
      try {
        const quotationOptions = quotationRow?.quotation_files
          ? JSON.parse(quotationRow.quotation_files)
          : [];
        const selected = Array.isArray(quotationOptions)
          ? quotationOptions[acceptedIndex]
          : null;
        if (
          selected &&
          Object.prototype.hasOwnProperty.call(selected, "subtotal") &&
          Number(selected.discount_amount || 0) > 0
        ) {
          const total = Math.max(0, Number(selected.subtotal) || 0);
          const discountAmount = Math.min(
            total,
            Math.max(0, Number(selected.discount_amount) || 0),
          );
          lockedQuotationPricing = {
            total,
            discountPct:
              total > 0
                ? Math.round((discountAmount / total) * 10000) / 100
                : 0,
            discountAmount,
            discountNote: selected.discount_label || null,
          };
        }
      } catch {
        // Legacy quotation_files may be CSV. Those rows remain editable.
      }
    }
    if (body.order_total !== undefined) {
      sets.push("order_total = @order_total");
      request.input(
        "order_total",
        sql.Decimal(12, 2),
        lockedQuotationPricing?.total ?? body.order_total,
      );
    }
    if (body.order_discount_pct !== undefined) {
      sets.push("order_discount_pct = @order_discount_pct");
      request.input(
        "order_discount_pct",
        sql.Decimal(5, 2),
        lockedQuotationPricing?.discountPct ?? body.order_discount_pct,
      );
    }
    if (body.order_discount_amount !== undefined) {
      sets.push("order_discount_amount = @order_discount_amount");
      request.input(
        "order_discount_amount",
        sql.Decimal(12, 2),
        lockedQuotationPricing?.discountAmount ?? body.order_discount_amount,
      );
    }
    if (body.order_discount_note !== undefined) {
      sets.push("order_discount_note = @order_discount_note");
      request.input(
        "order_discount_note",
        sql.NVarChar(200),
        lockedQuotationPricing
          ? lockedQuotationPricing.discountNote
          : body.order_discount_note,
      );
    }
    // Enforce sum=100 invariant — order_pct_before + order_pct_after must
    // equal 100 whenever both are touched. If only one side is sent, derive
    // the other so the row never lands in an inconsistent state.
    if (body.order_pct_before !== undefined && body.order_pct_after !== undefined) {
      const b = Number(body.order_pct_before);
      const a = Number(body.order_pct_after);
      if (b + a !== 100) {
        return NextResponse.json({ error: `order_pct_before + order_pct_after must = 100 (got ${b} + ${a} = ${b + a})` }, { status: 400 });
      }
      sets.push("order_pct_before = @order_pct_before", "order_pct_after = @order_pct_after");
      request.input("order_pct_before", sql.Int, b);
      request.input("order_pct_after", sql.Int, a);
    } else if (body.order_pct_before !== undefined) {
      const b = Number(body.order_pct_before);
      sets.push("order_pct_before = @order_pct_before", "order_pct_after = @order_pct_after");
      request.input("order_pct_before", sql.Int, b);
      request.input("order_pct_after", sql.Int, 100 - b);
    } else if (body.order_pct_after !== undefined) {
      const a = Number(body.order_pct_after);
      sets.push("order_pct_after = @order_pct_after", "order_pct_before = @order_pct_before");
      request.input("order_pct_after", sql.Int, a);
      request.input("order_pct_before", sql.Int, 100 - a);
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
      request.input("install_date", sql.Date, body.install_date ? toSqlDate(body.install_date) : null);
    }
    if (body.install_date_end !== undefined) {
      sets.push("install_date_end = @install_date_end");
      request.input("install_date_end", sql.Date, body.install_date_end ? toSqlDate(body.install_date_end) : null);
    }
    if (body.install_time_slot !== undefined) {
      sets.push("install_time_slot = @install_time_slot");
      request.input("install_time_slot", sql.NVarChar(100), body.install_time_slot);
    }
    if (body.install_confirmed !== undefined) {
      sets.push("install_confirmed = @install_confirmed");
      request.input("install_confirmed", sql.Bit, body.install_confirmed ? 1 : 0);
    }
    if (body.install_photos !== undefined) {
      sets.push("install_photos = @install_photos");
      request.input("install_photos", sql.NVarChar(sql.MAX), body.install_photos);
    }
    if (body.install_photos_extra !== undefined) {
      sets.push("install_photos_extra = @install_photos_extra");
      request.input("install_photos_extra", sql.NVarChar(sql.MAX), body.install_photos_extra);
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
    if (body.install_customer_signature_url !== undefined) {
      sets.push("install_customer_signature_url = @install_customer_signature_url");
      request.input("install_customer_signature_url", sql.NVarChar(500), body.install_customer_signature_url);
    }
    if (body.install_completed_at !== undefined) {
      // install_completed_at = audit timestamp of when the "ติดตั้งเสร็จ"
      // button was pressed. install_actual_date holds the user-picked
      // วันที่ติดตั้งจริง separately and is the display source of truth.
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
    if (body.survey_photos_extra !== undefined) {
      sets.push("survey_photos_extra = @survey_photos_extra");
      request.input("survey_photos_extra", sql.NVarChar(sql.MAX), body.survey_photos_extra);
    }
    if (body.survey_photo_notes !== undefined) {
      sets.push("survey_photo_notes = @survey_photo_notes");
      request.input("survey_photo_notes", sql.NVarChar(sql.MAX), body.survey_photo_notes);
    }
    if (body.survey_electrical_phase !== undefined) {
      sets.push("survey_electrical_phase = @survey_electrical_phase");
      request.input("survey_electrical_phase", sql.NVarChar(20), body.survey_electrical_phase);
    }
    if (body.survey_wants_battery !== undefined) {
      sets.push("survey_wants_battery = @survey_wants_battery");
      request.input("survey_wants_battery", sql.NVarChar(20), body.survey_wants_battery);
    }
    if (body.survey_customize_items !== undefined) {
      sets.push("survey_customize_items = @survey_customize_items");
      request.input("survey_customize_items", sql.NVarChar(sql.MAX), body.survey_customize_items);
    }
    if (body.survey_panel_count !== undefined) {
      sets.push("survey_panel_count = @survey_panel_count");
      request.input("survey_panel_count", sql.Int, body.survey_panel_count);
    }
    if (body.survey_monthly_bill !== undefined) {
      sets.push("survey_monthly_bill = @survey_monthly_bill");
      request.input("survey_monthly_bill", sql.Int, body.survey_monthly_bill);
    }
    if (body.survey_appliances !== undefined) {
      sets.push("survey_appliances = @survey_appliances");
      request.input("survey_appliances", sql.NVarChar(200), Array.isArray(body.survey_appliances) ? body.survey_appliances.join(",") : body.survey_appliances);
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
    if (body.survey_roof_orientation_notes !== undefined) {
      sets.push("survey_roof_orientation_notes = @survey_roof_orientation_notes");
      request.input("survey_roof_orientation_notes", sql.NVarChar(1000), body.survey_roof_orientation_notes);
    }
    if (body.survey_floors !== undefined) {
      sets.push("survey_floors = @survey_floors");
      request.input("survey_floors", sql.Int, body.survey_floors);
    }
    if (body.survey_roof_area_m2 !== undefined) {
      sets.push("survey_roof_area_m2 = @survey_roof_area_m2");
      request.input("survey_roof_area_m2", sql.Int, body.survey_roof_area_m2);
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
    if (body.survey_roof_tilt !== undefined) {
      sets.push("survey_roof_tilt = @survey_roof_tilt");
      request.input("survey_roof_tilt", sql.Int, body.survey_roof_tilt);
    }
    // PDF — section 2 (Electrical)
    if (body.survey_voltage_ln !== undefined) {
      sets.push("survey_voltage_ln = @survey_voltage_ln");
      request.input("survey_voltage_ln", sql.Decimal(6, 2), body.survey_voltage_ln);
    }
    if (body.survey_voltage_ll !== undefined) {
      sets.push("survey_voltage_ll = @survey_voltage_ll");
      request.input("survey_voltage_ll", sql.Decimal(6, 2), body.survey_voltage_ll);
    }
    if (body.survey_mdb_brand !== undefined) {
      sets.push("survey_mdb_brand = @survey_mdb_brand");
      request.input("survey_mdb_brand", sql.NVarChar(100), body.survey_mdb_brand);
    }
    if (body.survey_mdb_model !== undefined) {
      sets.push("survey_mdb_model = @survey_mdb_model");
      request.input("survey_mdb_model", sql.NVarChar(100), body.survey_mdb_model);
    }
    if (body.survey_mdb_slots !== undefined) {
      sets.push("survey_mdb_slots = @survey_mdb_slots");
      request.input("survey_mdb_slots", sql.NVarChar(100), body.survey_mdb_slots);
    }
    if (body.survey_breaker_type !== undefined) {
      sets.push("survey_breaker_type = @survey_breaker_type");
      request.input("survey_breaker_type", sql.NVarChar(50), body.survey_breaker_type);
    }
    if (body.survey_main_breaker_amp !== undefined) {
      sets.push("survey_main_breaker_amp = @survey_main_breaker_amp");
      request.input("survey_main_breaker_amp", sql.NVarChar(50), body.survey_main_breaker_amp);
    }
    if (body.survey_main_cable_sqmm !== undefined) {
      sets.push("survey_main_cable_sqmm = @survey_main_cable_sqmm");
      request.input("survey_main_cable_sqmm", sql.NVarChar(50), body.survey_main_cable_sqmm);
    }
    if (body.survey_panel_to_inverter_m !== undefined) {
      sets.push("survey_panel_to_inverter_m = @survey_panel_to_inverter_m");
      request.input("survey_panel_to_inverter_m", sql.Decimal(6, 2), body.survey_panel_to_inverter_m);
    }
    // PDF — section 3 (Roof structure)
    if (body.survey_roof_structure !== undefined) {
      sets.push("survey_roof_structure = @survey_roof_structure");
      request.input("survey_roof_structure", sql.NVarChar(50), body.survey_roof_structure);
    }
    if (body.survey_roof_width_m !== undefined) {
      sets.push("survey_roof_width_m = @survey_roof_width_m");
      request.input("survey_roof_width_m", sql.Decimal(6, 2), body.survey_roof_width_m);
    }
    if (body.survey_roof_length_m !== undefined) {
      sets.push("survey_roof_length_m = @survey_roof_length_m");
      request.input("survey_roof_length_m", sql.Decimal(6, 2), body.survey_roof_length_m);
    }
    // PDF — section 4 (Installation planning)
    if (body.survey_inverter_location !== undefined) {
      sets.push("survey_inverter_location = @survey_inverter_location");
      request.input("survey_inverter_location", sql.NVarChar(30), body.survey_inverter_location);
    }
    if (body.survey_wifi_signal !== undefined) {
      sets.push("survey_wifi_signal = @survey_wifi_signal");
      request.input("survey_wifi_signal", sql.NVarChar(30), body.survey_wifi_signal);
    }
    if (body.survey_access_method !== undefined) {
      sets.push("survey_access_method = @survey_access_method");
      request.input("survey_access_method", sql.NVarChar(30), body.survey_access_method);
    }
    if (body.survey_photo_building_url !== undefined) {
      sets.push("survey_photo_building_url = @survey_photo_building_url");
      request.input("survey_photo_building_url", sql.NVarChar(500), body.survey_photo_building_url);
    }
    if (body.survey_photo_roof_structure_url !== undefined) {
      sets.push("survey_photo_roof_structure_url = @survey_photo_roof_structure_url");
      request.input("survey_photo_roof_structure_url", sql.NVarChar(500), body.survey_photo_roof_structure_url);
    }
    if (body.survey_photo_mdb_url !== undefined) {
      sets.push("survey_photo_mdb_url = @survey_photo_mdb_url");
      request.input("survey_photo_mdb_url", sql.NVarChar(500), body.survey_photo_mdb_url);
    }
    if (body.survey_photo_inverter_point_url !== undefined) {
      sets.push("survey_photo_inverter_point_url = @survey_photo_inverter_point_url");
      request.input("survey_photo_inverter_point_url", sql.NVarChar(500), body.survey_photo_inverter_point_url);
    }
    if (body.survey_layout_sketch_url !== undefined) {
      sets.push("survey_layout_sketch_url = @survey_layout_sketch_url");
      request.input("survey_layout_sketch_url", sql.NVarChar(500), body.survey_layout_sketch_url);
    }
    if (body.survey_recommended_kw !== undefined) {
      sets.push("survey_recommended_kw = @survey_recommended_kw");
      request.input("survey_recommended_kw", sql.Decimal(5, 1), body.survey_recommended_kw);
    }
    if (body.survey_customer_signature_url !== undefined) {
      sets.push("survey_customer_signature_url = @survey_customer_signature_url");
      request.input("survey_customer_signature_url", sql.NVarChar(500), body.survey_customer_signature_url);
    }
    if (body.survey_lat !== undefined) {
      sets.push("survey_lat = @survey_lat");
      request.input("survey_lat", sql.Decimal(10, 7), body.survey_lat);
    }
    if (body.survey_lng !== undefined) {
      sets.push("survey_lng = @survey_lng");
      request.input("survey_lng", sql.Decimal(10, 7), body.survey_lng);
    }
    // pre_monthly_bill / electrical_phase / wants_battery / roof_shape /
    // appliances / ac_units / peak_usage / bill_photo_url — all moved to
    // lead_data table (migration 037). Collected via leadDataPatch and
    // UPSERTed after the leads UPDATE; per-field if-blocks removed here.
    // pre_primary_reason stays on leads (not in PreSurveyForm scope).
    if (body.pre_primary_reason !== undefined) {
      sets.push("pre_primary_reason = @pre_primary_reason");
      request.input("pre_primary_reason", sql.NVarChar(50), body.pre_primary_reason);
    }
    if (body.pre_slip_url !== undefined) {
      sets.push("pre_slip_url = @pre_slip_url");
      request.input("pre_slip_url", sql.NVarChar(500), body.pre_slip_url);
    }
    // receipt_*_actual_url store a JSON array of up to 5 URLs (migration 027).
    // Legacy rows may still hold a single URL string — front-end parser unwraps
    // either form. Server just persists whatever payload it gets.
    if (body.receipt_deposit_actual_url !== undefined) {
      sets.push("receipt_deposit_actual_url = @receipt_deposit_actual_url");
      request.input("receipt_deposit_actual_url", sql.NVarChar(sql.MAX), body.receipt_deposit_actual_url);
    }
    if (body.receipt_order_before_actual_url !== undefined) {
      sets.push("receipt_order_before_actual_url = @receipt_order_before_actual_url");
      request.input("receipt_order_before_actual_url", sql.NVarChar(sql.MAX), body.receipt_order_before_actual_url);
    }
    if (body.receipt_order_after_actual_url !== undefined) {
      sets.push("receipt_order_after_actual_url = @receipt_order_after_actual_url");
      request.input("receipt_order_after_actual_url", sql.NVarChar(sql.MAX), body.receipt_order_after_actual_url);
    }
    if (body.pre_doc_no !== undefined) {
      const v = await validateDocNo(db, "booking", body.pre_doc_no);
      if (!v.ok) return NextResponse.json({ error: `pre_doc_no: ${v.reason}` }, { status: 400 });
      sets.push("pre_doc_no = @pre_doc_no");
      request.input("pre_doc_no", sql.NVarChar(20), body.pre_doc_no);
    }
    if (body.pre_total_price !== undefined) {
      sets.push("pre_total_price = @pre_total_price");
      request.input("pre_total_price", sql.Decimal(12, 2), body.pre_total_price);
    }
    if (body.pre_package_id !== undefined) {
      sets.push("pre_package_id = @pre_package_id");
      request.input("pre_package_id", sql.Int, body.pre_package_id);
    }
    if (body.pre_note !== undefined) {
      sets.push("pre_note = @pre_note");
      request.input("pre_note", sql.NVarChar(sql.MAX), body.pre_note);
    }
    if (body.pre_booked_at !== undefined) {
      sets.push("pre_booked_at = @pre_booked_at");
      request.input("pre_booked_at", sql.DateTime2, body.pre_booked_at ? new Date(body.pre_booked_at) : null);
    }
    if (body.pre_survey_fee_type !== undefined) {
      // ประเภทค่าสำรวจ — only 'free' or 'normal'. Anything else is a coding bug
      // upstream, so reject hard instead of silently coercing. Caller is
      // responsible for sending pre_total_price=0 alongside 'free'.
      const v = body.pre_survey_fee_type;
      if (v !== "free" && v !== "normal") {
        return NextResponse.json({ error: `pre_survey_fee_type must be 'free' or 'normal'` }, { status: 400 });
      }
      sets.push("pre_survey_fee_type = @pre_survey_fee_type");
      request.input("pre_survey_fee_type", sql.NVarChar(10), v);
    }
    if (body.payment_confirmed !== undefined) {
      sets.push("payment_confirmed = @payment_confirmed");
      request.input("payment_confirmed", sql.Bit, body.payment_confirmed ? 1 : 0);
    }
    // Warranty (step 06)
    if (body.warranty_inverter_sn !== undefined) {
      sets.push("warranty_inverter_sn = @warranty_inverter_sn");
      request.input("warranty_inverter_sn", sql.NVarChar(100), body.warranty_inverter_sn);
    }
    if (body.warranty_doc_no !== undefined) {
      const v = await validateDocNo(db, "warranty", body.warranty_doc_no);
      if (!v.ok) return NextResponse.json({ error: `warranty_doc_no: ${v.reason}` }, { status: 400 });
      sets.push("warranty_doc_no = @warranty_doc_no");
      request.input("warranty_doc_no", sql.NVarChar(30), body.warranty_doc_no);
    }
    if (body.warranty_start_date !== undefined) {
      sets.push("warranty_start_date = @warranty_start_date");
      request.input("warranty_start_date", sql.Date, body.warranty_start_date ? toSqlDate(body.warranty_start_date) : null);
    }
    if (body.warranty_end_date !== undefined) {
      sets.push("warranty_end_date = @warranty_end_date");
      request.input("warranty_end_date", sql.Date, body.warranty_end_date ? toSqlDate(body.warranty_end_date) : null);
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
    if (body.warranty_inverter_cert_url !== undefined) {
      sets.push("warranty_inverter_cert_url = @warranty_inverter_cert_url");
      request.input("warranty_inverter_cert_url", sql.NVarChar(500), body.warranty_inverter_cert_url);
    }
    if (body.warranty_panel_cert_url !== undefined) {
      sets.push("warranty_panel_cert_url = @warranty_panel_cert_url");
      request.input("warranty_panel_cert_url", sql.NVarChar(500), body.warranty_panel_cert_url);
    }
    if (body.warranty_panel_serials_url !== undefined) {
      sets.push("warranty_panel_serials_url = @warranty_panel_serials_url");
      request.input("warranty_panel_serials_url", sql.NVarChar(500), body.warranty_panel_serials_url);
    }
    if (body.warranty_other_docs_url !== undefined) {
      sets.push("warranty_other_docs_url = @warranty_other_docs_url");
      request.input("warranty_other_docs_url", sql.NVarChar(sql.MAX), body.warranty_other_docs_url);
    }
    if (body.warranty_inverter_sn_photo_url !== undefined) {
      sets.push("warranty_inverter_sn_photo_url = @warranty_inverter_sn_photo_url");
      request.input("warranty_inverter_sn_photo_url", sql.NVarChar(500), body.warranty_inverter_sn_photo_url);
    }
    if (body.warranty_system_size_kwp !== undefined) {
      sets.push("warranty_system_size_kwp = @warranty_system_size_kwp");
      request.input("warranty_system_size_kwp", sql.Decimal(6, 2), body.warranty_system_size_kwp);
    }
    if (body.warranty_panel_count !== undefined) {
      sets.push("warranty_panel_count = @warranty_panel_count");
      request.input("warranty_panel_count", sql.Int, body.warranty_panel_count);
    }
    if (body.warranty_panel_watt !== undefined) {
      sets.push("warranty_panel_watt = @warranty_panel_watt");
      request.input("warranty_panel_watt", sql.Int, body.warranty_panel_watt);
    }
    if (body.warranty_panel_brand !== undefined) {
      sets.push("warranty_panel_brand = @warranty_panel_brand");
      request.input("warranty_panel_brand", sql.NVarChar(100), body.warranty_panel_brand);
    }
    if (body.warranty_panel_model !== undefined) {
      sets.push("warranty_panel_model = @warranty_panel_model");
      request.input("warranty_panel_model", sql.NVarChar(200), body.warranty_panel_model);
    }
    if (body.warranty_inverter_brand !== undefined) {
      sets.push("warranty_inverter_brand = @warranty_inverter_brand");
      request.input("warranty_inverter_brand", sql.NVarChar(100), body.warranty_inverter_brand);
    }
    if (body.warranty_inverter_kw !== undefined) {
      sets.push("warranty_inverter_kw = @warranty_inverter_kw");
      request.input("warranty_inverter_kw", sql.Decimal(6, 2), body.warranty_inverter_kw);
    }
    if (body.warranty_electrical_phase !== undefined) {
      sets.push("warranty_electrical_phase = @warranty_electrical_phase");
      request.input("warranty_electrical_phase", sql.NVarChar(20), body.warranty_electrical_phase);
    }
    if (body.warranty_battery_brand !== undefined) {
      sets.push("warranty_battery_brand = @warranty_battery_brand");
      request.input("warranty_battery_brand", sql.NVarChar(100), body.warranty_battery_brand);
    }
    if (body.warranty_battery_model !== undefined) {
      sets.push("warranty_battery_model = @warranty_battery_model");
      request.input("warranty_battery_model", sql.NVarChar(200), body.warranty_battery_model);
    }
    if (body.warranty_duration_years !== undefined) {
      sets.push("warranty_duration_years = @warranty_duration_years");
      request.input("warranty_duration_years", sql.Int, body.warranty_duration_years);
    }
    if (body.warranty_om_per_year !== undefined) {
      sets.push("warranty_om_per_year = @warranty_om_per_year");
      request.input("warranty_om_per_year", sql.Int, body.warranty_om_per_year);
    }
    if (body.warranty_battery_kwh !== undefined) {
      sets.push("warranty_battery_kwh = @warranty_battery_kwh");
      request.input("warranty_battery_kwh", sql.Decimal(6, 2), body.warranty_battery_kwh);
    }
    if (body.warranty_has_battery !== undefined) {
      sets.push("warranty_has_battery = @warranty_has_battery");
      request.input("warranty_has_battery", sql.Bit, body.warranty_has_battery ? 1 : 0);
    }
    // Inverter supplied/installed by someone else — the warranty step disables
    // its fields and drops Serial Number / Phase from the required list.
    if (body.warranty_no_inverter !== undefined) {
      sets.push("warranty_no_inverter = @warranty_no_inverter");
      request.input("warranty_no_inverter", sql.Bit, body.warranty_no_inverter ? 1 : 0);
    }
    if (body.warranty_batteries !== undefined) {
      sets.push("warranty_batteries = @warranty_batteries");
      request.input("warranty_batteries", sql.NVarChar(sql.MAX), body.warranty_batteries);
    }
    if (body.warranty_panel_serials !== undefined) {
      sets.push("warranty_panel_serials = @warranty_panel_serials");
      request.input("warranty_panel_serials", sql.NVarChar(sql.MAX), body.warranty_panel_serials);
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
      request.input("grid_erc_submitted_date", sql.Date, body.grid_erc_submitted_date ? toSqlDate(body.grid_erc_submitted_date) : null);
    }
    if (body.grid_submitted_date !== undefined) {
      sets.push("grid_submitted_date = @grid_submitted_date");
      request.input("grid_submitted_date", sql.Date, body.grid_submitted_date ? toSqlDate(body.grid_submitted_date) : null);
    }
    if (body.grid_inspection_date !== undefined) {
      sets.push("grid_inspection_date = @grid_inspection_date");
      request.input("grid_inspection_date", sql.Date, body.grid_inspection_date ? toSqlDate(body.grid_inspection_date) : null);
    }
    if (body.grid_approved_date !== undefined) {
      sets.push("grid_approved_date = @grid_approved_date");
      request.input("grid_approved_date", sql.Date, body.grid_approved_date ? toSqlDate(body.grid_approved_date) : null);
    }
    if (body.grid_meter_changed_date !== undefined) {
      sets.push("grid_meter_changed_date = @grid_meter_changed_date");
      request.input("grid_meter_changed_date", sql.Date, body.grid_meter_changed_date ? toSqlDate(body.grid_meter_changed_date) : null);
    }
    if (body.grid_applicant_type !== undefined) {
      sets.push("grid_applicant_type = @grid_applicant_type");
      request.input("grid_applicant_type", sql.NVarChar(20), body.grid_applicant_type);
    }
    if (body.grid_document_checklist !== undefined) {
      sets.push("grid_document_checklist = @grid_document_checklist");
      request.input("grid_document_checklist", sql.NVarChar(sql.MAX), body.grid_document_checklist);
    }
    if (body.grid_application_doc_url !== undefined) {
      sets.push("grid_application_doc_url = @grid_application_doc_url");
      request.input("grid_application_doc_url", sql.NVarChar(500), body.grid_application_doc_url);
    }
    if (body.grid_permit_doc_url !== undefined) {
      sets.push("grid_permit_doc_url = @grid_permit_doc_url");
      request.input("grid_permit_doc_url", sql.NVarChar(500), body.grid_permit_doc_url);
    }
    if (body.grid_note !== undefined) {
      sets.push("grid_note = @grid_note");
      request.input("grid_note", sql.NVarChar(sql.MAX), body.grid_note);
    }
    // Sheet-sync fields (migration 096)
    if (body.customer_code !== undefined) {
      sets.push("customer_code = @customer_code");
      request.input("customer_code", sql.NVarChar(20), body.customer_code);
    }
    if (body.project_note !== undefined) {
      sets.push("project_note = @project_note");
      request.input("project_note", sql.NVarChar(500), body.project_note);
    }
    if (body.project_name !== undefined) {
      sets.push("project_name = @project_name");
      request.input("project_name", sql.NVarChar(200), body.project_name);
    }
    if (body.project_alias !== undefined) {
      sets.push("project_alias = @project_alias");
      request.input("project_alias", sql.NVarChar(200), body.project_alias);
    }
    if (body.interest_reasons !== undefined) {
      // Stored as comma-separated to match prospects.interest_reasons format.
      // Accept array (joined here) or pre-joined string from the client.
      const value = Array.isArray(body.interest_reasons)
        ? body.interest_reasons.join(",")
        : body.interest_reasons;
      sets.push("interest_reasons = @interest_reasons");
      request.input("interest_reasons", sql.NVarChar(500), value || null);
    }
    if (body.undecided_reason !== undefined) {
      // Overwrites — represents the customer's most recent stated reason for
      // not deciding. Each follow-up replaces the previous value.
      sets.push("undecided_reason = @undecided_reason");
      request.input("undecided_reason", sql.NVarChar(200), body.undecided_reason || null);
    }
    if (body.customer_interest !== undefined) {
      sets.push("customer_interest = @customer_interest");
      request.input("customer_interest", sql.NVarChar(500), body.customer_interest);
    }
    if (body.seeker_type !== undefined) {
      sets.push("seeker_type = @seeker_type");
      request.input("seeker_type", sql.NVarChar(50), body.seeker_type);
    }
    if (body.seeker_name !== undefined) {
      sets.push("seeker_name = @seeker_name");
      request.input("seeker_name", sql.NVarChar(200), body.seeker_name);
    }
    if (body.home_loan_status !== undefined) {
      sets.push("home_loan_status = @home_loan_status");
      request.input("home_loan_status", sql.NVarChar(50), body.home_loan_status);
    }
    if (body.survey_actual_date !== undefined) {
      sets.push("survey_actual_date = @survey_actual_date");
      request.input("survey_actual_date", sql.Date, body.survey_actual_date ? toSqlDate(body.survey_actual_date) : null);
    }
    if (body.survey_actual_by !== undefined) {
      sets.push("survey_actual_by = @survey_actual_by");
      request.input("survey_actual_by", sql.NVarChar(200), body.survey_actual_by);
    }
    if (body.quotation_by !== undefined) {
      sets.push("quotation_by = @quotation_by");
      request.input("quotation_by", sql.NVarChar(200), body.quotation_by);
    }
    if (body.quotation_doc_no !== undefined) {
      const v = await validateDocNo(db, "quotation", body.quotation_doc_no);
      if (!v.ok) return NextResponse.json({ error: `quotation_doc_no: ${v.reason}` }, { status: 400 });
      sets.push("quotation_doc_no = @quotation_doc_no");
      request.input("quotation_doc_no", sql.NVarChar(30), body.quotation_doc_no);
    }
    if (body.quotation_sent_date !== undefined) {
      sets.push("quotation_sent_date = @quotation_sent_date");
      request.input("quotation_sent_date", sql.Date, body.quotation_sent_date ? toSqlDate(body.quotation_sent_date) : null);
    }
    if (body.finance_bank !== undefined) {
      sets.push("finance_bank = @finance_bank");
      request.input("finance_bank", sql.NVarChar(100), body.finance_bank);
    }
    if (body.finance_months !== undefined) {
      sets.push("finance_months = @finance_months");
      request.input("finance_months", sql.Int, body.finance_months);
    }
    if (body.finance_monthly !== undefined) {
      sets.push("finance_monthly = @finance_monthly");
      request.input("finance_monthly", sql.Decimal(12, 2), body.finance_monthly);
    }
    if (body.finance_loan_bank !== undefined) {
      sets.push("finance_loan_bank = @finance_loan_bank");
      request.input("finance_loan_bank", sql.NVarChar(100), body.finance_loan_bank);
    }
    if (body.finance_loan_amount !== undefined) {
      sets.push("finance_loan_amount = @finance_loan_amount");
      request.input("finance_loan_amount", sql.Decimal(12, 2), body.finance_loan_amount);
    }
    if (body.finance_documents !== undefined) {
      sets.push("finance_documents = @finance_documents");
      request.input("finance_documents", sql.NVarChar(sql.MAX), body.finance_documents);
    }
    if (body.install_actual_date !== undefined) {
      sets.push("install_actual_date = @install_actual_date");
      request.input("install_actual_date", sql.Date, body.install_actual_date ? toSqlDate(body.install_actual_date) : null);
    }
    if (body.house_number !== undefined) {
      sets.push("house_number = @house_number");
      request.input("house_number", sql.NVarChar(50), body.house_number);
    }
    if (body.survey_doc_no !== undefined) {
      const v = await validateDocNo(db, "survey", body.survey_doc_no);
      if (!v.ok) return NextResponse.json({ error: `survey_doc_no: ${v.reason}` }, { status: 400 });
      sets.push("survey_doc_no = @survey_doc_no");
      request.input("survey_doc_no", sql.NVarChar(30), body.survey_doc_no);
    }
    // Action-user stamps — set by the step that's being closed so PDFs can
    // render the right signer downstream.
    for (const f of [
      "survey_completed_by", "quote_sent_by", "payment_confirmed_by",
      "order_before_paid_by", "order_after_paid_by",
      "install_completed_by", "warranty_issued_by",
    ]) {
      if (body[f] !== undefined) {
        sets.push(`${f} = @${f}`);
        request.input(f, sql.Int, body[f]);
      }
    }

    if (sets.length === 0 && ldFields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Run the leads UPDATE only when there are columns on leads to update.
    // A payload like { pre_monthly_bill: ... } targets only lead_data and
    // mustn't trigger an empty SET clause on the leads UPDATE.
    let result: { recordset: Record<string, unknown>[] } = { recordset: [] };
    if (sets.length > 0) {
      sets.push("updated_at = GETDATE()");
      result = await request.query(`
        UPDATE leads SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id
      `);
    }

    // ── lead_data UPSERT ────────────────────────────────────────────────
    // MERGE so first-touch on a lead that was created before migration 037
    // (no row in lead_data yet) still works — INSERT path covers it. Field
    // list is built from whatever the caller sent; columns not in the body
    // keep their existing value.
    if (ldFields.length > 0) {
      const ldReq = db.request().input("ld_lead_id", sql.Int, leadId);
      for (const f of ldFields) {
        ldReq.input(`ld_${f.col}`, f.sqlType as never, f.value as never);
      }
      const updateClauses = ldFields.map(f => `${f.col} = @ld_${f.col}`).join(", ");
      const insertCols    = ["lead_id", ...ldFields.map(f => f.col)].join(", ");
      const insertVals    = ["@ld_lead_id", ...ldFields.map(f => `@ld_${f.col}`)].join(", ");
      await ldReq.query(`
        MERGE INTO lead_data WITH (HOLDLOCK) AS t
        USING (SELECT @ld_lead_id AS lead_id) AS s
          ON t.lead_id = s.lead_id
        WHEN MATCHED THEN
          UPDATE SET ${updateClauses}, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (${insertCols}, updated_at)
          VALUES (${insertVals}, SYSUTCDATETIME());
      `);
    }
    // If the leads UPDATE was skipped (only lead_data fields), recordset is
    // empty — caller doesn't get the updated lead echoed. Most callers
    // re-fetch via GET anyway; if any rely on the OUTPUT row, we can do an
    // explicit SELECT here as a follow-up.
    // ────────────────────────────────────────────────────────────────────

    // When the installment plan changes:
    //   1. Drop pending payment rows whose installment index is no longer in the
    //      plan (e.g. shrank from 4 → 2 → indices 2 + 3 are orphans).
    //   2. Sync the amount on remaining pending rows so they match the latest
    //      plan — otherwise the payments table holds stale numbers if the user
    //      edits % without re-opening that row's PaymentSection.
    // Confirmed payments are not touched (historical records).
    if (body.order_installments !== undefined) {
      try {
        const arr = body.order_installments ? JSON.parse(body.order_installments) : [];
        if (Array.isArray(arr)) {
          const count = arr.length;
          // 1. Drop orphans
          await db.request()
            .input("lead_id", sql.Int, leadId)
            .input("count", sql.Int, count)
            .query(`
              DELETE FROM payments
              WHERE lead_id = @lead_id
                AND confirmed_at IS NULL
                AND slip_field LIKE 'order_installment_%'
                AND TRY_CAST(SUBSTRING(slip_field, LEN('order_installment_') + 1, 10) AS INT) >= @count
            `);
          // 2. Sync amount on pending rows that still belong to the plan.
          // Mirrors the frontend math: gross amount per row, then deposit
          // (pre_total_price) credit walked backward — last row gets the
          // 1,000 ค่าสำรวจ first; spillover lands on earlier rows.
          const totalsRes = await db.request().input("id", sql.Int, leadId)
            .query(`SELECT order_total, pre_total_price FROM leads WHERE id = @id`);
          const orderTotal = Number(totalsRes.recordset[0]?.order_total || 0);
          const depositPaid = Number(totalsRes.recordset[0]?.pre_total_price || 0);
          if (orderTotal > 0) {
            const paidRes = await db.request().input("id", sql.Int, leadId)
              .query(`
                SELECT slip_field FROM payments
                WHERE lead_id = @id AND confirmed_at IS NOT NULL
                  AND slip_field LIKE 'order_installment_%'
              `);
            const paidIdxSet = new Set<number>(
              paidRes.recordset
                .map((r: { slip_field: string }) => parseInt(r.slip_field.replace("order_installment_", "")))
                .filter((n: number) => !isNaN(n))
            );
            let autoIdx = arr.length - 1;
            for (let k = arr.length - 1; k >= 0; k--) {
              if (!paidIdxSet.has(k)) { autoIdx = k; break; }
            }
            const earlierSum = arr.reduce((s: number, r: { pct?: number }, idx: number) => idx === autoIdx ? s : s + (Number(r?.pct) || 0), 0);
            const lastPct = Math.max(0, 100 - earlierSum);
            // Gross per row.
            const gross: number[] = arr.map((_r, i) => {
              const pct = i === autoIdx ? lastPct : Number(arr[i]?.pct) || 0;
              return Math.round((orderTotal * pct) / 100);
            });
            // Allocate deposit credit walking backward.
            const credits: number[] = arr.map(() => 0);
            let remaining = depositPaid;
            for (let i = arr.length - 1; i >= 0 && remaining > 0; i--) {
              const c = Math.min(gross[i], remaining);
              credits[i] = c;
              remaining -= c;
            }
            for (let i = 0; i < arr.length; i++) {
              const net = Math.max(0, gross[i] - credits[i]);
              await db.request()
                .input("lead_id", sql.Int, leadId)
                .input("slip_field", sql.NVarChar(50), `order_installment_${i}`)
                .input("amount", sql.Decimal(12, 2), net)
                .query(`
                  UPDATE payments SET amount = @amount
                  WHERE lead_id = @lead_id
                    AND slip_field = @slip_field
                    AND confirmed_at IS NULL
                `);
            }
          }
        }
      } catch (e) {
        console.error("Pending payment sync failed:", e);
      }
    }

    // Appointment activity logs — diff body against the snapshot taken at the
    // top so we can tell "set" (was null, now has value) vs "rescheduled" (was
    // set, value changed).
    //
    // sameDay() must extract YYYY-MM-DD via local-TZ getters, NOT
    // toISOString(): the container runs with TZ=Asia/Bangkok and the mssql
    // driver returns SQL DATE values as local-midnight Date objects (which
    // map to the *previous* UTC day). Using toISOString().slice(0,10) here
    // shifted the day by one and tripped the reschedule branch on every
    // PATCH that re-sent the unchanged install_date / survey_date, producing
    // spurious "X → X" log entries (since fmtThaiDate uses local-TZ
    // formatting and renders both sides as the same Thai date).
    const sameDay = (a: Date | string | null | undefined, b: string | null | undefined) => {
      if (!a && !b) return true;
      if (!a || !b) return false;
      const dt = a instanceof Date ? a : new Date(a);
      const aS = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const bS = String(b).slice(0, 10);
      return aS === bS;
    };
    const logApptChange = async (
      kind: "survey" | "install",
      newDate: string | null,
      newSlot: string | null | undefined,
    ) => {
      const oldDate = kind === "survey" ? oldRow?.survey_date : oldRow?.install_date;
      const oldSlot = kind === "survey" ? oldRow?.survey_time_slot : oldRow?.install_time_slot;
      if (sameDay(oldDate ?? null, newDate) && (newSlot === undefined || newSlot === oldSlot)) return;
      const label = kind === "survey" ? "นัดสำรวจ" : "นัดติดตั้ง";
      const slotPart = newSlot ? ` ${newSlot}` : "";
      if (!oldDate && newDate) {
        await logLeadActivity(db, {
          leadId,
          activityType: "appointment_set",
          title: `${label} ${fmtThaiDate(newDate)}${slotPart}`,
          userId: gate.userId,
        });
      } else if (oldDate && !newDate) {
        await logLeadActivity(db, {
          leadId,
          activityType: "appointment_cancelled",
          title: `ยกเลิก${label} (เดิม ${fmtThaiDate(oldDate)})`,
          userId: gate.userId,
        });
      } else if (oldDate && newDate) {
        await logLeadActivity(db, {
          leadId,
          activityType: "appointment_rescheduled",
          title: `เลื่อน${label} ${fmtThaiDate(oldDate)} → ${fmtThaiDate(newDate)}${slotPart}`,
          userId: gate.userId,
        });
      }
    };
    // Pass nextSlot through as-is — collapsing undefined→null with `?? null`
    // would defeat the `newSlot === undefined` short-circuit in logApptChange
    // and cause a spurious "rescheduled" log whenever the body PATCHes only
    // the date (slot left untouched), since null !== the stored JSON slot.
    if (body.survey_date !== undefined || body.survey_time_slot !== undefined) {
      const nextDate = body.survey_date !== undefined
        ? (body.survey_date ?? null)
        : (oldRow?.survey_date ? new Date(oldRow.survey_date).toISOString().slice(0, 10) : null);
      const nextSlot = body.survey_time_slot !== undefined ? body.survey_time_slot : undefined;
      await logApptChange("survey", nextDate, nextSlot);
    }
    if (body.install_date !== undefined || body.install_time_slot !== undefined) {
      const nextDate = body.install_date !== undefined
        ? (body.install_date ?? null)
        : (oldRow?.install_date ? new Date(oldRow.install_date).toISOString().slice(0, 10) : null);
      const nextSlot = body.install_time_slot !== undefined ? body.install_time_slot : undefined;
      await logApptChange("install", nextDate, nextSlot);
    }
    if (body.next_follow_up !== undefined && !sameDay(oldRow?.next_follow_up ?? null, body.next_follow_up)) {
      await logLeadActivity(db, {
        leadId,
        activityType: body.next_follow_up ? "follow_up" : "follow_up_cleared",
        title: body.next_follow_up
          ? `นัดติดตาม ${fmtThaiDate(body.next_follow_up)}`
          : `ล้างนัดติดตาม`,
        userId: gate.userId,
      });
    }
    if (body.survey_confirmed === true && !oldRow?.survey_confirmed) {
      await logLeadActivity(db, {
        leadId,
        activityType: "appointment_confirmed",
        title: `ยืนยันนัดสำรวจ${oldRow?.survey_date ? ` ${fmtThaiDate(oldRow.survey_date)}` : ""}`,
        userId: gate.userId,
      });
    }
    if (body.install_confirmed === true && !oldRow?.install_confirmed) {
      await logLeadActivity(db, {
        leadId,
        activityType: "appointment_confirmed",
        title: `ยืนยันนัดติดตั้ง${oldRow?.install_date ? ` ${fmtThaiDate(oldRow.install_date)}` : ""}`,
        userId: gate.userId,
      });
    }
    if (body.install_completed_at !== undefined && !oldRow?.install_completed_at) {
      await logLeadActivity(db, {
        leadId,
        activityType: "step_completed",
        title: `ปิดงานติดตั้งเรียบร้อย`,
        userId: gate.userId,
      });
    }

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
        // When marking lost, attach the reason so the activity log shows
        // who-when-why instead of just the status delta.
        const lostNote = body.status === "lost" && body.lost_reason
          ? String(body.lost_reason)
          : null;
        // Stamp the actual user (was hardcoded 1 = Admin, which broke
        // attribution for seeker-driven status changes via sync).
        await db.request()
          .input("lead_id", sql.Int, leadId)
          .input("activity_type", sql.NVarChar(30), "status_change")
          .input("title", sql.NVarChar(200), `Status: ${oldLabel} → ${newLabel}`)
          .input("note", sql.NVarChar(sql.MAX), lostNote)
          .input("old_status", sql.NVarChar(30), oldStatus)
          .input("new_status", sql.NVarChar(30), body.status)
          .input("created_by", sql.Int, gate.userId)
          .query(`
            INSERT INTO lead_activities (lead_id, activity_type, title, note, old_status, new_status, created_by)
            VALUES (@lead_id, @activity_type, @title, @note, @old_status, @new_status, @created_by)
          `);
      }
    }

    // When only lead_data was touched, the UPDATE leads above was skipped so
    // result.recordset is empty. Echo the current row by re-reading so the
    // caller still gets a populated payload (matches the leads-UPDATE path).
    if (result.recordset.length === 0) {
      const fresh = await db.request().input("id", sql.Int, leadId).query(`SELECT * FROM leads WHERE id = @id`);
      return NextResponse.json(fixDates(fresh.recordset)[0]);
    }
    return NextResponse.json(fixDates(result.recordset)[0]);
  } catch (error) {
    console.error("PATCH /api/leads/[id] error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
