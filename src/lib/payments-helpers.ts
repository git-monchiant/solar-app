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
  let arr: Array<{ when?: string }> = [];
  if (raw) {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) arr = parsed; } catch { arr = []; }
  }

  const paymentRes = await db.request().input("id", sql.Int, leadId).query(`
    SELECT slip_field, confirmed_at FROM payments
    WHERE lead_id = @id
      AND (slip_field LIKE 'order_installment_%' OR slip_field IN ('order_before_slip', 'order_after_slip'))
  `);
  const rows = paymentRes.recordset as Array<{ slip_field: string; confirmed_at: string | null }>;
  const paidRows = rows.filter(p => !!p.confirmed_at);
  const paidFields = new Set<string>(paidRows.map(p => p.slip_field));
  const paidIdx = new Set<number>(
    paidRows
      .filter((p: { slip_field: string }) => p.slip_field.startsWith("order_installment_"))
      .map((p: { slip_field: string }) => parseInt(p.slip_field.replace("order_installment_", "")))
      .filter((n: number) => !isNaN(n))
  );

  const beforeIdx = arr.map((row, i) => row?.when === "after" ? -1 : i).filter(i => i >= 0);
  const afterIdx = arr.map((row, i) => row?.when === "after" ? i : -1).filter(i => i >= 0);
  // Step 05's final collection is stored as the legacy order_after_slip field
  // (step 99), not as an order_installment_N row. A confirmed row must therefore
  // unlock order_after_paid even when the installment JSON has no "after" row.
  // If a legacy Step 05 row exists but is still pending/rejected, it takes
  // precedence and must keep the gate locked.
  const hasBeforeLegacy = rows.some(p => p.slip_field === "order_before_slip");
  const hasAfterLegacy = rows.some(p => p.slip_field === "order_after_slip");
  const beforeAllPaid = hasBeforeLegacy
    ? paidFields.has("order_before_slip")
    : beforeIdx.length > 0 && beforeIdx.every(i => paidIdx.has(i));
  const afterAllPaid = hasAfterLegacy
    ? paidFields.has("order_after_slip")
    : afterIdx.length > 0 && afterIdx.every(i => paidIdx.has(i));

  await db.request()
    .input("id", sql.Int, leadId)
    .input("before_paid", sql.Bit, beforeAllPaid ? 1 : 0)
    .input("after_paid", sql.Bit, afterAllPaid ? 1 : 0)
    .query(`UPDATE leads SET order_before_paid = @before_paid, order_after_paid = @after_paid, updated_at = GETDATE() WHERE id = @id`);
}

/** ยอดที่ "ควรเก็บ" ของงวด order_installment_<idx> คำนวณฝั่ง server ด้วยสูตรเดียว
 *  กับที่ OrderStep ใช้บนหน้าจอ:
 *
 *    netTotal = order_total − ส่วนลด − ค่าสำรวจที่จ่ายแล้ว
 *    ยอดงวด  = round(netTotal × pct / 100)
 *
 *  มีไว้ตรวจยอดที่ client ส่งมาก่อนบันทึก — เดิม API เชื่อ body.amount ตรง ๆ
 *  ถ้าหน้าจอคำนวณจากข้อมูลเก่า (เช่นยังไม่ทันโหลดค่าสำรวจ) ยอดผิดจะถูกบันทึกเงียบ ๆ
 *  แล้วไปโผล่เป็นเงินขาดตอนปิดงาน เช่น lead 686 งวด 2 บันทึก 117,400 ทั้งที่แผนคือ 117,600
 *
 *  คืน null เมื่อไม่ใช่ slip_field แบบงวด หรือข้อมูลไม่พอให้คำนวณ
 */
export async function plannedInstallmentAmount(
  db: ConnectionPool,
  leadId: number,
  slipField: string,
): Promise<number | null> {
  const m = /^order_installment_(\d+)$/.exec(slipField);
  if (!m) return null;
  const idx = parseInt(m[1]);
  const r = await db.request().input("id", sql.Int, leadId).query(
    `SELECT order_total, order_discount_amount, pre_total_price, order_installments
       FROM leads WHERE id = @id`,
  );
  const row = r.recordset[0];
  if (!row) return null;

  let arr: Array<{ pct?: number }> = [];
  try {
    const parsed = JSON.parse(row.order_installments || "[]");
    if (Array.isArray(parsed)) arr = parsed;
  } catch { return null; }
  const pct = Number(arr[idx]?.pct);
  if (!Number.isFinite(pct)) return null;

  const total = Number(row.order_total) || 0;
  if (total <= 0) return null;
  const discount = Math.min(total, Number(row.order_discount_amount) || 0);
  const effTotal = Math.max(0, total - discount);
  const deposit = Math.min(effTotal, Number(row.pre_total_price) || 0);
  const netTotal = Math.max(0, effTotal - deposit);
  return Math.round((netTotal * pct) / 100);
}
