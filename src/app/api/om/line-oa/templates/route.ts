import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { RICH_MENU_TEMPLATES } from "@/lib/om/richmenu-templates";

// เทมเพลตผังเมนู 12 แบบ (ยกจาก sena-ev) — ให้ฝั่งหน้าจอเลือกได้ ไม่ต้อง hardcode 6 ช่อง
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  return NextResponse.json({ templates: RICH_MENU_TEMPLATES });
}
