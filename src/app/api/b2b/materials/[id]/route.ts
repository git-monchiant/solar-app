import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_MATERIAL_EDIT_ROLES, priceSuffix, readMaterialBody, type PriceBasis } from "@/lib/b2b/materials";

// PATCH { is_active } อย่างเดียว = สลับสถานะ · ส่งครบทุกช่อง = บันทึกจากฟอร์ม (แบบเดียวกับ Package O&M)
// ไม่มี DELETE — BOQ เก่าอ้างรายการอยู่ เลิกใช้ = ปิดใช้งาน · ราคาไม่แก้ทางนี้ (เป็นงานของ Purchase)
// ★ เปลี่ยนแบบราคา/หน่วย (ความหมายของราคาเปลี่ยน เช่น บาท/ชิ้น → บาท/Wp) ของรายการที่มีราคา → ล้างราคาเป็น "รอราคา" + ลงประวัติ
//   (ทบทวน BOQ 15 ต.ค.) · บรรทัดที่อยู่ใน BOQ แล้วคง snapshot เดิม ไม่เปลี่ยน
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_MATERIAL_EDIT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const db = await getB2bDb();
  const request = db.request().input("id", sql.Int, id).input("u", sql.Int, gate.userId);

  let sets: string;
  let next: { basis: PriceBasis; unit: string } | null = null;   // แบบราคา/หน่วยใหม่ (บันทึกจากฟอร์ม)
  if (Object.keys(body).length === 1 && typeof body.is_active === "boolean") {
    request.input("is_active", sql.Bit, body.is_active ? 1 : 0);
    sets = "is_active = @is_active";
  } else {
    const parsed = readMaterialBody(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const b = parsed.value;
    next = { basis: b.price_basis, unit: b.unit };
    request
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
      .input("is_active", sql.Bit, b.is_active ? 1 : 0);
    sets = `category_id = @category_id, subgroup = @subgroup, name = @name, brand = @brand, model = @model,
            spec_watt = @spec_watt, unit = @unit, price_basis = @price_basis, warranty = @warranty, note = @note,
            sort_order = @sort_order, is_active = @is_active`;
  }
  let priceReset = false;
  if (next) {
    const cur = (await db.request().input("id", sql.Int, id).query(`SELECT price_basis, unit, unit_price FROM b2b_materials WHERE id = @id`)).recordset[0];
    if (cur && cur.unit_price != null && priceSuffix(cur.price_basis, cur.unit ?? "") !== priceSuffix(next.basis, next.unit)) {
      priceReset = true;
      request.input("note_reset", sql.NVarChar(500), `เปลี่ยนแบบราคา/หน่วย ${priceSuffix(cur.price_basis, cur.unit ?? "")} → ${priceSuffix(next.basis, next.unit)} — ราคาเดิมใช้ไม่ได้ รอ Purchase ใส่ใหม่`);
      sets += ", unit_price = NULL, price_updated_by = @u, price_updated_at = SYSDATETIMEOFFSET()";
    }
  }
  const r = await request.query(`
    ${priceReset ? `INSERT INTO b2b_material_prices (material_id, old_price, new_price, note, changed_by)
                    SELECT id, unit_price, NULL, @note_reset, @u FROM b2b_materials WHERE id = @id;` : ""}
    UPDATE b2b_materials SET ${sets}, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
  if (r.rowsAffected[r.rowsAffected.length - 1] === 0) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  return NextResponse.json({ ok: true, price_reset: priceReset });
}
