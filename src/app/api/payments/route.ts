import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

// Maps slip_field (column on leads) → paid flag (column on leads).
const PAID_FLAG: Record<string, string> = {
  pre_slip_url: "payment_confirmed",
  order_before_slip: "order_before_paid",
  order_after_slip: "order_after_paid",
};

// POST /api/payments
// Body: { lead_id, step_no, slip_field, doc_no?, amount, description?, confirmed_by? }
// Atomic confirm:
//   1. Copy latest slip_files row for (lead_id, slip_field) → new payments row
//   2. PATCH lead: [slip_field] = /api/payments/:id, [paid_flag] = 1
//   3. DELETE the staging slip_files row
// After this the slip lives in payments only; the lead URL points at it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const leadId = parseInt(String(body.lead_id || 0));
    const stepNo = parseInt(String(body.step_no ?? -1));
    const slipField = String(body.slip_field || "");
    const amount = parseFloat(String(body.amount || 0));
    if (!leadId || stepNo < 0 || !slipField || !amount) {
      return NextResponse.json({ error: "lead_id, step_no, slip_field, amount required" }, { status: 400 });
    }
    const paidFlag = PAID_FLAG[slipField];
    if (!paidFlag) {
      return NextResponse.json({ error: `Unknown slip_field: ${slipField}` }, { status: 400 });
    }
    const db = await getDb();

    const slipRes = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`
        SELECT TOP 1 id, data, mime, filename FROM slip_files
        WHERE lead_id = @lead_id AND slip_field = @slip_field
        ORDER BY id DESC
      `);
    if (slipRes.recordset.length === 0) {
      return NextResponse.json({ error: "Slip not found — upload and verify first" }, { status: 400 });
    }
    const slip = slipRes.recordset[0];

    const insertRes = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("step_no", sql.Int, stepNo)
      .input("slip_field", sql.NVarChar(50), slipField)
      .input("doc_no", sql.NVarChar(50), body.doc_no ?? null)
      .input("amount", sql.Decimal(12, 2), amount)
      .input("description", sql.NVarChar(200), body.description ?? null)
      .input("slip_data", sql.VarBinary(sql.MAX), slip.data)
      .input("slip_mime", sql.NVarChar(50), slip.mime || "image/jpeg")
      .input("slip_filename", sql.NVarChar(200), slip.filename || null)
      .input("confirmed_by", sql.NVarChar(100), body.confirmed_by ?? null)
      .query(`
        INSERT INTO payments (lead_id, step_no, slip_field, doc_no, amount, description, slip_data, slip_mime, slip_filename, confirmed_by)
        OUTPUT INSERTED.id
        VALUES (@lead_id, @step_no, @slip_field, @doc_no, @amount, @description, @slip_data, @slip_mime, @slip_filename, @confirmed_by)
      `);
    const paymentId = insertRes.recordset[0].id;
    const paymentUrl = `/api/payments/${paymentId}`;

    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("url", sql.NVarChar(200), paymentUrl)
      .query(`UPDATE leads SET ${slipField} = @url, ${paidFlag} = 1, updated_at = GETDATE() WHERE id = @lead_id`);

    await db.request().input("id", sql.Int, slip.id).query(`DELETE FROM slip_files WHERE id = @id`);

    return NextResponse.json({ id: paymentId, url: paymentUrl });
  } catch (e) {
    console.error("POST /api/payments error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// GET /api/payments?lead_id=X[&step_no=Y]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = parseInt(searchParams.get("lead_id") || "0");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const stepNo = searchParams.get("step_no");
    const db = await getDb();
    const request = db.request().input("lead_id", sql.Int, leadId);
    let q = `SELECT id, lead_id, step_no, slip_field, doc_no, amount, description, slip_mime, slip_filename, confirmed_by, confirmed_at
             FROM payments WHERE lead_id = @lead_id`;
    if (stepNo !== null) {
      request.input("step_no", sql.Int, parseInt(stepNo));
      q += ` AND step_no = @step_no`;
    }
    q += ` ORDER BY id DESC`;
    const r = await request.query(q);
    return NextResponse.json(r.recordset);
  } catch (e) {
    console.error("GET /api/payments error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/payments?lead_id=X&step_no=Y
// Rollback: remove all payment rows for (lead_id, step_no). Also clears the lead's
// slip URL + paid flag so data is consistent after rolling back a step.
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = parseInt(searchParams.get("lead_id") || "0");
    const stepNo = searchParams.get("step_no");
    if (!leadId || stepNo === null) {
      return NextResponse.json({ error: "lead_id and step_no required" }, { status: 400 });
    }
    const db = await getDb();
    const step = parseInt(stepNo);
    const rows = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("step_no", sql.Int, step)
      .query(`SELECT DISTINCT slip_field FROM payments WHERE lead_id = @lead_id AND step_no = @step_no`);

    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("step_no", sql.Int, step)
      .query(`DELETE FROM payments WHERE lead_id = @lead_id AND step_no = @step_no`);

    for (const r of rows.recordset) {
      const slipField: string = r.slip_field;
      const paidFlag = PAID_FLAG[slipField];
      if (!paidFlag) continue;
      await db.request().input("lead_id", sql.Int, leadId).query(
        `UPDATE leads SET ${slipField} = NULL, ${paidFlag} = 0, updated_at = GETDATE() WHERE id = @lead_id`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/payments error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
