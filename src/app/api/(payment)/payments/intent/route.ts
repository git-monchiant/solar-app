import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/payments/intent
// Body: { lead_id, step_no, slip_field, amount, description? }
// Pre-creates a "pending" payments row (no slip yet) so the QR can carry a stable
// per-payment Ref2. payment_no format: <leadId:5d>P<yy:2d><running:5d> e.g. 00123P2600001
// Idempotent: re-uses any existing pending row for (lead, step, slip_field). If amount
// changed, the row is updated in place (Ref2 stays the same).
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    const leadId = parseInt(String(body.lead_id || 0));
    const stepNo = parseInt(String(body.step_no ?? -1));
    const slipField = String(body.slip_field || "");
    const amount = parseFloat(String(body.amount || 0));
    if (!leadId || stepNo < 0 || !slipField || !amount) {
      return NextResponse.json({ error: "lead_id, step_no, slip_field, amount required" }, { status: 400 });
    }
    const description = body.description ? String(body.description).slice(0, 200) : null;
    // Optional context captured from the order step at intent time so receipts
    // and reports don't have to re-derive from the lead.
    const paymentMethod = body.payment_method ? String(body.payment_method).slice(0, 20) : null;
    const discountPct = body.discount_pct != null ? parseFloat(String(body.discount_pct)) : null;
    const discountAmount = body.discount_amount != null ? parseFloat(String(body.discount_amount)) : null;
    const discountNote = body.discount_note ? String(body.discount_note).slice(0, 200) : null;
    const ccSurchargePct = body.cc_surcharge_pct != null ? parseFloat(String(body.cc_surcharge_pct)) : null;
    const ccSurchargeAmount = body.cc_surcharge_amount != null ? parseFloat(String(body.cc_surcharge_amount)) : null;

    const pool = await getDb();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      // Installment and sequenced extra-payment keys are immutable payment
      // identities. A client refresh can briefly mount PaymentSection before
      // its confirmed state arrives; in that race, return the confirmed row
      // instead of creating a new pending duplicate for the same key.
      const immutablePaymentKey = /^order_installment_\d+$/.test(slipField)
        || /^install_extra_\d+$/.test(slipField);
      if (immutablePaymentKey) {
        const confirmed = await new sql.Request(tx)
          .input("lead_id", sql.Int, leadId)
          .input("step_no", sql.Int, stepNo)
          .input("slip_field", sql.NVarChar(50), slipField)
          .query(`
            SELECT TOP 1 id, payment_no
            FROM payments WITH (UPDLOCK, HOLDLOCK)
            WHERE lead_id = @lead_id AND step_no = @step_no
              AND slip_field = @slip_field AND confirmed_at IS NOT NULL
            ORDER BY confirmed_at DESC, id DESC
          `);
        if (confirmed.recordset.length > 0) {
          const row = confirmed.recordset[0];
          await tx.commit();
          return NextResponse.json({ id: row.id, payment_no: row.payment_no, confirmed: true });
        }
      }

      // Re-use any pending row for this (lead, step, slip_field). A confirmed row
      // must not be touched — a new payment for the same step (e.g. retry after
      // rollback) gets its own running number.
      //
      // UPDLOCK + HOLDLOCK serialize concurrent intent calls for the same key
      // (e.g. React StrictMode double-mount that fires the effect twice) so
      // they don't both see "no pending row" and both INSERT a duplicate.
      // Other (lead, step, slip_field) keys are unaffected.
      const existing = await new sql.Request(tx)
        .input("lead_id", sql.Int, leadId)
        .input("step_no", sql.Int, stepNo)
        .input("slip_field", sql.NVarChar(50), slipField)
        .query(`
          SELECT TOP 1 id, payment_no FROM payments WITH (UPDLOCK, HOLDLOCK)
          WHERE lead_id = @lead_id AND step_no = @step_no AND slip_field = @slip_field
            AND confirmed_at IS NULL
          ORDER BY id DESC
        `);

      if (existing.recordset.length > 0) {
        const row = existing.recordset[0];
        await new sql.Request(tx)
          .input("id", sql.Int, row.id)
          .input("amount", sql.Decimal(12, 2), amount)
          .input("description", sql.NVarChar(200), description)
          .input("payment_method", sql.NVarChar(20), paymentMethod)
          .input("discount_pct", sql.Decimal(5, 2), discountPct)
          .input("discount_amount", sql.Decimal(12, 2), discountAmount)
          .input("discount_note", sql.NVarChar(200), discountNote)
          .input("cc_surcharge_pct", sql.Decimal(5, 2), ccSurchargePct)
          .input("cc_surcharge_amount", sql.Decimal(12, 2), ccSurchargeAmount)
          .query(`
            UPDATE payments SET
              amount = @amount,
              description = @description,
              payment_method = @payment_method,
              cheque_received_at = CASE WHEN @payment_method = 'cheque' THEN cheque_received_at ELSE NULL END,
              cheque_received_by = CASE WHEN @payment_method = 'cheque' THEN cheque_received_by ELSE NULL END,
              cheque_bank = CASE WHEN @payment_method = 'cheque' THEN cheque_bank ELSE NULL END,
              cheque_due_date = CASE WHEN @payment_method = 'cheque' THEN cheque_due_date ELSE NULL END,
              cheque_deposited_at = CASE WHEN @payment_method = 'cheque' THEN cheque_deposited_at ELSE NULL END,
              cheque_status = CASE WHEN @payment_method = 'cheque' THEN cheque_status ELSE NULL END,
              cheque_status_note = CASE WHEN @payment_method = 'cheque' THEN cheque_status_note ELSE NULL END,
              cheque_status_by = CASE WHEN @payment_method = 'cheque' THEN cheque_status_by ELSE NULL END,
              cheque_status_at = CASE WHEN @payment_method = 'cheque' THEN cheque_status_at ELSE NULL END,
              discount_pct = @discount_pct,
              discount_amount = @discount_amount,
              discount_note = @discount_note,
              cc_surcharge_pct = @cc_surcharge_pct,
              cc_surcharge_amount = @cc_surcharge_amount
            WHERE id = @id
          `);
        await tx.commit();
        return NextResponse.json({ id: row.id, payment_no: row.payment_no });
      }

      // Allocate next running number for this year. MERGE locks the counter row
      // so concurrent INSERTs see strictly increasing values.
      const yy = new Date().getFullYear() % 100;
      const allocRes = await new sql.Request(tx)
        .input("yy", sql.Int, yy)
        .query(`
          MERGE payment_no_counter WITH (HOLDLOCK) AS t
          USING (SELECT @yy AS year_yy) AS s ON t.year_yy = s.year_yy
          WHEN MATCHED THEN UPDATE SET last_no = last_no + 1
          WHEN NOT MATCHED THEN INSERT (year_yy, last_no) VALUES (@yy, 1)
          OUTPUT inserted.last_no AS new_no;
        `);
      const running = allocRes.recordset[0].new_no as number;
      const paymentNo =
        String(leadId).padStart(5, "0") +
        "P" +
        String(yy).padStart(2, "0") +
        String(running).padStart(5, "0");

      const insertRes = await new sql.Request(tx)
        .input("lead_id", sql.Int, leadId)
        .input("step_no", sql.Int, stepNo)
        .input("slip_field", sql.NVarChar(50), slipField)
        .input("amount", sql.Decimal(12, 2), amount)
        .input("description", sql.NVarChar(200), description)
        .input("payment_no", sql.NVarChar(20), paymentNo)
        .input("payment_method", sql.NVarChar(20), paymentMethod)
        .input("discount_pct", sql.Decimal(5, 2), discountPct)
        .input("discount_amount", sql.Decimal(12, 2), discountAmount)
        .input("discount_note", sql.NVarChar(200), discountNote)
        .input("cc_surcharge_pct", sql.Decimal(5, 2), ccSurchargePct)
        .input("cc_surcharge_amount", sql.Decimal(12, 2), ccSurchargeAmount)
        .query(`
          INSERT INTO payments (
            lead_id, step_no, slip_field, amount, description, payment_no,
            payment_method, discount_pct, discount_amount, discount_note,
            cc_surcharge_pct, cc_surcharge_amount
          )
          OUTPUT INSERTED.id
          VALUES (
            @lead_id, @step_no, @slip_field, @amount, @description, @payment_no,
            @payment_method, @discount_pct, @discount_amount, @discount_note,
            @cc_surcharge_pct, @cc_surcharge_amount
          )
        `);
      const id = insertRes.recordset[0].id as number;
      await tx.commit();
      return NextResponse.json({ id, payment_no: paymentNo });
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
  } catch (e) {
    console.error("POST /api/payments/intent error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
