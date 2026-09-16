import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ข้อในใบตรวจรับงาน — เพิ่ม · แก้ · ปิด · เรียงลำดับ
// ★★ ด่านสำคัญ: ใบที่มีใบงานอ้างแล้ว (om_job_report.form_id) แก้เนื้อใบไม่ได้เด็ดขาด
//    เพราะคำตอบในใบงานเก่าเก็บเป็น JSON ที่อ้าง code ของข้อ — แก้ความหมายทับ = ใบเก่าอ่านผิดเงียบ ๆ
//    ทางเดียวคือออกเวอร์ชันใหม่ (POST /api/om/job-forms { from_form_id })
const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;
const KINDS = ["bool", "num", "text", "photo"];
const SECTIONS = ["quality", "measure", "photo"];
// ★ code เป็นคีย์ที่ไปโผล่ใน JSON ของคำตอบ — จำกัดให้แคบไว้ก่อน กันอักขระที่ทำ JSON/SQL ยุ่ง
const CODE_RE = /^[A-Za-z0-9_]{1,40}$/;

/** ใบนี้ถูกใช้ไปแล้วกี่ใบงาน — 0 เท่านั้นถึงแก้ได้ */
async function usedCount(db: sql.ConnectionPool, formId: number) {
  const r = await db.request().input("f", sql.Int, formId)
    .query(`SELECT (SELECT COUNT(*) FROM om_job_report WHERE form_id = @f) used,
                   (SELECT COUNT(*) FROM om_job_form WHERE id = @f) exists_`);
  return r.recordset[0] as { used: number; exists_: number };
}

async function guard(db: sql.ConnectionPool, formId: number) {
  if (!formId) return NextResponse.json({ error: "ต้องระบุใบ" }, { status: 400 });
  const { used, exists_ } = await usedCount(db, formId);
  if (!exists_) return NextResponse.json({ error: "ไม่พบใบนี้" }, { status: 404 });
  if (used > 0)
    return NextResponse.json({
      error: `ใบนี้มีใบงานอ้างอยู่ ${used} ใบ จึงแก้ไม่ได้ — ให้กด "ออกเวอร์ชันใหม่" แล้วแก้ที่เวอร์ชันใหม่แทน`,
    }, { status: 409 });
  return null;
}

// POST { form_id, code, section, label_th, kind, unit?, required? } — เพิ่มข้อ
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const formId = Number(b.form_id);

  const db = await getOmDb();
  const blocked = await guard(db, formId);
  if (blocked) return blocked;

  const code = String(b.code ?? "").trim();
  const section = String(b.section ?? "");
  const kind = String(b.kind ?? "");
  const label = String(b.label_th ?? "").trim();
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "รหัสข้อใช้ได้เฉพาะ a-z A-Z 0-9 _ ไม่เกิน 40 ตัว" }, { status: 400 });
  if (!SECTIONS.includes(section)) return NextResponse.json({ error: "หมวดไม่ถูกต้อง" }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "ชนิดข้อไม่ถูกต้อง" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "ต้องใส่ชื่อข้อ" }, { status: 400 });

  // ★ ตัวพิมพ์เล็ก-ใหญ่ถือเป็นคนละ code (คอลัมน์เป็น BIN2) — เช็คซ้ำต้องเทียบแบบ BIN2 ด้วย
  const dup = await db.request().input("f", sql.Int, formId).input("c", sql.NVarChar(40), code)
    .query(`SELECT TOP 1 1 x FROM om_job_form_item
             WHERE form_id = @f AND code = @c COLLATE Latin1_General_BIN2`);
  if (dup.recordset.length) return NextResponse.json({ error: `รหัส ${code} มีอยู่แล้วในใบนี้` }, { status: 409 });

  const r = await db.request()
    .input("f", sql.Int, formId).input("c", sql.NVarChar(40), code)
    .input("s", sql.NVarChar(20), section).input("l", sql.NVarChar(200), label)
    .input("k", sql.NVarChar(10), kind)
    .input("u", sql.NVarChar(10), typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : null)
    .input("rq", sql.Bit, b.required === false ? 0 : 1)
    .query(`INSERT INTO om_job_form_item (form_id, code, section, label_th, kind, unit, required, sort_order, is_active)
            OUTPUT INSERTED.id
            SELECT @f, @c, @s, @l, @k, @u, @rq,
                   ISNULL((SELECT MAX(sort_order) FROM om_job_form_item WHERE form_id = @f), 0) + 10, 1`);
  return NextResponse.json({ ok: true, id: r.recordset[0].id }, { status: 201 });
}

