import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { flipJourneyDatesIfDue } from "@/lib/journey";
import { OM_JOURNEY_SUMMARY_SQL } from "@/lib/om/journey-sql";
import { B2B_JOURNEY_SUMMARY_SQL, B2B_PROJECT_SUMMARY_SQL } from "@/lib/b2b/journey-sql";

// จำนวน lead ต่อ journey code — ใช้ทำ badge ของ hub/เมนูโมดูล (query เบามาก มี IX_leads_journey)
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    await flipJourneyDatesIfDue(db);
    const r = await db.request().query(`
      SELECT journey_step, journey_sub, COUNT(*) AS n
      FROM leads
      WHERE om_only = 0   -- lead ที่ระบบ O&M สร้างไม่มีขั้นฝั่งขาย (journey = NULL) — ไม่ต้องมีแถว NULL ปน
      GROUP BY journey_step, journey_sub
    `);

    // งานบริการ O&M (สาย 2000) — แยก request ไม่ UNION รวมกับของ lead ด้วยเหตุผล 2 ข้อ
    //   1. ตาราง om_* มีเฉพาะฐาน v3 — บน solardb ของ v2 จะ compile ไม่ผ่านทั้ง batch
    //      แล้ว badge ของทุกโมดูลพังพร้อมกัน (SQL Server ตรวจชื่อตารางตอน compile)
    //   2. พังฝั่งไหนก็อยู่ฝั่งนั้น — badge ฝั่งขายต้องขึ้นเสมอแม้ฝั่ง O&M มีปัญหา
    let om: unknown[] = [];
    try {
      om = (await db.request().query(OM_JOURNEY_SUMMARY_SQL)).recordset;
    } catch (e) {
      console.error("GET /api/journey-summary (O&M) error:", e);
    }

    // Master Data ของ BOQ (B2B) ที่ยังรอราคา — badge การ์ด BOQ · แยก request ด้วยเหตุผลเดียวกับ O&M ข้างบน
    let b2b: unknown[] = [];
    try {
      b2b = (await db.request().query(B2B_JOURNEY_SUMMARY_SQL)).recordset;
    } catch (e) {
      console.error("GET /api/journey-summary (B2B) error:", e);
    }

    // โครงการ B2B (สาย 3000 · แผน 20261015-07) — แยกจากรอราคาข้างบน: ตารางโครงการมาทีหลัง ฐานที่ยังไม่รัน migration พังแค่ส่วนนี้
    let b2bProjects: unknown[] = [];
    try {
      b2bProjects = (await db.request().query(B2B_PROJECT_SUMMARY_SQL)).recordset;
    } catch (e) {
      console.error("GET /api/journey-summary (B2B projects) error:", e);
    }

    return NextResponse.json([...r.recordset, ...om, ...b2b, ...b2bProjects]);
  } catch (e) {
    console.error("GET /api/journey-summary error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
