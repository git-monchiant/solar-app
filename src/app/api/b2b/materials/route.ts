import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_MATERIAL_EDIT_ROLES, B2B_MATERIAL_VIEW_ROLES, readMaterialBody } from "@/lib/b2b/materials";

// Master Data วัสดุ (BOQ / B2B) — GET ทั้งหมดรวมที่ปิดใช้งาน (หน้าจัดการกรองเอง) · POST = Solar B2B เพิ่มรายการ
// ราคาไม่รับทางนี้ — รายการใหม่เริ่มที่ "รอราคา" แล้ว Purchase ใส่ผ่าน PUT /api/b2b/materials/prices
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_MATERIAL_VIEW_ROLES);
  if (gate.error) return gate.error;
  const db = await getB2bDb();
  const [cats, mats] = await Promise.all([
    db.request().query(`SELECT id, name, is_addon FROM b2b_categories ORDER BY sort_order, id`),
    db.request().query(`
      SELECT m.id, m.code, m.category_id, m.subgroup, m.name, m.brand, m.model, m.spec_watt, m.unit, m.price_basis,
             m.unit_price, m.warranty, m.note, m.sort_order, m.is_active, m.price_updated_at, m.om_role,
             u.full_name AS price_updated_by_name
      FROM b2b_materials m
      LEFT JOIN users u ON u.id = m.price_updated_by
      ORDER BY m.category_id, m.sort_order, m.id`),
  ]);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return NextResponse.json({
    categories: cats.recordset.map((c) => ({ ...c, is_addon: !!c.is_addon })),
    materials: mats.recordset.map((m) => ({
      ...m, is_active: !!m.is_active, spec_watt: num(m.spec_watt), unit_price: num(m.unit_price),
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_MATERIAL_EDIT_ROLES);
  if (gate.error) return gate.error;
  const parsed = readMaterialBody(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const b = parsed.value;
  const db = await getB2bDb();
  const r = await db.request()
    .input("category_id", sql.Int, b.category_id)
    .input("subgroup", sql.NVarChar(200), b.subgroup)
    .input("name", sql.NVarChar(300), b.name)
    .input("brand", sql.NVarChar(150), b.brand)
    .input("model", sql.NVarChar(300), b.model)
    .input("spec_watt", sql.Decimal(10, 2), b.spec_watt)
    .input("unit", sql.NVarChar(30), b.unit)
    .input("price_basis", sql.VarChar(20), b.price_basis)
    .input("warranty", sql.NVarChar(200), b.warranty)
    .input("note", sql.NVarChar(500), b.note)
    .input("sort_order", sql.Int, b.sort_order)
    .input("is_active", sql.Bit, b.is_active ? 1 : 0)
    .input("u", sql.Int, gate.userId)
    .query(`
      INSERT INTO b2b_materials (category_id, subgroup, name, brand, model, spec_watt, unit, price_basis,
                                 warranty, note, sort_order, is_active, created_by)
      OUTPUT INSERTED.id, INSERTED.code
      VALUES (@category_id, @subgroup, @name, @brand, @model, @spec_watt, @unit, @price_basis,
              @warranty, @note, @sort_order, @is_active, @u)`);
  return NextResponse.json(r.recordset[0], { status: 201 });
}
