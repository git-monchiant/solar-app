import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { failCount, jobNo, type Checks, type FormItem, type JobForm } from "@/lib/om/job-form";
import { logBooking } from "@/lib/om/booking-log";

// ใบตรวจรับงาน / ใบบริการ ของงานหน้างาน — ★ ตารางเดียว om_job_report
//   ผลตรวจเก็บเป็น JSON แบบเดียวกับ dbo.install_checklists ของระบบขาย (ผู้ใช้สั่ง "อย่าสร้างตารางเยอะ")
// ★ 16 ก.ย. 69: หัวข้อในใบย้ายไปอยู่ในฐานแล้ว (om_job_form + om_job_form_item)
//   แต่ละชนิดงานมีใบของตัวเอง — คำตอบยังเป็น JSON คีย์ = om_job_form_item.code เหมือนเดิม

/**
 * เลือกใบตรวจของใบงาน @id แล้วคืน 2 recordset: หัวใบ + รายการข้อ
 * ลำดับการเลือก
 *   1. ใบงานเคยบันทึกไว้แล้วว่าใช้ใบไหน (om_job_report.form_id) → ใช้ตัวนั้น
 *      ⇒ ใบเก่าอ่านความหมายออกเสมอ แม้หัวข้อจะถูกแก้ไปแล้ว
 *   2. ใบ active ของชนิดงานนั้น
 *   3. ★ fallback ใบ install ตัว active — ชนิดงานที่ยังไม่ได้ทำใบของตัวเอง
 *      (cleaning / repair / inspect / other ยังรอทีมช่างตอบว่ามีข้อไหนบ้าง — ห้ามเดา)
 */
const FORM_SQL = `
  DECLARE @form INT = (SELECT TOP 1 form_id FROM om_job_report WHERE booking_id = @id);
  DECLARE @fb BIT = 0;
  IF @form IS NULL
    SELECT TOP 1 @form = f.id
      FROM om_job_form f
      JOIN om_bookings b ON b.service_type_id = f.service_type_id
     WHERE b.id = @id AND f.is_active = 1
     ORDER BY f.version DESC;
  -- ★ ใบกลางของงาน O&M (service_type_id IS NULL) — ไม่ใช่ fallback แต่เป็นใบที่ตั้งใจให้ใช้ร่วมกัน
  --   ใบกระดาษจริงเป็นใบเดียวใช้ได้ทุกงาน O&M (เล่ม 049 เลขที่ 2429 ติ๊ก O&M เป็นงานล้างแผง)
  IF @form IS NULL
    SELECT TOP 1 @form = f.id
      FROM om_job_form f
     WHERE f.service_type_id IS NULL AND f.is_active = 1
     ORDER BY f.version DESC;

  -- ★ ต้องเป็น LEFT JOIN — ใบกลางไม่มี service_type_id ถ้า JOIN ธรรมดาใบจะหายทั้งใบ (พังเงียบ)
  SELECT f.id, f.version, f.label_th, st.code service_code, @fb fallback
    FROM om_job_form f
    LEFT JOIN om_service_type st ON st.id = f.service_type_id
   WHERE f.id = @form;

  SELECT id, code, section, label_th, kind, unit, required, sort_order
    FROM om_job_form_item
   WHERE form_id = @form AND is_active = 1
   ORDER BY sort_order, id;`;

type FormHead = Omit<JobForm, "fallback"> & { fallback: boolean };

