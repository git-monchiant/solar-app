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

    const pool = await getDb();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
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
          .query(`UPDATE payments SET amount = @amount, description = @description WHERE id = @id`);
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
        .query(`
          INSERT INTO payments (lead_id, step_no, slip_field, amount, description, payment_no)
          OUTPUT INSERTED.id
          VALUES (@lead_id, @step_no, @slip_field, @amount, @description, @payment_no)
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
