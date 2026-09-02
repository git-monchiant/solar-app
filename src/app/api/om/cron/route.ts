import { NextRequest, NextResponse } from "next/server";
import { getOmDb } from "@/lib/om/line";
import { runSweep } from "@/lib/om/sales-sweep";
import { remConfigured } from "@/lib/om/rem";
import { finishSync, logSync, syncProject, syncPromotionsByUnit } from "@/lib/om/rem-sync";
import { sql } from "@/lib/db";

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
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 5, 20);
  const db = await getOmDb();
  const out: Record<string, unknown> = {};

  if (job === "sweep" || job === "all") {
    const logId = await logSync(db, "sales_sweep", "cron", null);
    try {
      const r = await runSweep(db);
      const made = r.results.filter((x) => x.action === "created" || x.action === "linked").length;
      const queued = r.results.filter((x) => x.action === "queued").length;
      await finishSync(db, logId, { status: "ok", fetched: r.scanned, inserted: made, skipped: queued,
        message: `กวาด ${r.scanned} · เข้าระบบ ${made} · เข้าคิว ${queued}` });
      out.sweep = { scanned: r.scanned, committed: made, queued };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "กวาดไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      out.sweep = { error: msg };
    }
  }

  if ((job === "rem" || job === "all") && remConfigured()) {
    // ★ เอาโครงการที่ค้างนานสุดมาก่อน — เรียกซ้ำทุกชั่วโมงแล้วจะวนครบเอง
    const pick = await db.request().input("n", sql.Int, limit).query(`
      SELECT TOP (@n) pj.project_id FROM om_projects pj
      LEFT JOIN (SELECT project_id, MAX(synced_at) at FROM om_rem_units GROUP BY project_id) u
             ON u.project_id = pj.project_id
      WHERE pj.project_type = 'H'
      ORDER BY CASE WHEN u.at IS NULL THEN 0 ELSE 1 END, u.at ASC, pj.project_id`);
    const targets = pick.recordset.map((x) => String(x.project_id));
    const logId = await logSync(db, "rem_sync", targets.join(","), null);
    let rows = 0, skipped = 0;
    const done: unknown[] = [];
    try {
      for (const pid of targets) {
        const r = await syncProject(db, pid);
        rows += r.units + r.transfers;
        if (r.skipped) skipped++;
        done.push(r);
      }
      await finishSync(db, logId, { status: "ok", fetched: rows, inserted: rows, skipped,
        message: `${targets.length} โครงการ · ${rows} แถว` });
      out.rem = { projects: targets.length, rows, skipped };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync ไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", fetched: rows, message: msg });
      out.rem = { error: msg, done };
    }
  }

  // ★ โปรโมชันต้องยิงรายหลัง (ยิงทั้งโครงการได้ไม่ครบ) — ไล่เก็บทีละชุดจนหมด แล้วจะไม่ทำอะไรเอง
  if ((job === "promo" || job === "all") && remConfigured()) {
    const logId = await logSync(db, "rem_promo", "cron", null);
    try {
      const r = await syncPromotionsByUnit(db, Math.min(Number(req.nextUrl.searchParams.get("promo_limit")) || 200, 2000));
      await finishSync(db, logId, { status: "ok", fetched: r.done, inserted: r.rows, skipped: r.failed,
        message: `ดึง ${r.done} หลัง · โปรฯ ${r.rows} แถว · มีโซลาร์ ${r.solar} หลัง · เหลือ ${r.remaining}` });
      out.promo = { done: r.done, rows: r.rows, solar: r.solar, failed: r.failed, remaining: r.remaining };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ดึงโปรโมชันไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      out.promo = { error: msg };
    }
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...out });
}
