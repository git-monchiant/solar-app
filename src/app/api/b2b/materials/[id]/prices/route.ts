import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_MATERIAL_VIEW_ROLES } from "@/lib/b2b/materials";

// ประวัติราคาของรายการ — ล่าสุดก่อน · ทุกฝั่งที่เห็น Master Data ดูได้
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_MATERIAL_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const db = await getB2bDb();
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT p.id, p.old_price, p.new_price, p.note, p.changed_at, u.full_name AS changed_by_name
    FROM b2b_material_prices p
    LEFT JOIN users u ON u.id = p.changed_by
    WHERE p.material_id = @id
    ORDER BY p.changed_at DESC, p.id DESC`);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return NextResponse.json(r.recordset.map((x) => ({ ...x, old_price: num(x.old_price), new_price: num(x.new_price) })));
}
