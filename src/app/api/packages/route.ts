import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT * FROM packages WHERE is_active = 1 ORDER BY has_battery, kwp, phase
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/packages error:", error);
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}
