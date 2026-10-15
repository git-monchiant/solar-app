import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_VIEW_ROLES, B2B_PROJECT_ROLES, readProjectBody } from "@/lib/b2b/project";
import { ensureCustomer, loadProject, logActivity, syncBoqHeaders } from "@/lib/b2b/project-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const project = await loadProject(await getB2bDb(), id);
  if (!project) return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 404 });
  return NextResponse.json(project);
}

// แก้ข้อมูลโครงการ (ชื่อ · บริษัท · ผู้ติดต่อ · ที่ตั้ง · ผู้ดูแล · หมายเหตุ) — ขั้นเปลี่ยนผ่าน /actions เท่านั้น
// หัวใบ BOQ (Rev ล่าสุด) ซิงก์ตามโครงการทุกครั้ง · ลง timeline ว่าแก้ช่องไหน
const LABELS: Record<string, string> = {
  name: "ชื่อโครงการ", customer_id: "บริษัทลูกค้า", contact_name: "ผู้ติดต่อ", contact_phone: "เบอร์ผู้ติดต่อ", contact_email: "อีเมลผู้ติดต่อ",
  location: "ที่ตั้ง", latitude: "Latitude", longitude: "Longitude", owner_id: "ผู้ดูแล", note: "หมายเหตุ",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const parsed = readProjectBody(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = parsed.value;
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const cur = (await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT * FROM b2b_projects WITH (UPDLOCK, ROWLOCK) WHERE id = @id`)).recordset[0];
    if (!cur) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 404 }); }
    const customerId = await ensureCustomer(tx, p.customer, gate.userId);
    if (!customerId) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบบริษัทลูกค้าที่เลือก" }, { status: 400 }); }
    const next: Record<string, unknown> = {
      name: p.name, customer_id: customerId, contact_name: p.contact_name, contact_phone: p.contact_phone, contact_email: p.contact_email,
      location: p.location, latitude: p.latitude, longitude: p.longitude, owner_id: p.owner_id, note: p.note,
    };
    // ช่องตัวเลข (Lat/Long จาก DECIMAL · id) เทียบเป็นตัวเลข · ช่องข้อความเทียบตรงตัว (เบอร์ "081…" ห้ามแปลงเป็นเลข)
    const same = (a: unknown, b: unknown) =>
      a == null || b == null ? a == null && b == null : typeof b === "number" ? Number(a) === b : String(a) === String(b);
    const changed = Object.keys(next).filter((k) => !same(cur[k], next[k]));
    if (changed.length === 0) { await tx.rollback(); return NextResponse.json(await loadProject(db, id)); }
    await new sql.Request(tx).input("id", sql.Int, id)
      .input("name", sql.NVarChar(300), p.name).input("cust", sql.Int, customerId)
      .input("cn", sql.NVarChar(150), p.contact_name).input("cp", sql.NVarChar(50), p.contact_phone).input("ce", sql.NVarChar(150), p.contact_email)
      .input("loc", sql.NVarChar(500), p.location).input("lat", sql.Decimal(9, 6), p.latitude).input("lng", sql.Decimal(9, 6), p.longitude)
      .input("owner", sql.Int, p.owner_id).input("note", sql.NVarChar(1000), p.note).input("u", sql.Int, gate.userId)
      .query(`
        UPDATE b2b_projects SET name = @name, customer_id = @cust, contact_name = @cn, contact_phone = @cp, contact_email = @ce,
          location = @loc, latitude = @lat, longitude = @lng, owner_id = @owner, note = @note, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
        WHERE id = @id`);
    await syncBoqHeaders(tx, id);
    await logActivity(tx, id, "edited", { message: `แก้ ${changed.map((k) => LABELS[k] ?? k).join(" · ")}`, userId: gate.userId });
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("PATCH /api/b2b/projects/[id] error:", e);
    return NextResponse.json({ error: "บันทึกโครงการไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json(await loadProject(db, id));
}
