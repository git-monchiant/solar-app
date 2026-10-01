import { fixDates, sql } from "@/lib/db";
import type { FormItem, JobForm } from "@/lib/om/job-form";

// อ่านใบตรวจรับงาน / ใบบริการ ของใบงาน 1 ใบ — ใช้ร่วม 2 ที่ (ย้ายออกจาก /api/om/jobs/[id]/report 28 ก.ย. 69)
//   · GET /api/om/jobs/[id]/report — หน้าช่าง / แท็บในหน้ารายละเอียด
//   · GET /api/om/jobs/[id]/doc    — ใบบริการ PDF (แผน 20260928-04 ข้อ 9)
// ★ ที่เดียว ⇒ ข้อมูลในใบ PDF ตรงกับหน้าจอเสมอ

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
export async function loadForm(db: sql.ConnectionPool, bookingId: number) {
  const r = await db.request().input("id", sql.Int, bookingId).query(FORM_SQL);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return {
    head: (rs[0]?.[0] ?? null) as FormHead | null,
    items: (rs[1] ?? []) as unknown as FormItem[],
  };
}

/** ใบงาน + ใบตรวจ (แปลง JSON แล้ว) + หัวข้อในใบ — ไม่พบใบงาน = null */
export async function loadJobReport(db: sql.ConnectionPool, id: number) {
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, b.house_id, b.status, b.team_id, t.name team_name,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at, b.time_slot,
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
           lat, lng, gps_accuracy, evidence_hash, tech_user_id,
           CAST(repair_needed AS int) repair_needed, repair_detail
    FROM om_job_report WHERE booking_id = @id;`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const job = rs[0][0];
  if (!job) return null;
  const rep = rs[1][0] ?? null;
  const { head, items } = await loadForm(db, id);
  return {
    job: fixDates([job])[0],
    report: rep ? {
      ...rep,
      checks: rep.checks ? JSON.parse(String(rep.checks)) : {},
      measures: rep.measures ? JSON.parse(String(rep.measures)) : {},
      photos: rep.photos ? JSON.parse(String(rep.photos)) : [],
    } : null,
    // ★ หัวข้อในใบมาจากฐาน — หน้าช่างวน form.items ไม่มี const ในโค้ดแล้ว
    form: head ? { ...head, items } : null,
  };
}
