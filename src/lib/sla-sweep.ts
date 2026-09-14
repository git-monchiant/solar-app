/**
 * งานเบื้องหลังที่คำนวณ SLA ให้ Lead ทุกรายตามรอบเวลา
 *
 * งาน SLA ส่วนใหญ่เกิดจากการกระทำจริง (บันทึกกิจกรรม ยืนยันการชำระเงิน จองสำรวจ
 * อนุมัติใบเสนอราคา) ซึ่ง endpoint พวกนั้นเรียก syncOperationalSlas ให้ทันทีอยู่แล้ว
 * แต่มีบางงานที่เกิดจาก "เวลาผ่านไป" โดยไม่มีใครทำอะไรเลย เช่น Book Survey ที่ต้อง
 * นับตั้งแต่ Lead เข้ามา — Lead ที่ไม่มีใครแตะก็ต้องมีนาฬิกาเดินอยู่ดี งานพวกนี้ไม่มี
 * เหตุการณ์ให้เกาะ จึงต้องมีรอบเวลามาไล่คำนวณ
 *
 * เดิมหน้าที่นี้ถูกยัดไว้ใน GET ของหน้า Lead ผลคือ "ต้องคลิกเข้าไปดูสถานะถึงจะเปลี่ยน"
 * รายการบนหน้า Today ขยับเองเมื่อมีคนเปิดดู และเคยลบวันนัดติดตามของเซลส์ทิ้ง
 * ตอนนี้การอ่านไม่เขียนข้อมูลแล้ว ส่วนการคำนวณย้ายมาอยู่ที่นี่ที่เดียว
 *
 * ความปลอดภัยของการรัน
 * - ห้ามรันซ้อน: ล็อกระดับฐานข้อมูลด้วย sp_getapplock (กันได้แม้มีหลาย container)
 *   ถ้ามีรอบก่อนยังไม่จบ รอบนี้ข้ามไปเลย ไม่รอคิว
 * - ทีละ Lead ต่อกัน ไม่ยิงพร้อมกัน เพื่อไม่ให้แย่งฐานข้อมูลกับผู้ใช้
 * - Lead หนึ่งรายพังไม่หยุดทั้งรอบ นับจำนวนที่พังแล้วไปต่อ
 * - ไม่แตะ Lead ที่ปิดจบแล้ว (lost / returned / closed) เพราะไม่มีงาน SLA ให้คำนวณ
 */

import { getDb, sql } from "@/lib/db";
import { refreshOpenSlaStates, syncOperationalSlas } from "@/lib/sla-service";

export type SlaSweepResult = {
  ran: boolean;
  reason?: string;
  leads: number;
  failed: number;
  ms: number;
};

const LOCK_NAME = "solar-app:sla-sweep";

type SweepGlobal = typeof globalThis & { __slaSweepRunning?: boolean };

/**
 * scope เลือกเฉพาะกลุ่ม Lead ที่ได้รับผลจากการแก้ ไม่ต้องไล่ทั้งระบบทุกครั้ง
 * เช่น แก้กติกาขั้นชำระเงินกระทบเฉพาะ Lead ที่ผ่านขั้นเสนอราคาแล้ว
 * ไม่ส่ง scope = ทุก Lead ที่ยังไม่ปิดจบ (รอบตามเวลาใช้แบบนี้)
 */
export type SlaSweepScope = { statuses?: string[]; leadIds?: number[] };

