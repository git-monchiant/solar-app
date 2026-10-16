import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";

// POST { text, booking_id? } — บันทึกโน้ตลงไทม์ไลน์ของบ้าน (ปุ่ม Note ในหน้ารายละเอียดงานบริการ)
// ★ 28 ก.ย. 69 แผน 20260928-04 ข้อ 7 — แบบ Note ของหน้า lead ฝั่งขาย
//   ไม่มีตารางใหม่: เขียนเป็น action "note" ใน om_booking_history ที่ไทม์ไลน์อ่านอยู่แล้ว
//   ผูก house_id เสมอ (บ้านที่ยังไม่มีใบงานก็จดได้) · มีใบงานค้างอยู่ก็ผูกใบนั้นด้วย
const MAX = 300;   // ความยาวช่อง reason ของ om_booking_history

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const houseId = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!houseId) return NextResponse.json({ error: "ไม่พบบ้านหลังนี้" }, { status: 404 });
  if (!text) return NextResponse.json({ error: "ต้องพิมพ์โน้ตก่อนบันทึก" }, { status: 400 });
  if (text.length > MAX) return NextResponse.json({ error: `โน้ตยาวเกิน ${MAX} ตัวอักษร` }, { status: 400 });

  const db = await getOmDb();
  const house = (await db.request().input("id", sql.Int, houseId)
    .query(`SELECT id FROM om_houses WHERE id = @id`)).recordset[0];
  if (!house) return NextResponse.json({ error: "ไม่พบบ้านหลังนี้" }, { status: 404 });

  // ใบงานที่ส่งมาต้องเป็นของบ้านนี้จริง — กันโน้ตไปโผล่ในไทม์ไลน์ของบ้านอื่น
  let bookingId: number | null = null;
  if (b.booking_id != null) {
    const bk = (await db.request().input("b", sql.Int, Number(b.booking_id)).input("h", sql.Int, houseId)
      .query(`SELECT id FROM om_bookings WHERE id = @b AND house_id = @h`)).recordset[0];
    if (!bk) return NextResponse.json({ error: "ใบงานนี้ไม่ใช่ของบ้านหลังนี้" }, { status: 400 });
    bookingId = bk.id;
  }

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await logBooking(tx, { houseId, bookingId, action: "note", actorUserId: gate.userId ?? null, reason: text });
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกโน้ตไม่สำเร็จ" }, { status: 500 });
  }
}
