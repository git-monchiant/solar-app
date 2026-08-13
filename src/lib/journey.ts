import sql from "mssql";
import type { ConnectionPool, Transaction } from "mssql";
import { computeJourney, JOURNEY_FLAGS_SQL } from "./journey-rules.mjs";

// เก็บผลคำนวณ journey ลง leads.journey_step / journey_sub
// (design: docs/plan/20260813-01-journey-step-codes.md — กติกาอยู่ที่ src/lib/journey-rules.mjs)
//
// เรียกหลังทุก mutation ที่กระทบขั้นของลูกค้า: PATCH lead, สลิป, ยืนยัน/ยกเลิกเงิน,
// อนุมัติใบเสนอ, ส่งกลับ seeker, บันทึก activity, สร้าง lead — รองรับทั้ง pool และ
// transaction แบบเดียวกับ syncOrderPaidFlags. ค่าเพี้ยนจากจุดที่พลาดถูกเกลี่ยด้วย
// nightly recompute (scripts/tools/backfill_journey.mjs)

type DbOrTx = ConnectionPool | Transaction;

export async function refreshJourney(db: DbOrTx, leadId: number): Promise<void> {
  const r = await new sql.Request(db as ConnectionPool)
    .input("id", sql.Int, leadId)
    .query(`
      SELECT l.status, l.survey_date, l.install_date, l.install_completed_at,
             l.journey_step, l.journey_sub,
             ${JOURNEY_FLAGS_SQL}
      FROM leads l WHERE l.id = @id
    `);
  const row = r.recordset[0];
  if (!row) return;

  const j = computeJourney(row);
  const step = j ? j.step : null;
  const sub = j ? j.sub : null;
  if (row.journey_step === step && row.journey_sub === sub) return;

  await new sql.Request(db as ConnectionPool)
    .input("id", sql.Int, leadId)
    .input("step", sql.Int, step)
    .input("sub", sql.Int, sub)
    .query(`UPDATE leads SET journey_step = @step, journey_sub = @sub, journey_updated_at = GETDATE() WHERE id = @id`);
}

// เวอร์ชันกลืน error — ใช้ในจุดที่อยู่นอก transaction และห้ามทำ mutation หลักล้ม
// (drift ที่เกิดแก้ได้ด้วย backfill_journey.mjs)
export async function refreshJourneySafe(db: DbOrTx, leadId: number): Promise<void> {
  try {
    await refreshJourney(db, leadId);
  } catch (e) {
    console.error(`refreshJourney(${leadId}) failed:`, e);
  }
}

// Flip ตามวัน: นัดสำรวจ→กำลังสำรวจ (310→320), รอติดตั้ง→กำลังติดตั้ง (710→720)
// สอง sub นี้เปลี่ยนเพราะเวลาเดินโดยไม่มีใครเขียนอะไร — เรียกตอนโหลดหน้า list/dashboard/BI
// แทน cron: รันจริง **วันละครั้ง** (request แรกหลังข้ามวัน, await ก่อน query จึงเห็น
// ข้อมูลถูกทันที) โดนแค่นัดที่เพิ่งถึงกำหนด มี IX_leads_journey รองรับ · รายการที่มี
// การแก้วันที่ไม่พึ่งตัวนี้ — hook refreshJourney คำนวณใหม่ตอนเขียนอยู่แล้วทุกทิศทาง
// (ตัวจำวันอยู่ในหน่วยความจำ: restart กลางวัน = รันซ้ำหนึ่งครั้งแบบ no-op ไม่เสียหาย)
// รันซ้ำในวันเดียวกันเป็น no-op เสมอ (เซ็ตแถวที่ flip ได้เปลี่ยนแค่ตอนข้ามวัน
// หรือตอนมีการเขียน ซึ่ง hook จัดการแล้ว) — throttle รายวันจึงพอ ไม่ต้องมี force
let lastFlipDay = "";

export async function flipJourneyDatesIfDue(db: ConnectionPool): Promise<void> {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (day === lastFlipDay) return;
  lastFlipDay = day;
  try {
    await db.request().query(`
      UPDATE leads SET journey_sub = 320, journey_updated_at = GETDATE()
      WHERE journey_step = 300 AND journey_sub = 310
        AND (survey_date IS NULL OR survey_date <= CAST(GETDATE() AS DATE));
      UPDATE leads SET journey_sub = 720, journey_updated_at = GETDATE()
      WHERE journey_step = 700 AND journey_sub = 710
        AND install_date IS NOT NULL AND install_date <= CAST(GETDATE() AS DATE);
    `);
  } catch (e) {
    lastFlipDay = ""; // ล้มแล้วให้ request หน้าลองใหม่ทันที
    console.error("flipJourneyDates failed:", e);
  }
}