/** อ่านใบตรวจของใบงานนี้จากฐาน — ใช้ทั้ง GET (ส่งให้หน้าช่าง) และ PUT (คิด fail_count) */
async function loadForm(db: sql.ConnectionPool, bookingId: number) {
  const r = await db.request().input("id", sql.Int, bookingId).query(FORM_SQL);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return {
    head: (rs[0]?.[0] ?? null) as FormHead | null,
    items: (rs[1] ?? []) as unknown as FormItem[],
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, b.house_id, b.status, b.team_id, t.name team_name,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at,
           st.label_th service_type, st.code service_code, CAST(st.consumes_quota AS int) consumes_quota,
           h.house_number, h.project_id, ISNULL(pj.name_th, h.project_name) project_name,
           (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = b.house_id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
           (SELECT TOP 1 p.phone FROM om_house_customers hc
             JOIN om_customer_phones p ON p.customer_id = hc.customer_id
            WHERE hc.house_id = b.house_id AND hc.is_current = 1 AND p.status <> 'invalid'
            ORDER BY p.is_primary DESC, p.id) phone,
           (SELECT STRING_AGG(CAST(COALESCE(i.rem_size_kwp, i.promo_size_kw) AS varchar(12)), ' + ')
              FROM om_installations i WHERE i.house_id = b.house_id
               AND COALESCE(i.rem_size_kwp, i.promo_size_kw) IS NOT NULL) kwp_list
    FROM om_bookings b
    JOIN om_houses h ON h.id = b.house_id
    LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    LEFT JOIN om_service_type st ON st.id = b.service_type_id
    LEFT JOIN om_teams t ON t.id = b.team_id
    WHERE b.id = @id;

    SELECT id, booking_id, form_id, job_no, paper_ref, checks, measures, photos, note, result, fail_count,
           CONVERT(varchar(33), started_at, 126) started_at,
           CONVERT(varchar(33), finished_at, 126) finished_at,
           tech_sign, cust_sign, cust_name, qc_sign, close_method, proxy_reason,
           lat, lng, gps_accuracy, evidence_hash
    FROM om_job_report WHERE booking_id = @id;`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const job = rs[0][0];
  if (!job) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
  const rep = rs[1][0] ?? null;
  const { head, items } = await loadForm(db, id);
  return NextResponse.json({
    job: fixDates([job])[0],
    report: rep ? {
      ...rep,
      checks: rep.checks ? JSON.parse(String(rep.checks)) : {},
      measures: rep.measures ? JSON.parse(String(rep.measures)) : {},
      photos: rep.photos ? JSON.parse(String(rep.photos)) : [],
    } : null,
    // ★ หัวข้อในใบมาจากฐาน — หน้าช่างวน form.items ไม่มี const ในโค้ดแล้ว
    form: head ? { ...head, items } : null,
  });
}

// PUT — บันทึกใบตรวจรับงาน (สร้างถ้ายังไม่มี) · ส่ง close: true เพื่อปิดงานไปเลย
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const checks = (b.checks ?? {}) as Checks;

  const db = await getOmDb();
  const cur = (await db.request().input("id", sql.Int, id)
    .query(`SELECT id, status FROM om_bookings WHERE id = @id`)).recordset[0];
  if (!cur) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });

  // ใบไหน + ข้อไหนบ้าง — ต้องรู้ก่อนถึงคิด fail_count ได้ และเก็บ form_id ลงใบงานด้วย
  const { head, items } = await loadForm(db, id);
  const fails = failCount(checks, items);

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const rq = () => new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("fid", sql.Int, head?.id ?? null)
      .input("no", sql.NVarChar(30), b.job_no || jobNo(id))
      .input("paper", sql.NVarChar(30), b.paper_ref || null)
      .input("c", sql.NVarChar(sql.MAX), JSON.stringify(checks))
      .input("m", sql.NVarChar(sql.MAX), JSON.stringify(b.measures ?? {}))
      // ★ ส่ง photos มาเมื่อไรถึงเขียนทับ — หน้าช่างไม่ได้ส่งคีย์นี้มาด้วยตอนกดบันทึก
      //   ถ้าเขียน [] ทุกครั้ง รูปที่อัปผ่าน /photos ไว้จะหายทุกครั้งที่กดบันทึกร่าง
      .input("ph", sql.NVarChar(sql.MAX),
        Object.prototype.hasOwnProperty.call(b, "photos") ? JSON.stringify(b.photos ?? []) : null)
      .input("n", sql.NVarChar(sql.MAX), typeof b.note === "string" ? b.note.trim() || null : null)
      .input("res", sql.NVarChar(10), b.result === "fail" ? "fail" : b.result === "pass" ? "pass" : null)
      .input("fc", sql.Int, fails)
      .input("ts", sql.NVarChar(sql.MAX), b.tech_sign ?? null)
      .input("cs", sql.NVarChar(sql.MAX), b.cust_sign ?? null)
      .input("cn", sql.NVarChar(120), b.cust_name ?? null)
      .input("cm", sql.NVarChar(20), b.close_method ?? null)
      .input("pr", sql.NVarChar(200), b.proxy_reason ?? null)
      .input("lat", sql.Decimal(9, 6), b.lat ?? null)
      .input("lng", sql.Decimal(9, 6), b.lng ?? null)
      .input("acc", sql.Int, b.gps_accuracy ?? null)
      .input("ip", sql.NVarChar(45), req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
      .input("dev", sql.NVarChar(200), req.headers.get("user-agent")?.slice(0, 200) ?? null)
      .input("u", sql.Int, gate.userId ?? null);

    // ★ เลี่ยง MERGE — UPDATE ก่อน ถ้าไม่โดนแถวค่อย INSERT
    //   form_id ใช้ COALESCE: ใบที่เคยผูกใบตรวจไว้แล้วห้ามย้ายใบกลางคัน
    const up = await rq().query(`
      UPDATE om_job_report SET
        form_id = COALESCE(form_id, @fid),
        job_no = @no, paper_ref = @paper, checks = @c, measures = @m,
        photos = COALESCE(@ph, photos),
        note = @n, result = @res, fail_count = @fc,
        tech_sign = COALESCE(@ts, tech_sign), cust_sign = COALESCE(@cs, cust_sign),
        cust_name = COALESCE(@cn, cust_name), close_method = COALESCE(@cm, close_method),
        proxy_reason = COALESCE(@pr, proxy_reason),
        lat = COALESCE(@lat, lat), lng = COALESCE(@lng, lng), gps_accuracy = COALESCE(@acc, gps_accuracy),
        ip = COALESCE(@ip, ip), device = COALESCE(@dev, device),
        tech_user_id = COALESCE(tech_user_id, @u),
        finished_at = CASE WHEN @res IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE finished_at END,
        updated_at = SYSDATETIMEOFFSET()
      WHERE booking_id = @id`);
    if (up.rowsAffected[0] === 0)
      await rq().query(`
        INSERT INTO om_job_report (booking_id, form_id, job_no, paper_ref, checks, measures, photos, note,
          result, fail_count, started_at, tech_user_id, tech_sign, cust_sign, cust_name,
          close_method, proxy_reason, lat, lng, gps_accuracy, ip, device)
        VALUES (@id, @fid, @no, @paper, @c, @m, @ph, @n, @res, @fc, SYSDATETIMEOFFSET(), @u, @ts, @cs, @cn,
          @cm, @pr, @lat, @lng, @acc, @ip, @dev)`);

    await logBooking(tx, {
      bookingId: id, action: "check", actorUserId: gate.userId ?? null, actorRole: "technician",
      to: { result: b.result ?? null, fail: fails, close_method: b.close_method ?? null },
      reason: typeof b.note === "string" ? b.note.trim() || null : null,
    });
    await tx.commit();
    return NextResponse.json({ ok: true, job_no: b.job_no || jobNo(id), form_id: head?.id ?? null });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
