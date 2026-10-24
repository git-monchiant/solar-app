// ตรวจผลกระทบของ migration 195 ก่อน deploy — อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น
//
// migration 195 ย้ายจุดเริ่มนับ BOOK_SURVEY กลับไปที่หลักฐานการชำระค่าสำรวจ
// (leads.survey_ready_at) หลังจาก migration 181 ย้ายไปใช้วันที่ Lead เข้ามา
// หลัง deploy งานเบื้องหลัง sla-sweep จะจัดข้อมูลเดิมให้ตรงกติกาใหม่ภายใน 30 นาที
// สคริปต์นี้บอกล่วงหน้าว่าจะกระทบกี่แถว จะได้ไม่ตกใจตอนตัวเลขบนแดชบอร์ดเปลี่ยน
//
// Usage:
//   node scripts/tools/check_book_survey_impact.mjs --db=solardb_dev
//   node scripts/tools/check_book_survey_impact.mjs --db=solardb
//
// อ่าน DB_* จาก .env.local ไม่มี credential เขียนติดไว้ในไฟล์นี้

import sql from "mssql";
import { readFileSync } from "fs";

const dbArg = process.argv.slice(2).find(a => a.startsWith("--db="));
if (!dbArg) {
  console.error("Usage: node scripts/tools/check_book_survey_impact.mjs --db=<solardb|solardb_dev>");
  process.exit(1);
}
const database = dbArg.split("=")[1];

try {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* ใช้ค่าจาก environment ที่ตั้งไว้แล้วแทน */ }

if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error("ไม่พบ DB_USER / DB_PASSWORD — ตั้งใน .env.local หรือส่งมาทาง environment");
  process.exit(1);
}

const pool = await sql.connect({
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database,
  options: { encrypt: false, trustServerCertificate: true, useUTC: false },
});

// เงื่อนไขต้องตรงกับ resolveBookSurveyMilestones ใน src/lib/sla-rules.ts:
//   anchor = survey_ready_at -> (นัดสำรวจ | ย้ายไปขั้นใบเสนอราคา) -> ไม่มี = ยกเลิก
const open = (await pool.request().query(`
  WITH target AS (
    SELECT si.id, si.status, l.survey_ready_at,
           appt.id AS appointment_id, done.id AS survey_done_id
    FROM lead_sla_instances si
    JOIN leads l ON l.id = si.lead_id
    OUTER APPLY (
      SELECT TOP 1 a.id FROM lead_activities a
      WHERE a.lead_id = l.id AND a.activity_type = 'appointment_set'
        AND a.title LIKE N'%สำรวจ%'
      ORDER BY a.created_at, a.id
    ) appt
    OUTER APPLY (
      SELECT TOP 1 a.id FROM lead_activities a
      WHERE a.lead_id = l.id AND a.activity_type = 'status_change' AND a.new_status = 'quote'
      ORDER BY a.created_at DESC, a.id DESC
    ) done
    WHERE si.policy_code = 'BOOK_SURVEY'
      AND si.status IN ('active','warning','critical','breached')
      AND si.superseded_at IS NULL
  )
  SELECT
    COUNT(*) AS total_open,
    SUM(CASE WHEN survey_ready_at IS NULL
              AND appointment_id IS NULL AND survey_done_id IS NULL
             THEN 1 ELSE 0 END) AS will_cancel,
    SUM(CASE WHEN survey_ready_at IS NULL
              AND appointment_id IS NULL AND survey_done_id IS NULL
              AND status = 'breached' THEN 1 ELSE 0 END) AS will_cancel_now_breached,
    SUM(CASE WHEN survey_ready_at IS NOT NULL THEN 1 ELSE 0 END) AS will_reanchor,
    SUM(CASE WHEN survey_ready_at IS NOT NULL AND status = 'breached'
              AND DATEADD(DAY, 1, survey_ready_at) > GETDATE()
             THEN 1 ELSE 0 END) AS breached_becomes_ontime,
    SUM(CASE WHEN survey_ready_at IS NULL
              AND (appointment_id IS NOT NULL OR survey_done_id IS NOT NULL)
             THEN 1 ELSE 0 END) AS will_close_by_fallback
  FROM target
`)).recordset[0];

const history = (await pool.request().query(`
  SELECT COUNT(*) AS completed_lead_created
  FROM lead_sla_instances
  WHERE policy_code = 'BOOK_SURVEY' AND status = 'completed'
    AND ISJSON(context_json) = 1
    AND JSON_VALUE(context_json, '$.anchorSource') = 'lead_created'
`)).recordset[0];

const n = v => String(v ?? 0).padStart(6);
console.log(`\nผลกระทบ migration 195 · ${database}\n${"=".repeat(52)}`);
console.log(`งาน BOOK_SURVEY ที่ยังเปิดอยู่ทั้งหมด        ${n(open.total_open)}`);
console.log("-".repeat(52));
console.log(`ถูกยกเลิก (ยังไม่จ่าย ยังไม่นัด)             ${n(open.will_cancel)}`);
console.log(`  ในนั้นตอนนี้ขึ้นแดงอยู่                     ${n(open.will_cancel_now_breached)}`);
console.log(`ย้ายจุดเริ่มนับไปที่วันจ่ายเงิน               ${n(open.will_reanchor)}`);
console.log(`  ในนั้นจากแดงกลายเป็นทันกำหนด               ${n(open.breached_becomes_ontime)}`);
console.log(`ปิดงานด้วยหลักฐานนัดสำรวจ (ข้อมูลเก่า)        ${n(open.will_close_by_fallback)}`);
console.log("=".repeat(52));
console.log(`ประวัติที่ปิดไปแล้วแต่ยังติด anchor เก่า       ${n(history.completed_lead_created)}`);
console.log("  (ข้อ 4 ที่ยังไม่ตัดสินใจ — ดูหมายเหตุท้าย migration 195)\n");

await pool.close();
