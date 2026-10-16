import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_ROLES } from "@/lib/b2b/project";

// แก้ข้อมูลบริษัทลูกค้า (ชื่อ · เลขผู้เสียภาษี · สาขา · ที่อยู่) — ทุกโครงการของบริษัทนี้เห็นค่าใหม่
// ชื่อลูกค้าบนหัวใบ BOQ (Rev ล่าสุด) ซิงก์ตาม · Rev เก่าคง snapshot ไว้
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const name = text(b.name, 300);
  if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อบริษัท" }, { status: 400 });
  const taxRaw = text(b.tax_id, 20)?.replace(/[\s-]/g, "") ?? null;
  if (taxRaw && !/^\d{13}$/.test(taxRaw)) return NextResponse.json({ error: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" }, { status: 400 });
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const r = await new sql.Request(tx).input("id", sql.Int, id)
      .input("name", sql.NVarChar(300), name).input("tax", sql.NVarChar(20), taxRaw)
      .input("br", sql.NVarChar(100), text(b.branch, 100)).input("addr", sql.NVarChar(500), text(b.address, 500)).input("u", sql.Int, gate.userId)
      .query(`UPDATE b2b_customers SET name = @name, tax_id = @tax, branch = @br, address = @addr, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
              WHERE id = @id`);
    if (r.rowsAffected[0] === 0) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบบริษัท" }, { status: 404 }); }
    await new sql.Request(tx).input("id", sql.Int, id).input("name", sql.NVarChar(300), name).query(`
      UPDATE b SET customer_name = @name
      FROM b2b_boqs b JOIN b2b_projects p ON p.id = b.project_id
      WHERE p.customer_id = @id AND b.is_latest = 1`);
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("PATCH /api/b2b/customers/[id] error:", e);
    return NextResponse.json({ error: "บันทึกบริษัทไม่สำเร็จ" }, { status: 500 });
  }
}
