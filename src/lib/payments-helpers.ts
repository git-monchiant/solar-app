import sql from "mssql";
import type { ConnectionPool } from "mssql";

// Re-derive order_before_paid / order_after_paid from the lead's
// order_installments JSON + confirmed payments. Called after a per-installment
// confirm/revert so legacy flags stay correct (downstream gates still read them).
//
// Logic:
//   - "before" group = rows with `when="after"` excluded (default new rows
//     have when undefined, which we treat as "before").
//   - flag is true when the group has ≥1 row AND every row is paid.
//   - empty group → flag stays false (no payments to wait on, but also no
//     reason to claim "paid").
export async function syncOrderPaidFlags(db: ConnectionPool, leadId: number): Promise<void> {
  const r = await db.request().input("id", sql.Int, leadId).query(`SELECT order_installments FROM leads WHERE id = @id`);
  const raw = r.recordset[0]?.order_installments;
  if (!raw) return;
  let arr: Array<{ when?: string }> = [];
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) arr = parsed; } catch { return; }
  if (arr.length === 0) return;

  const paidRes = await db.request().input("id", sql.Int, leadId).query(`
    SELECT slip_field FROM payments
    WHERE lead_id = @id AND confirmed_at IS NOT NULL AND slip_field LIKE 'order_installment_%'
  `);
  const paidIdx = new Set<number>(
    paidRes.recordset.map((p: { slip_field: string }) => parseInt(p.slip_field.replace("order_installment_", ""))).filter((n: number) => !isNaN(n))
  );

  const beforeIdx = arr.map((row, i) => row?.when === "after" ? -1 : i).filter(i => i >= 0);
  const afterIdx = arr.map((row, i) => row?.when === "after" ? i : -1).filter(i => i >= 0);
  const beforeAllPaid = beforeIdx.length > 0 && beforeIdx.every(i => paidIdx.has(i));
  const afterAllPaid = afterIdx.length > 0 && afterIdx.every(i => paidIdx.has(i));

  await db.request()
    .input("id", sql.Int, leadId)
    .input("before_paid", sql.Bit, beforeAllPaid ? 1 : 0)
    .input("after_paid", sql.Bit, afterAllPaid ? 1 : 0)
    .query(`UPDATE leads SET order_before_paid = @before_paid, order_after_paid = @after_paid, updated_at = GETDATE() WHERE id = @id`);
}
