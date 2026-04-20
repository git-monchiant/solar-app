import { NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";

// Per-lead transaction rollup for the accounting report.
// Total value = order_total + install_extra_cost (fallback to pre_total_price when no order yet).
// Received = sum(payments.amount) per lead; each payment row is an installment line item.
// Outstanding = total - received.
export async function GET() {
  try {
    const db = await getDb();

    const leadsRes = await db.request().query(`
      SELECT l.id as lead_id, l.pre_doc_no, l.full_name, l.phone, l.payment_type, l.zone,
             l.status, l.pre_total_price, l.order_total, l.install_extra_cost,
             l.pre_booked_at, l.payment_confirmed,
             l.order_before_paid, l.order_after_paid,
             p.name as project_name, p.district, p.province,
             pk.name as package_name, pk.kwp,
             u.full_name as created_by_name
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN packages pk ON l.pre_package_id = pk.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      WHERE l.pre_doc_no IS NOT NULL
      ORDER BY l.pre_booked_at DESC
    `);

    const paymentsRes = await db.request().query(`
      SELECT id, lead_id, step_no, slip_field, doc_no, amount, description, confirmed_at, confirmed_by
      FROM payments
      ORDER BY confirmed_at ASC
    `);

    const byLead = new Map<number, Array<{
      id: number; step_no: number; slip_field: string; doc_no: string | null;
      amount: number; description: string | null; confirmed_at: string; confirmed_by: string | null;
    }>>();
    for (const row of fixDates(paymentsRes.recordset) as typeof paymentsRes.recordset) {
      const arr = byLead.get(row.lead_id) || [];
      arr.push({
        id: row.id, step_no: row.step_no, slip_field: row.slip_field,
        doc_no: row.doc_no, amount: Number(row.amount || 0),
        description: row.description, confirmed_at: row.confirmed_at, confirmed_by: row.confirmed_by,
      });
      byLead.set(row.lead_id, arr);
    }

    const rows = (fixDates(leadsRes.recordset) as typeof leadsRes.recordset).map((l) => {
      const orderTotal = Number(l.order_total || 0);
      const extra = Number(l.install_extra_cost || 0);
      const preTotal = Number(l.pre_total_price || 0);
      const total_value = orderTotal > 0 ? orderTotal + extra : preTotal;
      const installments = byLead.get(l.lead_id) || [];
      const received = installments.reduce((s, i) => s + i.amount, 0);
      const outstanding = Math.max(0, total_value - received);
      return {
        lead_id: l.lead_id,
        pre_doc_no: l.pre_doc_no,
        full_name: l.full_name,
        phone: l.phone,
        status: l.status,
        payment_type: l.payment_type,
        zone: l.zone,
        project_name: l.project_name,
        district: l.district,
        province: l.province,
        package_name: l.package_name,
        kwp: l.kwp,
        created_by_name: l.created_by_name,
        pre_booked_at: l.pre_booked_at,
        total_value,
        received,
        outstanding,
        installments,
      };
    });

    const summary = rows.reduce(
      (acc, r) => {
        acc.total_value += r.total_value;
        acc.received += r.received;
        acc.outstanding += r.outstanding;
        return acc;
      },
      { count: rows.length, total_value: 0, received: 0, outstanding: 0 },
    );

    return NextResponse.json({ rows, summary });
  } catch (error) {
    console.error("GET /api/report/payments error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
