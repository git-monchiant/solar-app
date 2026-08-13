import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { flipJourneyDatesIfDue } from "@/lib/journey";

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
      GROUP BY journey_step, journey_sub
    `);
    return NextResponse.json(r.recordset);
  } catch (e) {
    console.error("GET /api/journey-summary error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
