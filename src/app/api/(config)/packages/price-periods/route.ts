import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { syncActivePricePeriods } from "@/lib/package-prices";

/**
 * ช่วงราคาของทุก Package ในคำขอเดียว — ใช้ในหน้าสร้างใบเสนอราคาเพื่อให้เลือกราคา
 * ได้จาก dropdown (ค่าเริ่มต้นคือช่วงที่ Active อยู่)
 */
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    await syncActivePricePeriods();
    const db = await getDb();
    const exists = await db.request().query(
      `SELECT CASE WHEN OBJECT_ID('package_price_periods','U') IS NULL THEN 0 ELSE 1 END has_table`,
    );
    if (!exists.recordset[0]?.has_table) return NextResponse.json([]);
    // ส่ง lead_id มา = หน้าใบเสนอราคา → เห็นเฉพาะช่วงที่ใช้อยู่ กับช่วงเก่าที่ระบุ Lead นี้ไว้
    const leadId = Number(req.nextUrl.searchParams.get("lead_id")) || 0;
    const r = await db.request().input("lead", sql.NVarChar(20), String(leadId)).query(`
      SELECT id, package_id, price, monthly_installment, monthly_saving, start_date, expire_date, is_active, allowed_lead_ids
      FROM package_price_periods
      WHERE ${leadId ? `is_active = 1 OR ',' + REPLACE(ISNULL(allowed_lead_ids,''),' ','') + ',' LIKE '%,' + @lead + ',%'` : "1=1"}
      ORDER BY package_id, ISNULL(start_date,'1900-01-01'), id`);
    return NextResponse.json(fixDates(r.recordset));
  } catch (error) {
    console.error("GET /api/packages/price-periods error:", error);
    return NextResponse.json([]);   // ไม่ให้หน้าใบเสนอราคาพังเพราะดึงช่วงราคาไม่ได้
  }
}
