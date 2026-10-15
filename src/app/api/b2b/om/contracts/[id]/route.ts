import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_OM_ROLES } from "@/lib/b2b/om";
import { loadContract, logOm } from "@/lib/b2b/om-server";

// สัญญา O&M B2B 1 ฉบับ (แผน 20261015-09) — GET รายละเอียด + ครั้งเข้างาน + timeline · PATCH ผู้ประสานงาน/หมายเหตุ
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const c = await loadContract(await getB2bDb(), parseInt((await params).id) || 0);
  if (!c) return NextResponse.json({ error: "ไม่พบสัญญา" }, { status: 404 });
  return NextResponse.json(c);
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id) || 0;
  const b = await req.json().catch(() => ({}));
  const db = await getB2bDb();
  const r = await db.request().input("id", sql.Int, id)
    .input("cn", sql.NVarChar(200), text(b.contact_name, 200)).input("cp", sql.NVarChar(50), text(b.contact_phone, 50))
    .input("n", sql.NVarChar(1000), text(b.note, 1000)).input("u", sql.Int, gate.userId)
    .query(`UPDATE b2b_om_contracts SET contact_name = @cn, contact_phone = @cp, note = @n, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
            WHERE id = @id`);
  if (!r.rowsAffected[0]) return NextResponse.json({ error: "ไม่พบสัญญา" }, { status: 404 });
  await logOm(db, id, null, "edited", `แก้ผู้ประสานงาน/หมายเหตุ${text(b.contact_name, 200) ? ` — ${text(b.contact_name, 200)}` : ""}`, gate.userId);
  return NextResponse.json(await loadContract(db, id));
}
