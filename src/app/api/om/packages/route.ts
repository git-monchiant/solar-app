import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { PACKAGE_EDIT_ROLES } from "@/lib/role-permissions";
import { readOmPackageBody } from "@/lib/om/packages";

// แพ็คเกจบริการ O&M — สิทธิ์แก้ชุดเดียวกับ Package ฝั่งขาย (PACKAGE_EDIT_ROLES)
// GET ?all=1 = รวมตัวที่ปิดใช้งาน (หน้าจัดการ) · ไม่ใส่ = เฉพาะที่เปิดขาย (แคตตาล็อก)
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const all = req.nextUrl.searchParams.get("all") === "1";
  const db = await getOmDb();
  const [pkgs, notes] = await Promise.all([
    db.request().query(`
      SELECT id, kw_min, kw_max, max_panels, plan_type, contract_months, visits, price, scope, is_active
      FROM om_packages ${all ? "" : "WHERE is_active = 1"}
      ORDER BY kw_min, kw_max, CASE plan_type WHEN 'per_visit' THEN 0 ELSE 1 END, contract_months, id`),
    db.request().query(`SELECT id, body FROM om_package_notes ORDER BY sort_order, id`),
  ]);
  const toNum = (v: unknown) => (v == null ? null : Number(v));
  return NextResponse.json({
    packages: pkgs.recordset.map((r) => ({
      ...r, kw_min: Number(r.kw_min), kw_max: Number(r.kw_max), price: Number(r.price),
      max_panels: toNum(r.max_panels), contract_months: toNum(r.contract_months), visits: toNum(r.visits),
    })),
    notes: notes.recordset,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, PACKAGE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const parsed = readOmPackageBody(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const b = parsed.value;
  const db = await getOmDb();
  const r = await db.request()
    .input("kw_min", sql.Decimal(6, 2), b.kw_min)
    .input("kw_max", sql.Decimal(6, 2), b.kw_max)
    .input("max_panels", sql.Int, b.max_panels)
    .input("plan_type", sql.VarChar(20), b.plan_type)
    .input("contract_months", sql.Int, b.contract_months)
    .input("visits", sql.Int, b.visits)
    .input("price", sql.Decimal(12, 2), b.price)
    .input("scope", sql.NVarChar(500), b.scope)
    .input("is_active", sql.Bit, b.is_active ? 1 : 0)
    .input("u", sql.Int, gate.userId)
    .query(`
      INSERT INTO om_packages (kw_min, kw_max, max_panels, plan_type, contract_months, visits, price, scope, is_active, updated_by, updated_at)
      OUTPUT INSERTED.id
      VALUES (@kw_min, @kw_max, @max_panels, @plan_type, @contract_months, @visits, @price, @scope, @is_active, @u, SYSDATETIMEOFFSET())`);
  return NextResponse.json({ id: r.recordset[0].id }, { status: 201 });
}
