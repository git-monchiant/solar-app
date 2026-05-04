import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Per-lead transaction rollup for the accounting report.
// Total value = order_total + install_extra_cost (fallback to pre_total_price when no order yet).
// Received = sum(payments.amount) per lead; each payment row is an installment line item.
// Outstanding = total - received.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
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
         OR EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = l.id)
      ORDER BY l.pre_booked_at DESC, l.id DESC
    `);

    // Pull confirmed AND pending payments — accountant needs to see both to
    // approve. Per row we resolve slip URLs from two sources:
    //   • Confirmed rows: payments.slip_data_{1..5} → /api/payments/{id}[?slot=N]
    //   • Pending rows: slip_files staging table → /api/slips/{id}
    // (Confirmed rows have empty staging because POST /api/payments deletes
    // slip_files on commit. Pending rows usually have empty slip_data.)
    const MAX_SLOTS = 5;
    const slotCols = Array.from({ length: MAX_SLOTS }, (_, i) => {
      const suffix = i === 0 ? "" : `_${i + 1}`;
      return `DATALENGTH(p.slip_data${suffix}) AS bytes_${i + 1}`;
    }).join(", ");
    const paymentsRes = await db.request().query(`
      SELECT p.id, p.lead_id, p.step_no, p.slip_field, p.doc_no, p.amount, p.description,
             p.confirmed_at, p.confirmed_by, p.payment_no, p.ref1,
             ${slotCols}
      FROM payments p
      ORDER BY p.step_no ASC, p.id ASC
    `);

    // PromptPay Ref1 — for pending rows that haven't been confirmed yet, ref1
    // hasn't been written to the row. Compute it the same way /api/qr does so
    // accountants can match the slip Ref1 against system records.
    const settingsRes = await db.request().query(`
      SELECT [key], value FROM app_settings WHERE [key] IN ('promptpay_mode', 'promptpay_ref1')
    `);
    const sMap: Record<string, string> = {};
    for (const row of settingsRes.recordset) sMap[row.key] = row.value || "";
    const ref1Prefix = sMap.promptpay_mode === "bill_payment" ? (sMap.promptpay_ref1 || "") : "";
    const computeRef1 = (leadId: number, stepNo: number): string | null => {
      if (!ref1Prefix) return null;
      return `${ref1Prefix}L${leadId}S${String(stepNo).padStart(2, "0")}`.slice(0, 20);
    };

    // Map (lead_id, slip_field) → staging slip_files ids — only SUBMITTED
    // ones (submitted_at IS NOT NULL) count toward the accountant's queue.
    // Drafts (uploader still working) are excluded so the queue only shows
    // slips the uploader has actively flagged for review.
    const stagingRes = await db.request().query(`
      SELECT id, lead_id, slip_field FROM slip_files
      WHERE submitted_at IS NOT NULL
      ORDER BY id ASC
    `);
    const stagingMap = new Map<string, number[]>();
    for (const sf of stagingRes.recordset as Array<{ id: number; lead_id: number; slip_field: string }>) {
      const key = `${sf.lead_id}::${sf.slip_field}`;
      const arr = stagingMap.get(key) || [];
      arr.push(sf.id);
      stagingMap.set(key, arr);
    }

    const byLead = new Map<number, Array<{
      id: number; step_no: number; slip_field: string; doc_no: string | null;
      amount: number; description: string | null;
      confirmed_at: string | null; confirmed_by: string | null;
      has_slip: boolean;
      slip_urls: string[];
      ref1: string | null;
      ref2: string | null;
    }>>();
    for (const row of fixDates(paymentsRes.recordset) as Array<Record<string, unknown>>) {
      const slipUrls: string[] = [];
      for (let n = 1; n <= MAX_SLOTS; n++) {
        const bytes = Number(row[`bytes_${n}`] || 0);
        if (bytes > 0) {
          slipUrls.push(n === 1 ? `/api/payments/${row.id}` : `/api/payments/${row.id}?slot=${n}`);
        }
      }
      const stageIds = stagingMap.get(`${row.lead_id}::${row.slip_field}`) || [];
      for (const sid of stageIds) slipUrls.push(`/api/slips/${sid}`);

      const leadId = row.lead_id as number;
      const stepNo = row.step_no as number;
      const arr = byLead.get(leadId) || [];
      arr.push({
        id: row.id as number,
        step_no: stepNo,
        slip_field: row.slip_field as string,
        doc_no: (row.doc_no as string | null) ?? null,
        amount: Number(row.amount || 0),
        description: (row.description as string | null) ?? null,
        confirmed_at: (row.confirmed_at as string | null) ?? null,
        confirmed_by: (row.confirmed_by as string | null) ?? null,
        has_slip: slipUrls.length > 0,
        slip_urls: slipUrls,
        ref1: (row.ref1 as string | null) || computeRef1(leadId, stepNo),
        ref2: (row.payment_no as string | null) ?? null,
      });
      byLead.set(leadId, arr);
    }

    const rows = (fixDates(leadsRes.recordset) as typeof leadsRes.recordset).map((l) => {
      const orderTotal = Number(l.order_total || 0);
      const extra = Number(l.install_extra_cost || 0);
      const preTotal = Number(l.pre_total_price || 0);
      const total_value = orderTotal > 0 ? orderTotal + extra : preTotal;
      const installments = byLead.get(l.lead_id) || [];
      // Only confirmed payments count toward "received" — pending rows with
      // unverified slips are NOT money in hand yet.
      const received = installments
        .filter(i => i.confirmed_at)
        .reduce((s, i) => s + i.amount, 0);
      const pendingRows = installments.filter(i => !i.confirmed_at && i.has_slip);
      const pendingApproval = pendingRows.length;
      const pendingAmount = pendingRows.reduce((s, i) => s + i.amount, 0);
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
        pending_approval: pendingApproval,
        pending_amount: pendingAmount,
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
