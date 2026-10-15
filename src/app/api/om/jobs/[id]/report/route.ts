import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole, requireAuth } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { failCount, jobNo, type Checks } from "@/lib/om/job-form";
import { loadForm, loadJobReport, loadQcSigner, qcSignerId } from "@/lib/om/job-report";
import { logBooking } from "@/lib/om/booking-log";

// ใบตรวจรับงาน / ใบบริการ ของงานหน้างาน — ★ ตารางเดียว om_job_report
//   ผลตรวจเก็บเป็น JSON แบบเดียวกับ dbo.install_checklists ของระบบขาย (ผู้ใช้สั่ง "อย่าสร้างตารางเยอะ")
// ★ 16 ก.ย. 69: หัวข้อในใบย้ายไปอยู่ในฐานแล้ว (om_job_form + om_job_form_item)
//   แต่ละชนิดงานมีใบของตัวเอง — คำตอบยังเป็น JSON คีย์ = om_job_form_item.code เหมือนเดิม

// ★ 28 ก.ย. 69: การอ่านใบ (เลือกใบตรวจ + ข้อมูลใบงาน) ย้ายไป src/lib/om/job-report.ts
//   ใช้ร่วมกับใบบริการ PDF (/api/om/jobs/[id]/doc) — ข้อมูลในใบ PDF ตรงกับหน้าจอเสมอ
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const db = await getOmDb();
  const data = await loadJobReport(db, id);
  if (!data) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
  // ★ 15 ต.ค. 69 ผู้ใช้สั่งให้ช่อง Q.C. แสดงลายเซ็นอัตโนมัติ — ชุดเดียวกับที่ใบบริการ PDF ใช้
  const qc = await loadQcSigner(db, (data.report as { qc_user_id?: number | null } | null)?.qc_user_id);
  return NextResponse.json({ ...data, qc });
}

// PUT — บันทึกใบตรวจรับงาน (สร้างถ้ายังไม่มี) · ส่ง close: true เพื่อปิดงานไปเลย
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const checks = (b.checks ?? {}) as Checks;

  // ★ พบงานซ่อม (แผน 20260924-02 เฟส 5) — ช่างแจ้ง ทีม O&M เป็นคนเปิดใบงานซ่อมทีหลัง
  //   ส่งคีย์มาเมื่อไรถึงเขียน (แบบเดียวกับ photos) · ติ๊กพบแล้วต้องมีอาการ ไม่งั้นทีมไม่รู้จะเปิดใบซ่อมเรื่องอะไร
  const hasRepair = Object.prototype.hasOwnProperty.call(b, "repair_needed");
  const repairNeeded = hasRepair ? b.repair_needed === true : null;
  const repairDetail = repairNeeded && typeof b.repair_detail === "string" ? b.repair_detail.trim().slice(0, 1000) : "";
  if (repairNeeded && !repairDetail)
    return NextResponse.json({ error: "ติ๊กพบงานซ่อมแล้ว ต้องเล่าอาการ / สิ่งที่ต้องซ่อมด้วย" }, { status: 400 });

  const db = await getOmDb();
  const cur = (await db.request().input("id", sql.Int, id)
    .query(`SELECT id, status FROM om_bookings WHERE id = @id`)).recordset[0];
  if (!cur) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });

  // ใบไหน + ข้อไหนบ้าง — ต้องรู้ก่อนถึงคิด fail_count ได้ และเก็บ form_id ลงใบงานด้วย
  const { head, items } = await loadForm(db, id);
  const fails = failCount(checks, items);
  const qc = await qcSignerId(db);

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
      .input("u", sql.Int, gate.userId ?? null)
      .input("qc", sql.Int, qc)
      .input("hrp", sql.Bit, hasRepair ? 1 : 0)
      .input("rp", sql.Bit, repairNeeded)
      .input("rpd", sql.NVarChar(1000), repairDetail || null);

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
        -- ★ ผู้ลงนาม Q.C. ล็อกตอนลงผลตรวจครั้งแรก แล้วไม่ขยับอีก (ดู qcSignerId)
        qc_user_id = COALESCE(qc_user_id, CASE WHEN @res IS NOT NULL THEN @qc END),
        finished_at = CASE WHEN @res IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE finished_at END,
        repair_needed = CASE WHEN @hrp = 1 THEN @rp ELSE repair_needed END,
        repair_detail = CASE WHEN @hrp = 1 THEN @rpd ELSE repair_detail END,
        updated_at = SYSDATETIMEOFFSET()
      WHERE booking_id = @id`);
    // ★ 29 ก.ย. 69 (เจอตอนทดสอบเส้นเสียเงินครบวงจร แผน 20260929-02): finished_at ต้องลงตั้งแต่แถวแรก
    //   เดิมมีแค่ใน UPDATE — ช่างกดปิดงานเลยโดยไม่เคยบันทึกร่าง = ใบปิดแล้วแต่ไม่มีเวลาปิด
    //   (ใบบริการ PDF พิมพ์วันนัดแทนวันปิด · หน้ารายละเอียดไม่มีวันปิด)
    if (up.rowsAffected[0] === 0)
      await rq().query(`
        INSERT INTO om_job_report (booking_id, form_id, job_no, paper_ref, checks, measures, photos, note,
          result, fail_count, started_at, finished_at, tech_user_id, qc_user_id, tech_sign, cust_sign, cust_name,
          close_method, proxy_reason, lat, lng, gps_accuracy, ip, device, repair_needed, repair_detail)
        VALUES (@id, @fid, @no, @paper, @c, @m, @ph, @n, @res, @fc, SYSDATETIMEOFFSET(),
          CASE WHEN @res IS NOT NULL THEN SYSDATETIMEOFFSET() END, @u,
          CASE WHEN @res IS NOT NULL THEN @qc END, @ts, @cs, @cn,
          @cm, @pr, @lat, @lng, @acc, @ip, @dev, @rp, @rpd)`);

    await logBooking(tx, {
      bookingId: id, action: "check", actorUserId: gate.userId ?? null, actorRole: "technician",
      to: { result: b.result ?? null, fail: fails, close_method: b.close_method ?? null,
            ...(repairNeeded ? { repair: repairDetail } : {}) },
      reason: typeof b.note === "string" ? b.note.trim() || null : null,
    });
    await tx.commit();
    return NextResponse.json({ ok: true, job_no: b.job_no || jobNo(id), form_id: head?.id ?? null });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
