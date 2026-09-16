/** ยอดของงวดชำระ — ชุดคำนวณเดียวของทั้งระบบ
 *
 *  ทุกที่ที่ต้องรู้ว่า "งวดที่ N เป็นเงินเท่าไหร่" ต้องเรียกจากไฟล์นี้เท่านั้น
 *  ห้ามคำนวณ netTotal × pct เองซ้ำในหน้าอื่น เพราะเคยทำให้แต่ละหน้าได้เลขคนละตัว
 *  (lead 704: หน้าแก้ไขคิดได้ 232,000 แต่ตอนสร้างลิงก์ชำระเงินได้ 231,803
 *   แล้วเลขที่ผิดถูกบันทึกเป็น "เงินที่รับจริง" ทั้งที่หน้าเช็คเขียน 232,000)
 *
 *  ลำดับการหายอด
 *    1. amount ที่บันทึกไว้ในงวดนั้น  ← ค่าหลัก
 *    2. งวดสุดท้ายที่ระบบคิดให้      = ยอดที่เหลือหลังหักงวดอื่น
 *    3. pct                          ← ใช้เฉพาะงวดเก่าที่บันทึกก่อนมีฟิลด์ amount
 *
 *  % ใช้แค่ตอนกรอกเพื่อคำนวณยอดครั้งแรก หลังจากนั้นไม่เกี่ยวกับการคิดเงินอีก
 */

export type InstallmentRow = {
  pct?: number | null;
  amount?: number | null;
  when?: string | null;
};

export type OrderMoneyFields = {
  order_total?: unknown;
  order_discount_amount?: unknown;
  pre_total_price?: unknown;
};

/** ยอดที่ต้องแบ่งเป็นงวด = ยอดสัญญา − ส่วนลด − ค่าสำรวจ/เงินจองที่จ่ายมาแล้ว */
export function netTotalOf(lead: OrderMoneyFields): number {
  const total = Number(lead.order_total) || 0;
  if (total <= 0) return 0;
  const discount = Math.min(total, Number(lead.order_discount_amount) || 0);
  const effTotal = Math.max(0, total - discount);
  const deposit = Math.min(effTotal, Number(lead.pre_total_price) || 0);
  return Math.max(0, effTotal - deposit);
}

export function parseInstallmentRows(raw: unknown): InstallmentRow[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as InstallmentRow[]) : [];
  } catch {
    return [];
  }
}

/** งวดสุดท้ายที่ยังไม่ถูกจ่าย = แถวที่ระบบคิดยอดที่เหลือให้อัตโนมัติ
 *  (ไม่มีข้อมูลการจ่าย → ใช้แถวสุดท้าย เหมือนที่หน้าจอทำ) */
export function autoIndexOf(rows: InstallmentRow[], paidIdx?: Set<number>): number {
  if (rows.length === 0) return -1;
  if (paidIdx) {
    for (let i = rows.length - 1; i >= 0; i--) if (!paidIdx.has(i)) return i;
  }
  return rows.length - 1;
}

/** ยอดของงวด idx — ชุดเดียวที่ทุกหน้าต้องใช้ */
export function installmentAmount(
  rows: InstallmentRow[],
  idx: number,
  netTotal: number,
  paidIdx?: Set<number>,
): number {
  const row = rows[idx];
  if (!row || netTotal <= 0) return 0;

  const stored = (r: InstallmentRow) =>
    r.amount != null && Number.isFinite(Number(r.amount))
      ? Math.round(Number(r.amount))
      : Math.round((netTotal * (Number(r.pct) || 0)) / 100);

  if (idx === autoIndexOf(rows, paidIdx)) {
    const others = rows.reduce(
      (sum, r, i) => (i === idx ? sum : sum + stored(r)),
      0,
    );
    return Math.max(0, Math.round(netTotal - others));
  }
  return stored(row);
}

/** ยอดของทุกงวดในครั้งเดียว */
export function installmentAmounts(
  rows: InstallmentRow[],
  netTotal: number,
  paidIdx?: Set<number>,
): number[] {
  return rows.map((_r, i) => installmentAmount(rows, i, netTotal, paidIdx));
}
