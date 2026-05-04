import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { syncOrderPaidFlags } from "@/lib/payments-helpers";

export const runtime = "nodejs";

const MAX_SLIPS = 5;

// GET /api/payments/<id>
//   default                  → serve slot 1 binary (backward compatible)
//   ?slot=<n>                → serve slot n binary (2..MAX_SLIPS)
//   ?list=1                  → return JSON list of non-empty slots
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  // Image bytes are embedded via <img src=...> tags that can't send custom
  // headers, so the binary branch stays public. The ?list=1 JSON branch is
  // fetched via apiFetch and is gated.
  if (searchParams.get("list")) {
    const gate = await requireAuth(req);
    if (gate.error) return gate.error;
  }

  try {
    const db = await getDb();

    if (searchParams.get("list")) {
      const cols = ["id", "payment_method", "description"];
      for (let i = 1; i <= MAX_SLIPS; i++) {
        const suffix = i === 1 ? "" : `_${i}`;
        cols.push(`slip_mime${suffix}`, `slip_filename${suffix}`, `DATALENGTH(slip_data${suffix}) AS bytes_${i}`);
      }
      const r = await db.request().input("id", sql.Int, payId)
        .query(`SELECT ${cols.join(", ")} FROM payments WHERE id = @id`);
      if (r.recordset.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const row = r.recordset[0];
      const slots: Array<{ slot: number; url: string; mime: string; filename: string | null; bytes: number }> = [];
      for (let i = 1; i <= MAX_SLIPS; i++) {
        const suffix = i === 1 ? "" : `_${i}`;
        const bytes = row[`bytes_${i}`];
        if (bytes && bytes > 0) {
          slots.push({
            slot: i,
            url: i === 1 ? `/api/payments/${payId}` : `/api/payments/${payId}?slot=${i}`,
            mime: row[`slip_mime${suffix}`] || "image/jpeg",
            filename: row[`slip_filename${suffix}`] || null,
            bytes,
          });
        }
      }
      return NextResponse.json({ slots, payment_method: row.payment_method || null, description: row.description || null });
    }

    const slot = parseInt(searchParams.get("slot") || "1");
    if (slot < 1 || slot > MAX_SLIPS) {
      return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
    }
    const suffix = slot === 1 ? "" : `_${slot}`;
    const r = await db.request().input("id", sql.Int, payId)
      .query(`SELECT slip_data${suffix} AS data, slip_mime${suffix} AS mime FROM payments WHERE id = @id`);
    if (r.recordset.length === 0 || !r.recordset[0].data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = r.recordset[0];
    return new NextResponse(row.data, {
      headers: {
        "Content-Type": row.mime || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/payments/<id>  → atomic undo of a confirmed payment:
//   1) delete payments row (all slots go with it)
//   2) clear lead paid flag + slip URL
//   3) for pre_slip_url: also clear pre_doc_no/pre_total_price/pre_package_id/pre_booked_at
//   4) revert status if it advanced past the stage
//   5) audit to payment_logs
const PAID_FLAG: Record<string, string> = {
  pre_slip_url: "payment_confirmed",
  order_before_slip: "order_before_paid",
  order_after_slip: "order_after_paid",
};
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
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
    const paidFlag = PAID_FLAG[slipField] ?? null;

    // Revert (don't delete) so payment_no + step_no + amount stay stable when
    // the slip is re-uploaded + re-confirmed. Clears slip data + confirm meta
    // back to pending.
    await db.request().input("id", sql.Int, payId).query(`
      UPDATE payments SET
        slip_data = NULL, slip_data_2 = NULL, slip_data_3 = NULL, slip_data_4 = NULL, slip_data_5 = NULL,
        slip_mime = NULL, slip_mime_2 = NULL, slip_mime_3 = NULL, slip_mime_4 = NULL, slip_mime_5 = NULL,
        slip_filename = NULL, slip_filename_2 = NULL, slip_filename_3 = NULL, slip_filename_4 = NULL, slip_filename_5 = NULL,
        confirmed_at = NULL,
        confirmed_by = NULL,
        payment_method = NULL
      WHERE id = @id
    `);

    // Legacy slip_fields also flipped a leads column on confirm — flip it back.
    // Dynamic per-installment slips (order_installment_<i>) have no column.
    if (slipField === "pre_slip_url") {
      await db.request().input("lead_id", sql.Int, pay.lead_id)
        .query(`UPDATE leads SET
          pre_slip_url = NULL, payment_confirmed = 0,
          pre_doc_no = NULL, pre_total_price = NULL, pre_package_id = NULL, pre_booked_at = NULL,
          status = CASE WHEN status = 'survey' THEN 'pre_survey' ELSE status END,
          updated_at = GETDATE()
          WHERE id = @lead_id`);
    } else if (paidFlag) {
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

    // Re-derive legacy order_before_paid / order_after_paid after undo of an installment.
    if (/^order_installment_\d+$/.test(slipField)) {
      await syncOrderPaidFlags(db, pay.lead_id).catch(e => console.error("syncOrderPaidFlags failed:", e));
    }

    return NextResponse.json({ ok: true, lead_id: pay.lead_id });
  } catch (e) {
    console.error("DELETE /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
