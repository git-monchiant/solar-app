import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// บันทึกของขั้นเสนอราคา ระดับใบงาน — ช่อง "บันทึกถึงฝ่ายขาย" ใต้การ์ดใบเสนอราคา (แผน docs/plan/20261002-03)
// ★ แบบ leads.quotation_note ของฝั่งขาย: หน้าจอบันทึกอัตโนมัติทุกครั้งที่หยุดพิมพ์ ⇒ ไม่ลงประวัติใบงาน
//   (ลงทุกครั้งที่พิมพ์จะท่วมไทม์ไลน์) · ใครเห็นใบงานก็เขียนได้ เหมือนช่องของฝั่งขาย

// PUT { note }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 2000) || null : null;
  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, id).input("n", sql.NVarChar(2000), note)
    .query(`UPDATE om_bookings SET quote_note = @n WHERE id = @id`);
  if (!r.rowsAffected[0]) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
