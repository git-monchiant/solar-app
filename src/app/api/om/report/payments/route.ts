import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { fixDates } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// รายงานรายรับค่าบริการงาน O&M (แผน docs/plan/20260924-02 เฟส 4 · ผู้ใช้เคาะ 24 ก.ย. ข้อ 9 "แยกรายงาน")
// ★ 1 แถว = ใบเสนอราคา O&M 1 ใบที่ส่งให้ลูกค้าแล้ว หรือมีเงินผูกอยู่ (แถว payments slip_field = om_quote_<id>)
//   รายงานรายรับของฝั่งขาย (/api/report/payments) ไม่มีเงินก้อนนี้ปน — กรองด้วย SALES_PAYMENTS
// ★ สิทธิ์: บัญชี + admin + หัวหน้า (Sale Sup / Solar Sup ดูผลงาน O&M ได้) — ชุดเดียวกับเมนูที่มองเห็น
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, ["admin", "account", "sales_sup", "solar_sup"]);
  if (gate.error) return gate.error;
  const db = await getOmDb();
  const SLOTS = 5;
  const slotCols = Array.from({ length: SLOTS }, (_, i) => `DATALENGTH(p.slip_data${i ? `_${i + 1}` : ""}) b${i + 1}`).join(", ");
  const r = await db.request().query(`
    SELECT q.id quotation_id, q.doc_no, q.status quotation_status, q.package_name_snapshot,
           q.contract_total_incl_vat total, q.sent_to_customer_at, q.approved_at,
           omp.plan_type, b.id booking_id, b.status job_status, b.house_id, h.house_number,
           COALESCE(pj.name_th, h.project_name) project_name, l.full_name customer_name, l.phone,
           cu.full_name created_by_name
      FROM quotations q
      JOIN om_bookings b ON b.id = q.om_booking_id
      JOIN om_houses h ON h.id = b.house_id
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
      JOIN leads l ON l.id = q.lead_id
      LEFT JOIN om_packages omp ON omp.id = q.om_package_id
      LEFT JOIN users cu ON cu.id = q.created_by
     WHERE q.om_booking_id IS NOT NULL
       AND (q.sent_to_customer_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = q.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)))
     ORDER BY COALESCE(q.sent_to_customer_at, q.approved_at) DESC, q.id DESC;
    SELECT q.id quotation_id, p.id, p.amount, p.payment_method, p.submitted_at, p.confirmed_at, p.confirmed_by, ${slotCols}
      FROM payments p
      JOIN quotations q ON q.lead_id = p.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)
     WHERE p.slip_field LIKE 'om[_]quote[_]%'
     ORDER BY p.id;`);
  const sets = r.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const byQuote = new Map<number, Array<Record<string, unknown>>>();
  for (const row of fixDates(sets[1] ?? [])) {
    const urls: string[] = [];
    for (let n = 1; n <= SLOTS; n++) {
      if (Number(row[`b${n}`] || 0) > 0) urls.push(n === 1 ? `/api/payments/${row.id}` : `/api/payments/${row.id}?slot=${n}`);
      delete row[`b${n}`];
    }
    const qid = Number(row.quotation_id);
    byQuote.set(qid, [...(byQuote.get(qid) ?? []), { ...row, amount: Number(row.amount), slip_urls: urls }]);
  }
  const rows = fixDates(sets[0] ?? []).map((q) => {
    const pays = byQuote.get(Number(q.quotation_id)) ?? [];
    const received = pays.filter((p) => p.confirmed_at).reduce((s, p) => s + Number(p.amount), 0);
    const pending = pays.filter((p) => !p.confirmed_at).reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(q.total || 0);
    return {
      ...q, total, received, pending, outstanding: Math.max(0, total - received),
      paid_at: (pays.find((p) => p.confirmed_at)?.confirmed_at as string | undefined) ?? null,
      payments: pays,
    };
  });
  const summary = rows.reduce((a, x) => ({
    count: a.count + 1, total: a.total + x.total, received: a.received + x.received, outstanding: a.outstanding + x.outstanding,
  }), { count: 0, total: 0, received: 0, outstanding: 0 });
  return NextResponse.json({ rows, summary });
}
