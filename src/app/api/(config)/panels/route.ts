import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(
      `SELECT id, brand, model, watt, tier FROM panels WHERE is_active = 1 ORDER BY brand, watt DESC`
    );
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/panels error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
