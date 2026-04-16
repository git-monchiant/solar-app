import crypto from "crypto";
import { getDb, sql } from "@/lib/db";
import { createThaiQR, cancelQR } from "@/lib/kbank";

const LOCKED_AMOUNT = 1;
const genToken = () => crypto.randomBytes(32).toString("hex");

export type PaymentResult = { status: number; body: Record<string, unknown> };

// In-memory lock so concurrent callers for the same key share one DB/KBank call.
const leadLocks = new Map<string, Promise<PaymentResult>>();

async function handleCreate(leadId: number, force: boolean): Promise<PaymentResult> {
  try {
    const db = await getDb();

    const leadResult = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT id, full_name FROM leads WHERE id = @id`);
    if (leadResult.recordset.length === 0) {
      return { status: 404, body: { error: "Lead not found" } };
    }

    const authorized = await db.request().input("lead_id", sql.Int, leadId)
      .query(`SELECT TOP 1 id, reference_order, access_token, qr_image_base64, qr_paint_text, amount, paid_at FROM payment_transactions WHERE lead_id = @lead_id AND status = 'authorized' ORDER BY id DESC`);
    if (authorized.recordset.length > 0) {
      const tx = authorized.recordset[0];
      return { status: 200, body: {
        id: tx.id,
        access_token: tx.access_token,
        reference_order: tx.reference_order,
        qr_image_base64: tx.qr_image_base64,
        qr_paint_text: tx.qr_paint_text,
        amount: tx.amount,
        status: "authorized",
        paid_at: tx.paid_at,
      } };
    }

    if (!force) {
      const existing = await db.request().input("lead_id", sql.Int, leadId)
        .query(`SELECT TOP 1 id, reference_order, access_token, qr_image_base64, qr_paint_text, amount, expires_at FROM payment_transactions WHERE lead_id = @lead_id AND status = 'pending' AND expires_at > GETDATE() ORDER BY id DESC`);
      if (existing.recordset.length > 0) {
        const tx = existing.recordset[0];
        return { status: 200, body: {
          id: tx.id,
          access_token: tx.access_token,
          reference_order: tx.reference_order,
          qr_image_base64: tx.qr_image_base64,
          qr_paint_text: tx.qr_paint_text,
          amount: tx.amount,
          expires_at: tx.expires_at,
          status: "pending",
        } };
      }
    }

    // Cancel any lingering pending rows (expired or stuck) before creating a new one.
    const toCancel = await db.request().input("lead_id", sql.Int, leadId)
      .query(`SELECT id, kbank_qr_id FROM payment_transactions WHERE lead_id = @lead_id AND status = 'pending'`);
    for (const row of toCancel.recordset) {
      if (row.kbank_qr_id) {
        try { await cancelQR(row.kbank_qr_id); }
        catch (err) { console.error(`cancelQR failed for ${row.kbank_qr_id}:`, err); }
      }
      await db.request().input("id", sql.Int, row.id)
        .query(`UPDATE payment_transactions SET status = 'cancelled' WHERE id = @id`);
    }

    const referenceOrder = `pay_${leadId}_${Date.now()}`;

    const qr = await createThaiQR({
      amount: LOCKED_AMOUNT,
      referenceOrder,
      description: `Lead ${leadId} deposit`,
    });

    const expiresAt = new Date(Date.now() + qr.expire_time_seconds * 1000);

    // Reuse the most recent access_token for this lead so previously-shared
    // customer links stay valid across QR regenerations.
    const existingToken = await db.request().input("lead_id", sql.Int, leadId)
      .query(`SELECT TOP 1 access_token FROM payment_transactions WHERE lead_id = @lead_id AND access_token IS NOT NULL ORDER BY id DESC`);
    const accessToken = existingToken.recordset[0]?.access_token || genToken();

    const insert = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("reference_order", sql.NVarChar(50), referenceOrder)
      .input("kbank_order_id", sql.NVarChar(100), qr.order_id)
      .input("kbank_qr_id", sql.NVarChar(100), qr.id)
      .input("amount", sql.Decimal(12, 2), LOCKED_AMOUNT)
      .input("qr_paint_text", sql.NVarChar(sql.MAX), qr.paint_text)
      .input("qr_image_base64", sql.NVarChar(sql.MAX), qr.image_with_base64)
      .input("expires_at", sql.DateTime2, expiresAt)
      .input("access_token", sql.NVarChar(64), accessToken)
      .query(`
        INSERT INTO payment_transactions
          (lead_id, reference_order, kbank_order_id, kbank_qr_id, amount, qr_paint_text, qr_image_base64, expires_at, access_token)
        OUTPUT INSERTED.id
        VALUES
          (@lead_id, @reference_order, @kbank_order_id, @kbank_qr_id, @amount, @qr_paint_text, @qr_image_base64, @expires_at, @access_token)
      `);

    const newId = insert.recordset[0].id;

    // Post-insert dedup: if a concurrent request created another pending row, cancel the older ones.
    const dupes = await db.request().input("lead_id", sql.Int, leadId).input("id", sql.Int, newId)
      .query(`SELECT id, kbank_qr_id FROM payment_transactions WHERE lead_id = @lead_id AND status = 'pending' AND id < @id`);
    for (const row of dupes.recordset) {
      if (row.kbank_qr_id) {
        try { await cancelQR(row.kbank_qr_id); } catch (err) { console.error("dedup cancel failed:", err); }
      }
      await db.request().input("id", sql.Int, row.id)
        .query(`UPDATE payment_transactions SET status = 'cancelled' WHERE id = @id`);
    }

    return { status: 200, body: {
      id: newId,
      access_token: accessToken,
      reference_order: referenceOrder,
      qr_image_base64: qr.image_with_base64,
      qr_paint_text: qr.paint_text,
      amount: LOCKED_AMOUNT,
      expires_at: expiresAt.toISOString(),
      status: "pending",
    } };
  } catch (error) {
    console.error("payments handleCreate error:", error);
    const message = error instanceof Error ? error.message : "Failed";
    return { status: 500, body: { error: message } };
  }
}

export async function ensurePaymentQR(leadId: number, force = false): Promise<PaymentResult> {
  const key = `${leadId}:${force ? 1 : 0}`;
  let promise = leadLocks.get(key);
  if (!promise) {
    promise = handleCreate(leadId, force);
    leadLocks.set(key, promise);
    promise.finally(() => { if (leadLocks.get(key) === promise) leadLocks.delete(key); });
  }
  return promise;
}
