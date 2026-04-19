import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

// POST /api/payment-logs
// Body: { lead_id, slip_field?, step_no?, action, details?, user_id? }
// Fire-and-forget from PaymentSection — never blocks user flow.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const leadId = parseInt(body.lead_id);
    const action = String(body.action || "").slice(0, 40);
    if (!leadId || !action) {
      return NextResponse.json({ error: "lead_id + action required" }, { status: 400 });
    }
    const slipField = body.slip_field ? String(body.slip_field).slice(0, 50) : null;
    const stepNo = body.step_no != null ? parseInt(body.step_no) : null;
    const userId = body.user_id != null ? parseInt(body.user_id) : null;
    const details = body.details ? JSON.stringify(body.details) : null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 400);

    const db = await getDb();
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .input("step_no", sql.Int, stepNo)
      .input("action", sql.NVarChar(40), action)
      .input("details", sql.NVarChar(sql.MAX), details)
      .input("user_id", sql.Int, userId)
      .input("user_agent", sql.NVarChar(400), ua)
      .query(`
        INSERT INTO payment_logs (lead_id, slip_field, step_no, action, details, user_id, user_agent)
        VALUES (@lead_id, @slip_field, @step_no, @action, @details, @user_id, @user_agent)
      `);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/payment-logs error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// GET /api/payment-logs?lead_id=... — recent logs for one lead (for debugging UI)
export async function GET(req: NextRequest) {
  try {
    const leadId = parseInt(req.nextUrl.searchParams.get("lead_id") || "");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

    const db = await getDb();
    const r = await db.request()
      .input("id", sql.Int, leadId)
      .query(`
        SELECT TOP 200 id, lead_id, slip_field, step_no, action, details, user_id, created_at
        FROM payment_logs WHERE lead_id = @id
        ORDER BY id DESC
      `);
    return NextResponse.json(fixDates(r.recordset));
  } catch (error) {
    console.error("GET /api/payment-logs error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