export async function runSlaSweep(trigger: string, scope: SlaSweepScope = {}): Promise<SlaSweepResult> {
  const g = globalThis as SweepGlobal;
  const startedAt = Date.now();
  if (g.__slaSweepRunning) {
    return { ran: false, reason: "กำลังรันอยู่ในเครื่องนี้", leads: 0, failed: 0, ms: 0 };
  }
  g.__slaSweepRunning = true;

  // ล็อกผูกกับ transaction เพื่อให้ปล่อยเองอัตโนมัติถ้า process ตายกลางทาง
  // transaction นี้ไม่ได้แก้ข้อมูลอะไร มีไว้ถือล็อกอย่างเดียว
  let lockTx: InstanceType<typeof sql.Transaction> | null = null;
  let locked = false;
  try {
    const db = await getDb();
    lockTx = new sql.Transaction(db);
    await lockTx.begin();
    const lock = await new sql.Request(lockTx)
      .input("name", sql.NVarChar(255), LOCK_NAME)
      .query(`
        DECLARE @r INT;
        EXEC @r = sp_getapplock @Resource = @name, @LockMode = 'Exclusive',
                                @LockOwner = 'Transaction', @LockTimeout = 0;
        SELECT @r AS result;
      `);
    locked = Number(lock.recordset[0]?.result) >= 0;
    if (!locked) {
      return { ran: false, reason: "มีรอบอื่นกำลังรันอยู่", leads: 0, failed: 0, ms: Date.now() - startedAt };
    }

    const statuses = (scope.statuses ?? []).filter(s => /^[a-z_-]+$/.test(s));
    const leadIds = (scope.leadIds ?? []).filter(id => Number.isInteger(id) && id > 0);
    const leads = await db.request().query(`
      SELECT id FROM leads
      WHERE status NOT IN ('lost', 'returned', 'closed')
        ${statuses.length ? `AND status IN (${statuses.map(s => `'${s}'`).join(",")})` : ""}
        ${leadIds.length ? `AND id IN (${leadIds.join(",")})` : ""}
      ORDER BY id
    `);

    let failed = 0;
    for (const row of leads.recordset as Array<{ id: number }>) {
      try {
        await syncOperationalSlas(db, row.id, null);
      } catch (error) {
        failed += 1;
        console.error(`[sla-sweep] lead ${row.id} failed:`, error);
      }
    }
    // บันทึกสถานะตามนาฬิกาลงตารางพร้อมประวัติเหตุการณ์ หน้าจอไม่ได้พึ่งค่านี้
    // (คำนวณสดตอนอ่านอยู่แล้ว) แต่รายงานย้อนหลังและ event log ต้องมี
    await refreshOpenSlaStates(db);

    const result = { ran: true, leads: leads.recordset.length, failed, ms: Date.now() - startedAt };
    console.log(`[sla-sweep] ${trigger} · ${result.leads} leads · failed ${failed} · ${Math.round(result.ms / 1000)}s`);
    return result;
  } finally {
    try { await lockTx?.rollback(); } catch { /* ไม่มี transaction ค้างให้ปล่อย */ }
    g.__slaSweepRunning = false;
  }
}

type ScheduleGlobal = typeof globalThis & { __slaSweepTimer?: ReturnType<typeof setInterval> };

/**
 * ตั้งรอบให้งานรันเองในตัวแอป — container ของเรารันยาวต่อเนื่อง จึงไม่ต้องพึ่ง
 * crontab ของเครื่อง รอบแรกเริ่มหลังแอปขึ้น 1 นาที ทำหน้าที่เป็น backfill หลัง
 * deploy ไปในตัว จากนั้นรันซ้ำตาม SLA_SWEEP_INTERVAL_MINUTES (ค่าเริ่มต้น 30 นาที)
 */
export function startSlaSweepSchedule() {
  const g = globalThis as ScheduleGlobal;
  if (g.__slaSweepTimer) return; // dev hot-reload เรียกซ้ำได้ ห้ามตั้งเวลาซ้อน

  const minutes = Math.max(5, Number(process.env.SLA_SWEEP_INTERVAL_MINUTES) || 30);
  const tick = (trigger: string) => {
    runSlaSweep(trigger).catch(error => console.error("[sla-sweep] run failed:", error));
  };
  setTimeout(() => tick("startup"), 60_000);
  g.__slaSweepTimer = setInterval(() => tick("interval"), minutes * 60_000);
  console.log(`[sla-sweep] scheduled every ${minutes} minutes (first run in 1 minute)`);
}
