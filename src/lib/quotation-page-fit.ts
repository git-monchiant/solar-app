/**
 * ความจุของตารางรายการบนใบเสนอราคาหน้า 1
 *
 * หน้าเอกสารสูงตายตัว 279.4mm และ `.page` ตั้ง overflow:hidden ไว้ ถ้ารายการเยอะ
 * ตารางจะดันบล็อกยอดเงินตกขอบแล้ว "ถูกตัดทิ้งเงียบ ๆ" ไม่มี error ไม่มีคำเตือน
 * (ยอดรวมและตัวหนังสือจำนวนเงินหายจากเอกสารสัญญา) จึงต้องกันไว้ตั้งแต่ในระบบ
 *
 * ตัวเลขทั้งหมดได้จากการวัดหน้าจริงด้วย headless Chrome:
 *   - 1 บรรทัดของตาราง สูง 20px · พื้นที่ที่ใช้ได้ 1056px
 *   - ช่องชื่อรายการกว้าง 526px ที่ฟอนต์ 14.67px → ราว 75 ตัวอักษรไทยต่อบรรทัด
 *   - ความจุลดลง 1 บรรทัดต่องวดชำระที่เพิ่มมา 1 งวด (บล็อกงวดอยู่ในตารางเดียวกัน)
 *     วัดได้ 2 งวด→24 · 3 งวด→23 · 4 งวด→22 · 5 งวด→21  ⇒  26 − จำนวนงวด
 */

/** จำนวนตัวอักษรต่อบรรทัดในช่อง "รายการ" ก่อนตัดขึ้นบรรทัดใหม่ */
export const QUOTATION_CHARS_PER_LINE = 75;

/** ความจุเป็นบรรทัดของตารางรายการ ขึ้นกับจำนวนงวดชำระ */
export function getQuotationRowCapacity(paymentTermCount: number): number {
  const terms = Math.max(1, Math.floor(Number(paymentTermCount) || 0));
  return Math.max(8, 26 - terms);
}

/** ชื่อรายการยาว ๆ ถูกตัดขึ้นบรรทัดใหม่ กินที่มากกว่า 1 บรรทัด */
export function countQuotationRowLines(text: unknown): number {
  const length = String(text ?? "").trim().length;
  return Math.max(1, Math.ceil(length / QUOTATION_CHARS_PER_LINE));
}

export type QuotationPageFit = {
  /** จำนวนบรรทัดที่ตารางกินจริง (รวมชื่อที่ตัดขึ้นบรรทัดใหม่) */
  used: number;
  capacity: number;
  /** เกินความจุ = ยอดเงินจะถูกตัดหายจากเอกสาร */
  over: boolean;
  /** เต็มพอดี ยังพิมพ์ได้ แต่เพิ่มอีกบรรทัดเดียวก็ล้น */
  tight: boolean;
};

/**
 * `rowTexts` = ข้อความของ "ทุกแถว" ที่จะขึ้นบนตาราง เรียงตามที่พิมพ์
 * (แถวหัวข้อแพ็กเกจ + แถวรายละเอียด + แถวงานเพิ่ม — ทุกรายการได้ 1 แถวเสมอ)
 */
export function measureQuotationPageFit(
  rowTexts: readonly unknown[],
  paymentTermCount: number,
): QuotationPageFit {
  const used = rowTexts.reduce<number>((total, text) => total + countQuotationRowLines(text), 0);
  const capacity = getQuotationRowCapacity(paymentTermCount);
  return { used, capacity, over: used > capacity, tight: used === capacity };
}
