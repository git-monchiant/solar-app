import { NextRequest, NextResponse } from "next/server";
import { getOmDb } from "@/lib/om/line";
import { runJobs } from "@/lib/om/cron-jobs";

// ตัวให้ตัวตั้งเวลาข้างนอกเรียก
// ตัดสิน 1 ก.ย.: กวาดงานขายทุก 1 ชั่วโมง ("ถี่ไปก็ไม่ดี จะหน่วงเปล่า ๆ")
// ★ ไม่ใช้ x-user-id เพราะไม่มีคนกด — ใช้ OM_CRON_TOKEN แทน
//
// ตั้งเวลาแบบไหนก็ได้ที่ยิง HTTP ได้ — ตัวอย่าง crontab (ทุกชั่วโมง นาทีที่ 5):
//   5 * * * * curl -fsS -m 600 "http://127.0.0.1:3010/api/om/cron?token=XXX&job=all" >/dev/null 2>&1
// ถ้าใช้ pm2:  pm2 start ecosystem.config.js  แล้วเพิ่ม cron_restart ไม่ได้ ต้องใช้ crontab หรือ
//   pm2 start "curl ..." --name om-cron --cron "5 * * * *" --no-autorestart
//
// ?job=sweep  กวาดงานขาย · ?job=rem  ดึงทะเบียน REM 1 ชุด · ?job=promo ดึงโปรโมชันรายหลัง
// ?job=all    ทั้งหมด (ค่าเริ่มต้น)
// ?limit=n    จำนวนโครงการต่อรอบของ rem (ค่าเริ่มต้น 5 · 113 โครงการจะครบใน ~23 ชั่วโมง)

export const maxDuration = 600;

export async function GET(req: NextRequest) {
  const token = process.env.OM_CRON_TOKEN || "";
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้ง OM_CRON_TOKEN" }, { status: 503 });
  if (req.nextUrl.searchParams.get("token") !== token) {
    return NextResponse.json({ error: "token ไม่ถูกต้อง" }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") ?? "all";
  const remLimit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 5, 20);
  const promoLimit = Math.min(Number(req.nextUrl.searchParams.get("promo_limit")) || 200, 2000);
  const db = await getOmDb();

  const all = job === "all";
  const out = await runJobs(db, {
    sweep: all || job === "sweep",
    rem: all || job === "rem",
    reconcile: all || job === "rem" || job === "reconcile",
    promo: all || job === "promo",
  }, { remLimit, promoLimit });

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...out });
}
