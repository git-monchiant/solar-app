import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { inquiryQR, isPaymentAuthorized } from "@/lib/kbank";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const txId = parseInt(id);
    const db = await getDb();

    const result = await db.request().input("id", sql.Int, txId)
      .query(`SELECT * FROM payment_transactions WHERE id = @id`);
    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tx = result.recordset[0];

    if (tx.status !== "pending" || !tx.kbank_order_id) {
      return NextResponse.json({
        id: tx.id,
        status: tx.status,
        paid_at: tx.paid_at,
      });
    }

    try {
      const inquiry = await inquiryQR(tx.kbank_order_id);
      if (isPaymentAuthorized(inquiry)) {
        await db.request()
          .input("id", sql.Int, txId)
          .input("charge_id", sql.NVarChar(100), inquiry.id)
          .query(`UPDATE payment_transactions SET status = 'authorized', kbank_charge_id = @charge_id, paid_at = GETDATE() WHERE id = @id AND status = 'pending'`);
        await db.request().input("lead_id", sql.Int, tx.lead_id)
          .query(`UPDATE bookings SET payment_confirmed = 1 WHERE lead_id = @lead_id`);
        return NextResponse.json({ id: tx.id, status: "authorized", paid_at: new Date().toISOString() });
      }
      return NextResponse.json({
        id: tx.id,
        status: tx.status,
        paid_at: tx.paid_at,
        kbank_state: inquiry.transaction_state,
        kbank_status: inquiry.status,
        failure_code: inquiry.failure_code,
        failure_message: inquiry.failure_message,
      });
    } catch (err) {
      console.error("inquiryQR failed:", err);
      return NextResponse.json({
        id: tx.id,
        status: tx.status,
        paid_at: tx.paid_at,
        error: err instanceof Error ? err.message : "inquiry failed",
      });
    }
  } catch (error) {
    console.error("GET /api/payments/[id]/status error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
