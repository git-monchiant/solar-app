import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { verifyWebhookChecksum, isPaymentAuthorized, KBankWebhookBody } from "@/lib/kbank";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    let body: KBankWebhookBody;
    try {
      body = JSON.parse(raw);
    } catch {
      console.error("KBank webhook: invalid JSON", raw.slice(0, 300));
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    if (!verifyWebhookChecksum(body)) {
      console.error("KBank webhook: checksum mismatch", { id: body.id });
      return NextResponse.json({ error: "checksum mismatch" }, { status: 401 });
    }

    const db = await getDb();

    const lookup = await db.request()
      .input("order_id", sql.NVarChar(100), body.order_id)
      .query(`SELECT id, lead_id, status FROM payment_transactions WHERE kbank_order_id = @order_id`);

    if (lookup.recordset.length === 0) {
      console.error("KBank webhook: unknown order_id", body.order_id);
      return NextResponse.json({ status: "ok" });
    }

    const tx = lookup.recordset[0];

    if (tx.status === "authorized") {
      return NextResponse.json({ status: "ok" });
    }

    if (isPaymentAuthorized(body)) {
      await db.request()
        .input("id", sql.Int, tx.id)
        .input("charge_id", sql.NVarChar(100), body.id)
        .input("raw", sql.NVarChar(sql.MAX), raw)
        .query(`UPDATE payment_transactions SET status = 'authorized', kbank_charge_id = @charge_id, paid_at = GETDATE(), webhook_raw = @raw WHERE id = @id`);

      await db.request().input("lead_id", sql.Int, tx.lead_id)
        .query(`UPDATE bookings SET payment_confirmed = 1 WHERE lead_id = @lead_id`);
    } else {
      await db.request()
        .input("id", sql.Int, tx.id)
        .input("failure_code", sql.NVarChar(256), body.failure_code || null)
        .input("failure_message", sql.NVarChar(256), body.failure_message || null)
        .input("raw", sql.NVarChar(sql.MAX), raw)
        .query(`UPDATE payment_transactions SET failure_code = @failure_code, failure_message = @failure_message, webhook_raw = @raw WHERE id = @id`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("POST /api/webhook/kbank error:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
