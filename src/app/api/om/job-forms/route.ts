import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAnyRole } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ทะเบียนใบตรวจรับงาน — ดูรายการ · ออกเวอร์ชันใหม่ · เปิด/ปิดใช้
// ★ service_type_id = NULL คือ "ใบกลาง" ใช้กับงาน O&M ทุกชนิดที่ยังไม่มีใบเฉพาะของตัวเอง
// ★★ กติกาที่ต้องบังคับที่ "เซิร์ฟเวอร์" ไม่ใช่แค่ซ่อนปุ่มในหน้าจอ:
//    ใบที่มีใบงานอ้างอยู่แล้ว (om_job_report.form_id) ห้ามแก้เนื้อใบ — คำตอบผูกกับ code
//    ถ้าแก้ความหมายทับ ใบงานเก่าจะอ่านผิดแบบเงียบ ๆ ⇒ ต้องออกเวอร์ชันใหม่แทน
const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const db = await getOmDb();
  const r = await db.request().query(`
    SELECT f.id, f.service_type_id, f.version, f.label_th,
           CAST(f.is_active AS int) is_active,
           CONVERT(varchar(33), f.effective_from, 126) effective_from,
           st.code service_code, st.label_th service_label,
           (SELECT COUNT(*) FROM om_job_form_item i WHERE i.form_id = f.id AND i.is_active = 1) items,
           -- ★ จำนวนใบงานที่อ้างใบนี้ = ตัวชี้ขาดว่าแก้ได้หรือต้องออกเวอร์ชันใหม่
           (SELECT COUNT(*) FROM om_job_report r WHERE r.form_id = f.id) used
      FROM om_job_form f
      LEFT JOIN om_service_type st ON st.id = f.service_type_id
     ORDER BY CASE WHEN f.service_type_id IS NULL THEN 0 ELSE 1 END, st.sort_order, f.version DESC;

    SELECT i.id, i.form_id, i.code, i.section, i.label_th, i.kind, i.unit,
           CAST(i.required AS int) required, i.sort_order, CAST(i.is_active AS int) is_active
      FROM om_job_form_item i
     ORDER BY i.form_id, i.sort_order, i.id;

    SELECT id, code, label_th FROM om_service_type WHERE active = 1 ORDER BY sort_order, id;`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return NextResponse.json({ forms: fixDates(rs[0]), items: rs[1], serviceTypes: rs[2] });
}

