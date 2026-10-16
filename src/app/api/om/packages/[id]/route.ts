import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { PACKAGE_EDIT_ROLES } from "@/lib/role-permissions";
import { readOmPackageBody } from "@/lib/om/packages";

// PATCH { is_active } อย่างเดียว = สลับสถานะจากป้าย ACTIVE · ส่งครบทุกช่อง = บันทึกจากฟอร์มแก้ไข
// ไม่มี DELETE — เลิกขายใช้ปิดใช้งานแทน (แบบเดียวกับ Package ฝั่งขาย)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, PACKAGE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const db = await getOmDb();
  const request = db.request().input("id", sql.Int, id).input("u", sql.Int, gate.userId);

  let sets: string;
  if (Object.keys(body).length === 1 && typeof body.is_active === "boolean") {
    request.input("is_active", sql.Bit, body.is_active ? 1 : 0);
    sets = "is_active = @is_active";
  } else {
    const parsed = readOmPackageBody(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const b = parsed.value;
    request
      .input("kw_min", sql.Decimal(6, 2), b.kw_min)
      .input("kw_max", sql.Decimal(6, 2), b.kw_max)
      .input("max_panels", sql.Int, b.max_panels)
      .input("plan_type", sql.VarChar(20), b.plan_type)
      .input("contract_months", sql.Int, b.contract_months)
      .input("visits", sql.Int, b.visits)
      .input("price", sql.Decimal(12, 2), b.price)
      .input("scope", sql.NVarChar(500), b.scope)
      .input("is_active", sql.Bit, b.is_active ? 1 : 0);
    sets = `kw_min = @kw_min, kw_max = @kw_max, max_panels = @max_panels, plan_type = @plan_type,
            contract_months = @contract_months, visits = @visits, price = @price, scope = @scope, is_active = @is_active`;
  }
  const r = await request.query(`UPDATE om_packages SET ${sets}, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
  if (r.rowsAffected[0] === 0) return NextResponse.json({ error: "ไม่พบแพ็คเกจ" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
