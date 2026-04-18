import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

// GET /api/pay-tokens/<token>  →  { lead_id, amount, customer_name }
// Used by the public /pay page to look up the payment context.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 10) return NextResponse.json({ error: "invalid token" }, { status: 404 });
  try {
    const db = await getDb();
    const r = await db.request().input("token", sql.NVarChar(64), token)
      .query(`SELECT id, full_name, pre_pay_amount, pre_pay_description FROM leads WHERE pre_pay_token = @token`);
    if (r.recordset.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    const row = r.recordset[0];
    return NextResponse.json({
      lead_id: row.id,
      customer_name: row.full_name,
      amount: row.pre_pay_amount != null ? Number(row.pre_pay_amount) : 0,
      description: row.pre_pay_description || null,
    });
  } catch (e) {
    console.error("GET /api/pay-tokens/[token] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
