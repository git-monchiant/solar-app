import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_BOQ_ROLES, readBoqHeader } from "@/lib/b2b/boq";
import { nextDocNo } from "@/lib/b2b/boq-server";

// รายการใบ BOQ — ค่าเริ่มต้นแสดง Rev ล่าสุดของแต่ละเลขที่ · ?all=1 = ทุก revision
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_ROLES);
  if (gate.error) return gate.error;
  const all = req.nextUrl.searchParams.get("all") === "1";
  const db = await getB2bDb();
  const r = await db.request().query(`
    SELECT b.id, b.doc_no, b.revision, b.is_latest, b.project_name, b.customer_name, b.location,
           b.capacity_wp, b.total_cost, b.total_sale, b.pending_lines, b.created_at, b.updated_at,
           cu.full_name AS created_by_name, uu.full_name AS updated_by_name
    FROM b2b_boqs b
    LEFT JOIN users cu ON cu.id = b.created_by
    LEFT JOIN users uu ON uu.id = b.updated_by
    ${all ? "" : "WHERE b.is_latest = 1"}
    ORDER BY b.updated_at DESC, b.id DESC`);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return NextResponse.json(r.recordset.map((b) => ({
    ...b, is_latest: !!b.is_latest, capacity_wp: num(b.capacity_wp), total_cost: num(b.total_cost), total_sale: num(b.total_sale),
  })));
}

// สร้างใบใหม่ = Rev 0 ว่างๆ (ชื่อโครงการ · ลูกค้า · ที่ตั้ง) แล้วไปเติมรายการในหน้าทำ BOQ
export async function POST(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_ROLES);
  if (gate.error) return gate.error;
  const parsed = readBoqHeader(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const h = parsed.value;
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const docNo = await nextDocNo(tx);
    const r = await new sql.Request(tx)
      .input("doc", sql.NVarChar(30), docNo)
      .input("project", sql.NVarChar(300), h.project_name)
      .input("customer", sql.NVarChar(300), h.customer_name)
      .input("location", sql.NVarChar(500), h.location)
      .input("lat", sql.Decimal(9, 6), h.latitude)
      .input("lng", sql.Decimal(9, 6), h.longitude)
      .input("margin", sql.Decimal(6, 3), h.margin_pct)
      .input("note", sql.NVarChar(1000), h.note)
      .input("u", sql.Int, gate.userId)
      .query(`
        INSERT INTO b2b_boqs (doc_no, revision, project_name, customer_name, location, latitude, longitude, margin_pct, note,
                              capacity_wp, total_cost, total_sale, created_by, updated_by)
        OUTPUT INSERTED.id, INSERTED.doc_no
        VALUES (@doc, 0, @project, @customer, @location, @lat, @lng, @margin, @note, 0, 0, 0, @u, @u)`);
    await tx.commit();
    return NextResponse.json(r.recordset[0], { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/b2b/boqs error:", e);
    return NextResponse.json({ error: "สร้างใบ BOQ ไม่สำเร็จ" }, { status: 500 });
  }
}
