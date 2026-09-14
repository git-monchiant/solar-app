import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runSlaSweep } from "@/lib/sla-sweep";

/**
 * สั่งคำนวณ SLA ทุก Lead ด้วยมือ (admin เท่านั้น) — ปกติงานนี้รันเองตามรอบเวลา
 * ใช้ตอนต้องการผลทันที เช่น หลังแก้กติกา SLA หรือแก้ข้อมูลตรงในฐานข้อมูล
 *
 * ค่าเริ่มต้นสั่งแล้วตอบกลับทันที (202) งานวิ่งต่อเบื้องหลังเพราะใช้เวลาหลายนาที
 * ใส่ ?wait=1 เพื่อรอจนจบแล้วรับผลสรุป
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;

  const trigger = `manual:user-${gate.userId}`;
  if (req.nextUrl.searchParams.get("wait") === "1") {
    return NextResponse.json(await runSlaSweep(trigger));
  }
  runSlaSweep(trigger).catch(error => console.error("[sla-sweep] manual run failed:", error));
  return NextResponse.json({ started: true }, { status: 202 });
}
