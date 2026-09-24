import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { remConfigured } from "@/lib/om/rem";
import { finishSync, logSync, syncProject, syncPromotionsByUnit } from "@/lib/om/rem-sync";
import { reconcileRemLinks } from "@/lib/om/rem-reconcile";
import { runSweep } from "@/lib/om/sales-sweep";
import { getSetting } from "@/lib/om/settings";
import { notifyOmUser } from "@/lib/om/notifications";

// ตัวรันงานเบื้องหลัง — ใช้ร่วมกันทั้ง endpoint /api/om/cron (ตัวตั้งเวลาข้างนอกเรียก)
// และ scheduler ในแอป (instrumentation) · ทุกงานเขียน om_sync_log ดูย้อนได้

export type JobFlags = { sweep?: boolean; rem?: boolean; reconcile?: boolean; promo?: boolean; notify?: boolean };

export async function runJobs(
  db: sql.ConnectionPool, flags: JobFlags, opts: { remLimit?: number; promoLimit?: number; actor?: number | null } = {},
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const actor = opts.actor ?? null;

  // 1) กวาดงานขายที่ติดตั้งเสร็จ → บ้าน O&M
  if (flags.sweep) {
    const logId = await logSync(db, "sales_sweep", "cron", actor);
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

  // 2) ดึงทะเบียน REM — เอาโครงการที่ค้างนานสุดก่อน
  //   scheduler ตั้ง batch สูงพอครอบทุกโครงการ (rem_batch=200) → ดึงครบทุกรอบ ทุก 6 ชม.
  //   ★ cap 200 กันเลขเพี้ยน · endpoint HTTP มี cap เล็กกว่า (20) กัน timeout 600s
  if (flags.rem && remConfigured()) {
    const limit = Math.min(opts.remLimit ?? 5, 200);
    const pick = await db.request().input("n", sql.Int, limit).query(`
      SELECT TOP (@n) pj.project_id FROM om_projects pj
      LEFT JOIN (SELECT project_id, MAX(synced_at) at FROM om_rem_units GROUP BY project_id) u
             ON u.project_id = pj.project_id
      WHERE pj.project_type = 'H'
      ORDER BY CASE WHEN u.at IS NULL THEN 0 ELSE 1 END, u.at ASC, pj.project_id`);
    const targets = pick.recordset.map((x) => String(x.project_id));
    const logId = await logSync(db, "rem_sync", targets.join(","), actor);
    let rows = 0, skipped = 0;
    try {
      for (const pid of targets) {
        const r = await syncProject(db, pid);
        rows += r.units + r.transfers;
        if (r.skipped) skipped++;
      }
      await finishSync(db, logId, { status: "ok", fetched: rows, inserted: rows, skipped,
        message: `${targets.length} โครงการ · ${rows} แถว` });
      out.rem = { projects: targets.length, rows, skipped };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync ไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", fetched: rows, message: msg });
      out.rem = { error: msg };
    }
  }

  // 3) เชื่อมทะเบียนกลับเข้าข้อมูลจริง — บ้านโอนใหม่ได้สัญญา+ชื่อเจ้าของ (แก้บ้านตัวอย่างขายแล้วเอง)
  if (flags.reconcile) {
    const logId = await logSync(db, "rem_reconcile", "cron", actor);
    try {
      const r = await reconcileRemLinks(db);
      await finishSync(db, logId, { status: "ok", inserted: r.contractsLinked + r.owners.created,
        message: `เปิดบ้าน ${r.housesOpened} · เติมระบบ ${r.installationsCreated} · สร้างบ้าน ${r.housesCreated} · เชื่อมสัญญา ${r.contractsLinked} · เติม unit ${r.unitsLinked} · สร้างเจ้าของ ${r.owners.created} · สิทธิ์ ${r.grantsCreated}` });
      out.reconcile = { contractsLinked: r.contractsLinked, unitsLinked: r.unitsLinked, ownersCreated: r.owners.created };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "reconcile ไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      out.reconcile = { error: msg };
    }
  }

  // 4) ดึงของแถม/โซลาร์รายหลัง (SO- เท่านั้น) — ไล่เก็บทีละชุดจนหมด
  if (flags.promo && remConfigured()) {
    const logId = await logSync(db, "rem_promo", "cron", actor);
    try {
      const r = await syncPromotionsByUnit(db, Math.min(opts.promoLimit ?? 200, 2000));
      await finishSync(db, logId, { status: "ok", fetched: r.done, inserted: r.rows, skipped: r.failed,
        message: `ดึง ${r.done} หลัง · โปรฯ ${r.rows} แถว · มีโซลาร์ ${r.solar} หลัง · เหลือ ${r.remaining}` });
      out.promo = { done: r.done, rows: r.rows, solar: r.solar, remaining: r.remaining };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ดึงโปรโมชันไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      out.promo = { error: msg };
    }
  }

  // 5) เตือนเจ้าของเคสก่อนถึงวันนัด (เฟส 6 ของแผน 20260922-01)
  //    ★ ไม่มี SLA ในรอบนี้ (ผู้ใช้สั่งข้ามเฟส 5) — อันนี้คือเตือนตามวันนัดที่มีอยู่จริง ไม่ใช่การทวงงานเกินกำหนด
  //    ★ event_key มีวันที่นัดอยู่ด้วย ⇒ เลื่อนนัดแล้วได้เตือนใหม่ · รันซ้ำวันเดียวกันไม่แจ้งซ้ำ
  if (flags.notify) {
    const logId = await logSync(db, "om_notify", "cron", actor);
    try {
      const days = Number(await getSetting("notify.reminder_days")) || 1;
      const r = await db.request().input("d", sql.Int, days).query(`
        SELECT b.id, b.house_id, b.owner_user_id, h.house_number,
               CONVERT(char(10), b.scheduled_at, 23) ymd, st.label_th service_type
          FROM om_bookings b
          JOIN om_houses h ON h.id = b.house_id
          LEFT JOIN om_service_type st ON st.id = b.service_type_id
         WHERE b.status IN (N'pending', N'confirmed')
           AND b.owner_user_id IS NOT NULL
           AND b.scheduled_at IS NOT NULL
           AND CAST(b.scheduled_at AS date)
               BETWEEN CAST(SYSDATETIMEOFFSET() AS date)
                   AND DATEADD(day, @d, CAST(SYSDATETIMEOFFSET() AS date))`);
      let sent = 0;
      // วันนี้ตามเวลาไทย — toISOString() เปล่า ๆ เป็น UTC ช่วงตีหนึ่งถึงเจ็ดโมงจะเพี้ยนไปหนึ่งวัน
      const thToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      for (const row of r.recordset) {
        const when = String(row.ymd) === thToday ? "วันนี้" : "วันที่ " + String(row.ymd);
        const ok = await notifyOmUser(db, {
          recipientUserId: Number(row.owner_user_id),
          type: "om_job_reminder",
          eventKey: `om_job_reminder:${row.id}:${row.ymd}`,
          title: `ใกล้ถึงนัด O&M ${when}`,
          message: `บ้าน ${row.house_number ?? "-"} · ${row.service_type ?? "งานบริการ"}`,
          houseId: Number(row.house_id),
          bookingId: Number(row.id),
        });
        if (ok) sent++;
      }
      await finishSync(db, logId, { status: "ok", fetched: r.recordset.length, inserted: sent,
        message: `นัดใน ${days} วัน ${r.recordset.length} ใบ · แจ้ง ${sent}` });
      out.notify = { due: r.recordset.length, sent };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "แจ้งเตือนไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      out.notify = { error: msg };
    }
  }

  return out;
}

// รันตามค่าใน settings (เรียกจาก scheduler) — ถ้าปิด sync.rem_auto จะไม่ทำอะไร
export async function runScheduledJobs(): Promise<Record<string, unknown> | null> {
  const db = await getOmDb();
  const remAuto = await getSetting<boolean>("sync.rem_auto");
  const sweepAuto = await getSetting<boolean>("sync.sweep_auto");
  const promoAuto = await getSetting<boolean>("sync.promo_auto");
  const notifyAuto = await getSetting<boolean>("notify.job_reminder");
  if (!remAuto && !sweepAuto && !promoAuto && !notifyAuto) return null;
  const batch = Number(await getSetting("sync.rem_batch")) || 5;
  return runJobs(db, {
    sweep: sweepAuto !== false,
    rem: remAuto !== false,
    reconcile: remAuto !== false,   // เชื่อมกลับคู่กับ rem เสมอ
    promo: promoAuto !== false,
    notify: notifyAuto !== false,
  }, { remLimit: batch });
}
