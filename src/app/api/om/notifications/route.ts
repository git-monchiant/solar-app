import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOmDb } from "@/lib/om/line";
import { countOmUnread, listOmNotifications, markOmRead } from "@/lib/om/notifications";

// กล่องแจ้งเตือนของโมดูล O&M (เฟส 6 ของแผน 20260922-01)
// ★★ แยกจาก /api/notifications ของฝั่งขายโดยตั้งใจ — ห้ามรวม
//   เหตุผลเต็มอยู่หัวไฟล์ src/lib/om/notifications.ts (ข้อ 4.1 + ตาราง om_ ไม่มีบนฐาน v2)
//   ที่นี่ใช้ getOmDb() ซึ่งปฏิเสธฐานที่ชื่อไม่ลงท้าย v3
//
// GET  ?summary=1  → { unread }        · GET  → { items, unread }
// PATCH { all: true } | { id }         → ทำเครื่องหมายว่าอ่านแล้ว

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const db = await getOmDb();
  if (req.nextUrl.searchParams.get("summary") === "1") {
    return NextResponse.json({ unread: await countOmUnread(db, gate.userId) });
  }
  const [items, unread] = await Promise.all([
    listOmNotifications(db, gate.userId),
    countOmUnread(db, gate.userId),
  ]);
  return NextResponse.json({ items, unread });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const all = body.all === true;
  const id = Number(body.id);
  if (!all && (!Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "กรุณาระบุรายการแจ้งเตือน" }, { status: 400 });
  }

  const db = await getOmDb();
  await markOmRead(db, gate.userId, all ? "all" : id);
  return NextResponse.json({ ok: true });
}
