import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { ACTIVE_STATUS, statusLabel } from "@/lib/om/booking";
import { logBooking } from "@/lib/om/booking-log";
import { omErrorText } from "@/lib/om/api-error";

// เปิดใบงานซ่อมจากใบงาน @id (แผน docs/plan/20260924-02 เฟส 5 · ผู้ใช้เคาะ 28 ก.ย. 69)
//   ช่างติ๊ก "พบงานซ่อม" ในใบตรวจรับงาน → ทีม O&M กดเปิดที่นี่ + เลือกในประกัน/นอกประกัน
//   ในประกัน  = ใบซ่อมเริ่มขั้นติดตาม (เส้นฟรี ข้ามเสนอราคา/ชำระเงิน · ปิดงานไม่ตัดสิทธิ์ล้าง)
//   นอกประกัน = ใบซ่อมเริ่มขั้นเสนอราคา (Sale ออกใบใน OmQuotationPanel ได้ทันที — POST /api/om/quotations
//               รับใบงานที่ยืนอยู่ขั้น quote และยังไม่มีใบอยู่แล้ว)
//
// ★ 1 ใบงาน = 1 เส้นทาง (ข้อ "งานซ่อมที่เจอหน้างาน" ในแผน) — ใบต้นทางต้องปิดแล้ว
//   และบ้านต้องไม่มีใบงานค้างอื่น เพราะหน้างานบริการโชว์ได้ทีละใบต่อบ้าน (#job ใน follow-sql.ts)
//   เปิดซ้อนแล้วใบเดิมจะหายไปจากจอ
// ★ เปิดได้แม้ช่างไม่ได้ติ๊ก — ทีมเห็นปัญหาจากรูป/ลูกค้าโทรตามทีหลังก็ต้องเปิดได้ (อาการบังคับกรอกเสมอ)

// POST { in_warranty: boolean, detail: string }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  if (typeof b.in_warranty !== "boolean")
    return NextResponse.json({ error: "กรุณาเลือกว่างานซ่อมนี้อยู่ในประกันหรือนอกประกัน" }, { status: 400 });
  const detail = typeof b.detail === "string" ? b.detail.trim().slice(0, 1000) : "";
  if (!detail) return NextResponse.json({ error: "กรุณาระบุอาการหรือรายการที่ต้องซ่อม" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
  try {
    const src = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT b.id, b.house_id, b.status, b.owner_user_id
        FROM om_bookings b WITH (UPDLOCK, HOLDLOCK) WHERE b.id = @id`)).recordset[0] as
      { id: number; house_id: number; status: string; owner_user_id: number | null } | undefined;
    if (!src) return fail("ไม่พบใบงานนี้", 404);
    if (src.status !== "closed")
      return fail(`เปิดใบงานซ่อมได้หลังปิดใบงานนี้แล้ว (สถานะปัจจุบัน: ${statusLabel(src.status)})`);

    const child = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT TOP 1 id FROM om_bookings WHERE parent_booking_id = @id AND status <> 'cancelled'`)).recordset[0];
    if (child) return fail(`เปิดใบงานซ่อมจากใบงานนี้ไปแล้ว (ใบงานเลขที่ ${child.id})`);

    const active = (await new sql.Request(tx).input("h", sql.Int, src.house_id).query(`
      SELECT TOP 1 id, status FROM om_bookings WITH (UPDLOCK, HOLDLOCK)
       WHERE house_id = @h AND status IN (${ACTIVE_STATUS.map((s) => `'${s}'`).join(",")})`)).recordset[0];
    if (active)
      return fail(`บ้านนี้มีใบงานที่ยังไม่ปิด (ใบงานเลขที่ ${active.id} · ${statusLabel(active.status)}) — กรุณาปิดใบงานนั้นก่อนเปิดใบงานซ่อม`);

    const type = (await new sql.Request(tx)
      .query(`SELECT TOP 1 id FROM om_service_type WHERE code = N'repair'`)).recordset[0];
    if (!type) return fail("ไม่พบประเภทงาน \"ซ่อม\" ในตั้งค่า", 500);

    const status = b.in_warranty ? "follow" : "quote";
    const newId = (await new sql.Request(tx)
      .input("h", sql.Int, src.house_id).input("t", sql.Int, type.id).input("s", sql.NVarChar(20), status)
      .input("n", sql.NVarChar(sql.MAX), detail).input("u", sql.Int, gate.userId ?? null)
      .input("ow", sql.Int, src.owner_user_id).input("p", sql.Int, id).input("w", sql.Bit, b.in_warranty ? 1 : 0)
      // เจ้าของงานตามใบต้นทาง — คนเดิมคุมบ้านนี้อยู่แล้ว (ว่างได้ ตามที่เคาะ 10 ก.ย.)
      .query(`INSERT INTO om_bookings (house_id, service_type_id, status, note, created_by, source,
                owner_user_id, owner_assigned_at, parent_booking_id, in_warranty)
              OUTPUT INSERTED.id
              VALUES (@h, @t, @s, @n, @u, 'repair', @ow,
                CASE WHEN @ow IS NULL THEN NULL ELSE SYSDATETIMEOFFSET() END, @p, @w)`)).recordset[0].id as number;

    await logBooking(tx, {
      bookingId: newId, houseId: src.house_id, action: "repair_open", actorUserId: gate.userId ?? null,
      to: { from_booking: id, in_warranty: b.in_warranty, status }, reason: detail.slice(0, 300),
    });
    await tx.commit();
    return NextResponse.json({ ok: true, id: newId, status });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: omErrorText(e, "เปิดใบงานซ่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/bookings/[id]/repair") }, { status: 500 });
  }
}
