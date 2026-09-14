/**
 * Next.js เรียก register() ครั้งเดียวตอน server เริ่มทำงาน
 *
 * ใช้ตั้งรอบงานเบื้องหลังคำนวณ SLA (ดู src/lib/sla-sweep.ts) เปิดด้วย
 * SLA_SWEEP_ENABLED=true ซึ่ง deploy_prd.sh ใส่ให้ใน .env ของ prod
 * dev ไม่ได้ตั้งไว้จึงไม่รันเอง เรียกทดสอบผ่าน POST /api/sla/sweep แทน
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SLA_SWEEP_ENABLED !== "true") return;
  // ห้าม await ตัวงาน — register ต้องจบก่อน server รับ request ได้
  const { startSlaSweepSchedule } = await import("@/lib/sla-sweep");
  startSlaSweepSchedule();
}