// PATCH { form_id, item_id, label_th?, unit?, required?, is_active? }
//       หรือเรียงลำดับทั้งใบ { form_id, order: [item_id, ...] }
// ★ code / section / kind แก้ไม่ได้หลังสร้าง — เปลี่ยนความหมายของข้อเดิมคือสิ่งที่เราพยายามกันอยู่
export async function PATCH(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const formId = Number(b.form_id);

  const db = await getOmDb();
  const blocked = await guard(db, formId);
  if (blocked) return blocked;

  // เรียงลำดับใหม่ทั้งใบ
  if (Array.isArray(b.order)) {
    const ids = b.order.map(Number).filter((n: number) => Number.isFinite(n));
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      let i = 10;
      for (const id of ids) {
        await new sql.Request(tx).input("id", sql.Int, id).input("f", sql.Int, formId).input("o", sql.Int, i)
          .query(`UPDATE om_job_form_item SET sort_order = @o WHERE id = @id AND form_id = @f`);
        i += 10;
      }
      await tx.commit();
      return NextResponse.json({ ok: true, reordered: ids.length });
    } catch (e) {
      await tx.rollback().catch(() => {});
      return NextResponse.json({ error: e instanceof Error ? e.message : "เรียงลำดับไม่สำเร็จ" }, { status: 500 });
    }
  }

  const itemId = Number(b.item_id);
  if (!itemId) return NextResponse.json({ error: "ต้องระบุข้อ" }, { status: 400 });
  const set: string[] = [];
  if (typeof b.label_th === "string" && b.label_th.trim()) set.push("label_th = @l");
  if (Object.prototype.hasOwnProperty.call(b, "unit")) set.push("unit = @u");
  if (Object.prototype.hasOwnProperty.call(b, "required")) set.push("required = @rq");
  if (Object.prototype.hasOwnProperty.call(b, "is_active")) set.push("is_active = @a");
  if (!set.length) return NextResponse.json({ ok: true, unchanged: true });

  await db.request().input("id", sql.Int, itemId).input("f", sql.Int, formId)
    .input("l", sql.NVarChar(200), typeof b.label_th === "string" ? b.label_th.trim() : null)
    .input("u", sql.NVarChar(10), typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : null)
    .input("rq", sql.Bit, b.required ? 1 : 0)
    .input("a", sql.Bit, b.is_active ? 1 : 0)
    .query(`UPDATE om_job_form_item SET ${set.join(", ")} WHERE id = @id AND form_id = @f`);
  return NextResponse.json({ ok: true });
}

// DELETE ?form_id=&item_id= — ★ ลบจริงได้เฉพาะใบที่ยังไม่มีใบงานอ้าง (guard คุมอยู่แล้ว)
//   ถ้าใบถูกใช้แล้วจะโดน 409 ตั้งแต่ guard — ใบแบบนั้นให้ "ปิดข้อ" ในเวอร์ชันใหม่แทน
export async function DELETE(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const formId = Number(req.nextUrl.searchParams.get("form_id"));
  const itemId = Number(req.nextUrl.searchParams.get("item_id"));

  const db = await getOmDb();
  const blocked = await guard(db, formId);
  if (blocked) return blocked;
  if (!itemId) return NextResponse.json({ error: "ต้องระบุข้อ" }, { status: 400 });

  await db.request().input("id", sql.Int, itemId).input("f", sql.Int, formId)
    .query(`DELETE FROM om_job_form_item WHERE id = @id AND form_id = @f`);
  return NextResponse.json({ ok: true });
}
