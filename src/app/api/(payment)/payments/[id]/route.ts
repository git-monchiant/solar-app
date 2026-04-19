import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/payments/<id>  → serve slip BLOB (fallback when /api/slips/<id> is gone)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, payId)
      .query(`SELECT slip_data, slip_mime FROM payments WHERE id = @id`);
    if (r.recordset.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = r.recordset[0];
    return new NextResponse(row.slip_data, {
      headers: {
        "Content-Type": row.slip_mime || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/payments/<id>  → atomic undo of a confirmed payment:
//   1) delete payments row (BLOB goes with it)
//   2) clear lead paid flag + slip URL
//   3) for pre_slip_url: also clear pre_doc_no/pre_total_price/pre_package_id/pre_booked_at
//   4) revert status if it advanced past the stage
//   5) audit to payment_logs
const PAID_FLAG: Record<string, string> = {
  pre_slip_url: "payment_confirmed",
  order_before_slip: "order_before_paid",
  order_after_slip: "order_after_paid",
};
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const payRes = await db.request().input("id", sql.Int, payId)
      .query(`SELECT lead_id, slip_field, step_no, doc_no, amount FROM payments WHERE id = @id`);
    if (payRes.recordset.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    const pay = payRes.recordset[0];
    const slipField = pay.slip_field as string;
    const paidFlag = PAID_FLAG[slipField];
    if (!paidFlag) return NextResponse.json({ error: `Unknown slip_field: ${slipField}` }, { status: 400 });

    await db.request().input("id", sql.Int, payId).query(`DELETE FROM payments WHERE id = @id`);

    if (slipField === "pre_slip_url") {
      await db.request().input("lead_id", sql.Int, pay.lead_id)
        .query(`UPDATE leads SET
          pre_slip_url = NULL, payment_confirmed = 0,
          pre_doc_no = NULL, pre_total_price = NULL, pre_package_id = NULL, pre_booked_at = NULL,
          status = CASE WHEN status = 'survey' THEN 'pre_survey' ELSE status END,
          updated_at = GETDATE()
          WHERE id = @lead_id`);
    } else {
      await db.request().input("lead_id", sql.Int, pay.lead_id)
        .query(`UPDATE leads SET ${slipField} = NULL, ${paidFlag} = 0, updated_at = GETDATE() WHERE id = @lead_id`);
    }

    await db.request()
      .input("lead_id", sql.Int, pay.lead_id)
      .input("slip_field", sql.NVarChar(50), slipField)
      .input("step_no", sql.Int, pay.step_no)
      .input("details", sql.NVarChar(sql.MAX), JSON.stringify({ payment_id: payId, doc_no: pay.doc_no, amount: pay.amount }))
      .query(`INSERT INTO payment_logs (lead_id, action, slip_field, step_no, details, user_id)
              VALUES (@lead_id, 'undo_payment', @slip_field, @step_no, @details, 1)`);

    return NextResponse.json({ ok: true, lead_id: pay.lead_id });
  } catch (e) {
    console.error("DELETE /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