// POST — ออกเวอร์ชันใหม่จากใบเดิม { from_form_id, activate? }
//        หรือสร้างใบเปล่าของชนิดงาน { service_type_id (null = ใบกลาง), label_th }
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    let serviceTypeId: number | null;
    let label: string;

    if (b.from_form_id) {
      const src = (await new sql.Request(tx).input("id", sql.Int, Number(b.from_form_id))
        .query(`SELECT id, service_type_id, label_th FROM om_job_form WHERE id = @id`)).recordset[0];
      if (!src) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบต้นทาง" }, { status: 404 }); }
      serviceTypeId = src.service_type_id as number | null;
      label = String(b.label_th ?? src.label_th);
    } else {
      serviceTypeId = b.service_type_id === null || b.service_type_id === undefined || b.service_type_id === ""
        ? null : Number(b.service_type_id);
      label = String(b.label_th ?? "").trim();
      if (!label) { await tx.rollback(); return NextResponse.json({ error: "ต้องตั้งชื่อใบ" }, { status: 400 }); }
    }

    // เวอร์ชันถัดไปของชนิดงานนั้น — ★ NULL เทียบด้วย = ไม่ได้ ต้องแยกเคสเอง
    const nextV = (await new sql.Request(tx).input("st", sql.Int, serviceTypeId)
      .query(`SELECT ISNULL(MAX(version), 0) + 1 v FROM om_job_form
               WHERE (service_type_id = @st OR (service_type_id IS NULL AND @st IS NULL))`)).recordset[0].v as number;

    const activate = b.activate !== false;
    // ★ ต่อชนิดงานมีใบ active ได้ใบเดียว (filtered unique index) ⇒ ปิดตัวเดิมก่อนเสมอ
    if (activate)
      await new sql.Request(tx).input("st", sql.Int, serviceTypeId)
        .query(`UPDATE om_job_form SET is_active = 0
                 WHERE is_active = 1 AND (service_type_id = @st OR (service_type_id IS NULL AND @st IS NULL))`);

    const newId = (await new sql.Request(tx)
      .input("st", sql.Int, serviceTypeId).input("v", sql.Int, nextV)
      .input("l", sql.NVarChar(120), label).input("a", sql.Bit, activate ? 1 : 0)
      .query(`INSERT INTO om_job_form (service_type_id, version, label_th, is_active, effective_from)
              OUTPUT INSERTED.id
              VALUES (@st, @v, @l, @a, CASE WHEN @a = 1 THEN SYSDATETIMEOFFSET() ELSE NULL END)`))
      .recordset[0].id as number;

    // ก๊อบข้อจากใบต้นทาง (เฉพาะข้อที่ยังเปิดใช้) — เวอร์ชันใหม่เริ่มจากของเดิมเสมอ
    if (b.from_form_id)
      await new sql.Request(tx).input("src", sql.Int, Number(b.from_form_id)).input("dst", sql.Int, newId)
        .query(`INSERT INTO om_job_form_item (form_id, code, section, label_th, kind, unit, required, sort_order, is_active)
                SELECT @dst, code, section, label_th, kind, unit, required, sort_order, 1
                  FROM om_job_form_item WHERE form_id = @src AND is_active = 1`);

    await tx.commit();
    return NextResponse.json({ ok: true, id: newId, version: nextV }, { status: 201 });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างใบไม่สำเร็จ" }, { status: 500 });
  }
}

// PATCH { form_id, is_active?, label_th? } — เปิด/ปิดใช้ หรือแก้ชื่อใบ
// ★ ชื่อใบแก้ได้แม้ใบถูกใช้แล้ว เพราะไม่กระทบการแปลคำตอบ (คำตอบผูกกับ code ของ "ข้อ" ไม่ใช่ชื่อใบ)
export async function PATCH(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.form_id);
  if (!id) return NextResponse.json({ error: "ต้องระบุใบ" }, { status: 400 });

  const db = await getOmDb();
  const cur = (await db.request().input("id", sql.Int, id)
    .query(`SELECT id, service_type_id, CAST(is_active AS int) is_active FROM om_job_form WHERE id = @id`)).recordset[0];
  if (!cur) return NextResponse.json({ error: "ไม่พบใบนี้" }, { status: 404 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    if (Object.prototype.hasOwnProperty.call(b, "is_active") && b.is_active) {
      await new sql.Request(tx).input("st", sql.Int, cur.service_type_id).input("id", sql.Int, id)
        .query(`UPDATE om_job_form SET is_active = 0
                 WHERE id <> @id AND is_active = 1
                   AND (service_type_id = @st OR (service_type_id IS NULL AND @st IS NULL))`);
    }
    const set: string[] = [];
    if (Object.prototype.hasOwnProperty.call(b, "is_active")) set.push("is_active = @a");
    if (typeof b.label_th === "string" && b.label_th.trim()) set.push("label_th = @l");
    if (!set.length) { await tx.rollback(); return NextResponse.json({ ok: true, unchanged: true }); }

    await new sql.Request(tx).input("id", sql.Int, id)
      .input("a", sql.Bit, b.is_active ? 1 : 0)
      .input("l", sql.NVarChar(120), typeof b.label_th === "string" ? b.label_th.trim() : null)
      .query(`UPDATE om_job_form SET ${set.join(", ")},
                effective_from = CASE WHEN effective_from IS NULL AND @a = 1 THEN SYSDATETIMEOFFSET() ELSE effective_from END
              WHERE id = @id`);
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
