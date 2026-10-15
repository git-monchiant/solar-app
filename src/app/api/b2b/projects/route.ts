import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_OPEN_STAGES, B2B_PROJECT_ROLES, B2B_STAGE, readProjectBody } from "@/lib/b2b/project";
import { ensureCustomer, logActivity, nextProjectCode, projectRowSelect, toProjectRow } from "@/lib/b2b/project-server";

// รายการโครงการ B2B — แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 1
// ?stage= open (ค่าเริ่มต้น = 3100–3900) · เลขขั้น · lost (แพ้งาน + ยกเลิก) · closed · all
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const stage = req.nextUrl.searchParams.get("stage") ?? "open";
  const list = (xs: readonly number[]) => `p.stage IN (${xs.join(",")})`;
  const where =
    stage === "all" ? "1 = 1"
    : stage === "open" ? list(B2B_OPEN_STAGES)
    : stage === "lost" ? list([B2B_STAGE.lost, B2B_STAGE.cancelled])
    : stage === "closed" ? list([B2B_STAGE.closed])
    : /^\d{4}$/.test(stage) ? list([Number(stage)])
    : null;
  if (!where) return NextResponse.json({ error: "stage ไม่ถูกต้อง" }, { status: 400 });
  const db = await getB2bDb();
  const r = await db.request().query(`${projectRowSelect()} WHERE ${where} ORDER BY p.updated_at DESC, p.id DESC`);
  return NextResponse.json(r.recordset.map(toProjectRow));
}

// สร้างโครงการ = ขั้นโอกาสขาย (3100) · ลูกค้าเลือกบริษัทเดิมหรือพิมพ์ใหม่ · ผู้ดูแลค่าเริ่มต้น = คนสร้าง
export async function POST(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const parsed = readProjectBody(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = parsed.value;
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const customerId = await ensureCustomer(tx, p.customer, gate.userId);
    if (!customerId) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบบริษัทลูกค้าที่เลือก" }, { status: 400 }); }
    const code = await nextProjectCode(tx);
    const ins = await new sql.Request(tx)
      .input("code", sql.NVarChar(20), code).input("name", sql.NVarChar(300), p.name).input("cust", sql.Int, customerId)
      .input("cn", sql.NVarChar(150), p.contact_name).input("cp", sql.NVarChar(50), p.contact_phone).input("ce", sql.NVarChar(150), p.contact_email)
      .input("loc", sql.NVarChar(500), p.location).input("lat", sql.Decimal(9, 6), p.latitude).input("lng", sql.Decimal(9, 6), p.longitude)
      .input("owner", sql.Int, p.owner_id ?? gate.userId).input("note", sql.NVarChar(1000), p.note).input("u", sql.Int, gate.userId)
      .query(`
        INSERT INTO b2b_projects (code, name, customer_id, contact_name, contact_phone, contact_email, location, latitude, longitude,
                                  stage, owner_id, note, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@code, @name, @cust, @cn, @cp, @ce, @loc, @lat, @lng, ${B2B_STAGE.lead}, @owner, @note, @u, @u)`);
    const id = ins.recordset[0].id as number;
    await logActivity(tx, id, "created", { to: B2B_STAGE.lead, message: `สร้างโครงการ ${code}`, userId: gate.userId });
    await tx.commit();
    return NextResponse.json({ id, code }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/b2b/projects error:", e);
    return NextResponse.json({ error: "สร้างโครงการไม่สำเร็จ" }, { status: 500 });
  }
}
