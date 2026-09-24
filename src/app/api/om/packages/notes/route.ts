import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { PACKAGE_EDIT_ROLES } from "@/lib/role-permissions";

// PUT [{ body }] — แทนหมายเหตุท้ายตารางทั้งชุดตามลำดับที่ส่งมา (อ่านผ่าน GET /api/om/packages)
export async function PUT(req: NextRequest) {
  const gate = await requireAnyRole(req, PACKAGE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const raw = await req.json().catch(() => null);
  if (!Array.isArray(raw)) return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const notes = raw
    .map((n) => (typeof n?.body === "string" ? n.body.trim().slice(0, 1000) : ""))
    .filter(Boolean);

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`DELETE FROM om_package_notes`);
    for (const [i, body] of notes.entries()) {
      await new sql.Request(tx)
        .input("b", sql.NVarChar(1000), body)
        .input("s", sql.Int, i + 1)
        .input("u", sql.Int, gate.userId)
        .query(`INSERT INTO om_package_notes (body, sort_order, updated_by, updated_at) VALUES (@b, @s, @u, SYSDATETIMEOFFSET())`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    console.error("PUT /api/om/packages/notes error:", e);
    return NextResponse.json({ error: "บันทึกหมายเหตุไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: notes.length });
}
