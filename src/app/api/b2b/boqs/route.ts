import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_BOQ_VIEW_ROLES, B2B_BOQ_ROLES, readBoqHeader } from "@/lib/b2b/boq";
import { BoqLimitError, copyBoqLines, nextDocNo, storeTotals } from "@/lib/b2b/boq-server";
import { isClosedStage } from "@/lib/b2b/project";
import { logActivity } from "@/lib/b2b/project-server";

// รายการใบ BOQ — ค่าเริ่มต้นแสดง Rev ล่าสุดของแต่ละเลขที่ · ?all=1 = ทุก revision
// ?all=1 จัดกลุ่มตามเลขที่ (Rev ใหม่ → เก่า) · ลำดับใบยังตามเวลาบันทึกล่าสุดของใบนั้นเหมือนโหมดปกติ
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_VIEW_ROLES);
  if (gate.error) return gate.error;
  const all = req.nextUrl.searchParams.get("all") === "1";
  const db = await getB2bDb();
  const r = await db.request().query(`
    SELECT b.id, b.doc_no, b.revision, b.is_latest, b.project_id, pj.code AS project_code, b.option_label,
           b.project_name, b.customer_name, b.location,
           b.capacity_wp, b.total_cost, b.total_sale, b.margin_pct, b.vat_pct, b.pending_lines, b.created_at, b.updated_at,
           cu.full_name AS created_by_name, uu.full_name AS updated_by_name
    FROM b2b_boqs b
    LEFT JOIN b2b_projects pj ON pj.id = b.project_id
    LEFT JOIN users cu ON cu.id = b.created_by
    LEFT JOIN users uu ON uu.id = b.updated_by
    ${all
      ? "ORDER BY MAX(b.updated_at) OVER (PARTITION BY b.doc_no) DESC, b.doc_no DESC, b.revision DESC"
      : "WHERE b.is_latest = 1 ORDER BY b.updated_at DESC, b.id DESC"}`);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return NextResponse.json(r.recordset.map((b) => ({
    ...b, is_latest: !!b.is_latest, capacity_wp: num(b.capacity_wp), total_cost: num(b.total_cost), total_sale: num(b.total_sale),
    margin_pct: num(b.margin_pct), vat_pct: num(b.vat_pct),
  })));
}

// สร้างใบใหม่ = Rev 0 ของโครงการ (ตัวเลือกขนาด 1 ตัว) แล้วไปเติมรายการในหน้าทำ BOQ
// ★ ต้องมีโครงการ (แผน 20261015-07) — ชื่อโครงการ/ลูกค้า/ที่ตั้งดึงจากโครงการ ไม่รับจากหน้าจอ
// copy_from = คัดลอกบรรทัด + ส่วนเสริม รวม/ทางเลือก + VAT จากใบอื่น (แผน 20261016-02) — ราคาปัจจุบันใน Master (copyBoqLines)
//   Margin ไม่ส่งมา = ใช้ของใบต้นทาง
export async function POST(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_ROLES);
  if (gate.error) return gate.error;
  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.project_id);
  if (!Number.isInteger(projectId) || projectId <= 0) return NextResponse.json({ error: "กรุณาเลือกโครงการ" }, { status: 400 });
  const copyFrom = body.copy_from == null || body.copy_from === "" ? null : Number(body.copy_from);
  if (copyFrom != null && (!Number.isInteger(copyFrom) || copyFrom <= 0)) return NextResponse.json({ error: "ใบ BOQ ต้นทางไม่ถูกต้อง" }, { status: 400 });
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const p = (await new sql.Request(tx).input("p", sql.Int, projectId).query(`
      SELECT p.id, p.name, p.location, p.latitude, p.longitude, p.stage, c.name AS customer_name
      FROM b2b_projects p JOIN b2b_customers c ON c.id = p.customer_id WHERE p.id = @p`)).recordset[0];
    if (!p) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 404 }); }
    if (isClosedStage(p.stage)) { await tx.rollback(); return NextResponse.json({ error: "โครงการปิดอยู่ — เปิดกลับก่อนจึงเพิ่ม BOQ ได้" }, { status: 409 }); }
    const src = copyFrom == null ? null : (await new sql.Request(tx).input("c", sql.Int, copyFrom)
      .query(`SELECT id, doc_no, revision, margin_pct FROM b2b_boqs WHERE id = @c`)).recordset[0];
    if (copyFrom != null && !src) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบ BOQ ต้นทาง" }, { status: 404 }); }
    const noMargin = body.margin_pct == null || body.margin_pct === "";
    const parsed = readBoqHeader({ ...body, project_name: p.name, margin_pct: noMargin && src ? Number(src.margin_pct) : body.margin_pct }, { create: true });
    if ("error" in parsed) { await tx.rollback(); return NextResponse.json({ error: parsed.error }, { status: 400 }); }
    const h = parsed.value;
    const docNo = await nextDocNo(tx);
    const r = await new sql.Request(tx)
      .input("doc", sql.NVarChar(30), docNo)
      .input("pid", sql.Int, p.id)
      .input("label", sql.NVarChar(100), h.option_label)
      .input("project", sql.NVarChar(300), p.name)
      .input("customer", sql.NVarChar(300), p.customer_name)
      .input("location", sql.NVarChar(500), p.location)
      .input("lat", sql.Decimal(9, 6), p.latitude)
      .input("lng", sql.Decimal(9, 6), p.longitude)
      .input("margin", sql.Decimal(6, 3), h.margin_pct)
      .input("note", sql.NVarChar(1000), h.note)
      .input("u", sql.Int, gate.userId)
      .query(`
        INSERT INTO b2b_boqs (doc_no, revision, project_id, option_label, project_name, customer_name, location, latitude, longitude,
                              margin_pct, note, capacity_wp, total_cost, total_sale, created_by, updated_by)
        OUTPUT INSERTED.id, INSERTED.doc_no
        VALUES (@doc, 0, @pid, @label, @project, @customer, @location, @lat, @lng, @margin, @note, 0, 0, 0, @u, @u)`);
    const newId = r.recordset[0].id as number;
    let copied: { lines: number; inactive: number } | null = null;
    if (src) {
      await new sql.Request(tx).input("id", sql.Int, newId).input("src", sql.Int, src.id).query(`
        UPDATE b SET vat_pct = s.vat_pct, addon_modes = s.addon_modes
        FROM b2b_boqs b CROSS JOIN b2b_boqs s WHERE b.id = @id AND s.id = @src`);
      copied = await copyBoqLines(tx, src.id, newId);
      await storeTotals(tx, newId);
    }
    const from = src ? ` (คัดลอกจาก ${src.doc_no} Rev ${src.revision})` : "";
    await logActivity(tx, p.id, "boq_created", { message: `เพิ่ม BOQ ${docNo}${h.option_label ? ` · ${h.option_label}` : ""}${from}`, userId: gate.userId });
    await tx.commit();
    return NextResponse.json({ ...r.recordset[0], copied }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof BoqLimitError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("POST /api/b2b/boqs error:", e);
    return NextResponse.json({ error: "สร้างใบ BOQ ไม่สำเร็จ" }, { status: 500 });
  }
}
