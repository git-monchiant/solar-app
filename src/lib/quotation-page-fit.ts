/**
 * การแบ่งหน้าของตารางรายการบนใบเสนอราคา
 *
 * เดิมใบเสนอราคาเป็น "2 หน้าตายตัว" และ `.page` ตั้ง overflow:hidden ไว้ ถ้ารายการ
 * เยอะตารางจะดันบล็อกยอดเงินตกขอบแล้ว "ถูกตัดทิ้งเงียบ ๆ" ระบบจึงต้องห้ามไม่ให้
 * ส่งอนุมัติตั้งแต่แรก ตอนนี้เปลี่ยนเป็น "ล้นแล้วขึ้นตารางหน้าใหม่" ไฟล์นี้จึงเปลี่ยน
 * บทบาทจาก "ตัวกันล้น" มาเป็น "ตัวแบ่งหน้า"
 *
 * ฟังก์ชัน paginateQuotationRows() ไม่ผูกกับหน่วยวัด — ใส่ความสูงเป็น px ที่วัดจาก
 * เบราว์เซอร์จริงก็ได้ (เส้นทางสร้าง PDF ทำแบบนั้น) หรือใส่เป็น "บรรทัด" ที่ประมาณเอา
 * ก็ได้ (หน้าจอแก้ไขใบเสนอราคาใช้แบบนั้น เพราะไม่มีเบราว์เซอร์ให้วัด)
 */

/** จำนวนตัวอักษรต่อบรรทัดในช่อง "รายการ" ก่อนตัดขึ้นบรรทัดใหม่ */
export const QUOTATION_CHARS_PER_LINE = 75;

/** ชื่อรายการยาว ๆ ถูกตัดขึ้นบรรทัดใหม่ กินที่มากกว่า 1 บรรทัด */
export function countQuotationRowLines(text: unknown): number {
  const length = String(text ?? "").trim().length;
  return Math.max(1, Math.ceil(length / QUOTATION_CHARS_PER_LINE));
}

export type QuotationRowMetric = {
  /** ความสูงของแถว (px จากการวัดจริง หรือจำนวน "บรรทัด" ตอนประมาณ) */
  height: number;
  /**
   * แถวหัวข้อ (แถวที่มีเลขลำดับ) — ห้ามค้างอยู่ท้ายหน้าโดยที่บรรทัดรายละเอียด
   * ของมันไปขึ้นหน้าใหม่
   */
  isHead: boolean;
};

export type QuotationPaginationMetrics = {
  /** ความสูงที่พิมพ์ได้ต่อหน้า (หักขอบกระดาษบน–ล่างแล้ว) */
  usable: number;
  /** หัวเอกสารเต็ม (โลโก้ + ข้อมูลลูกค้า + ผู้ติดต่อ) ใช้เฉพาะหน้าแรก */
  firstHeader: number;
  /** หัวเอกสารย่อของหน้าต่อ (โลโก้ + เลขที่ใบ + ชื่อลูกค้า) */
  contHeader: number;
  /** แถวหัวตาราง (ลำดับ / รายการ / จำนวนเงิน) — ซ้ำทุกหน้า */
  thead: number;
  /** บล็อกท้าย: เงื่อนไขชำระเงิน + ธนาคาร/QR + สรุปยอด — ต้องอยู่หน้าเดียวกับแถวสุดท้าย */
  tail: number;
};

export type QuotationRowPage = {
  /** ดัชนีแถวแรกของหน้านี้ */
  start: number;
  /** ดัชนีถัดจากแถวสุดท้ายของหน้านี้ (exclusive) */
  end: number;
  /** หน้านี้เป็นหน้าที่แบกบล็อกท้าย (เงื่อนไขชำระเงิน + สรุปยอด) */
  isLast: boolean;
  /** ที่ว่างที่เหลือบนหน้า — ใช้ตัดสินว่าเงื่อนไข/ข้อกำหนดลงหน้านี้ได้กี่หัวข้อ */
  slack: number;
};

/**
 * เลื่อนจุดตัดหน้าให้ไม่เกิดแถวกำพร้า
 *   1. แถวหัวข้อค้างท้ายหน้าโดยรายละเอียดไปขึ้นหน้าใหม่ → ยกหัวข้อตามลงไปด้วย
 *   2. รายละเอียดบรรทัดสุดท้ายของกลุ่มไปยืนเดี่ยวบนหน้าใหม่ → ดึงเพื่อนลงไปอยู่ด้วย
 * ทั้งสองข้อเลื่อนจุดตัด "ขึ้น" อย่างเดียว จึงไม่มีทางวนไม่รู้จบ และคงเหลืออย่างน้อย
 * 1 แถวบนหน้าปัจจุบันเสมอเพื่อให้การแบ่งหน้าเดินหน้าต่อได้
 */
function avoidOrphanRows(
  rows: readonly QuotationRowMetric[],
  start: number,
  end: number,
): number {
  let cut = end;
  for (let guard = 0; guard <= rows.length; guard++) {
    if (cut <= start + 1 || cut >= rows.length) break;
    if (rows[cut - 1].isHead && !rows[cut].isHead) {
      cut--;
      continue;
    }
    if (!rows[cut].isHead && cut + 1 < rows.length && rows[cut + 1].isHead) {
      cut--;
      continue;
    }
    break;
  }
  return Math.min(Math.max(cut, start + 1), end);
}

/**
 * หั่นแถวของตารางรายการออกเป็นหน้า ๆ
 *
 * กติกา
 *   - หน้าแรกใช้หัวเอกสารเต็ม หน้าต่อ ๆ ไปใช้หัวย่อ (โลโก้ + เลขที่ใบ + ลูกค้า)
 *   - บล็อกท้าย (งวดชำระ + ธนาคาร/QR + สรุปยอด) อยู่หน้าเดียวกับแถวสุดท้ายเสมอ
 *     ถ้าเบียดจนไม่เหลือที่ให้แถวไหนเลย บล็อกท้ายจะได้หน้าของตัวเอง
 */
export function paginateQuotationRows(
  rows: readonly QuotationRowMetric[],
  metrics: QuotationPaginationMetrics,
): QuotationRowPage[] {
  const pages: QuotationRowPage[] = [];
  let index = 0;
  for (let guard = 0; guard <= rows.length + 1; guard++) {
    const isFirst = pages.length === 0;
    // ที่ว่างสำหรับ "แถว" หลังหักหัวเอกสารและหัวตาราง
    const room =
      metrics.usable -
      (isFirst ? metrics.firstHeader : metrics.contHeader) -
      metrics.thead;
    const fill = (limit: number) => {
      let used = 0;
      let end = index;
      while (end < rows.length && used + rows[end].height <= limit) {
        used += rows[end].height;
        end++;
      }
      return { end, used };
    };

    // ลองปิดจบที่หน้านี้ก่อน (ต้องมีที่พอสำหรับบล็อกท้ายด้วย)
    const asLast = fill(room - metrics.tail);
    if (asLast.end >= rows.length) {
      pages.push({
        start: index,
        end: rows.length,
        isLast: true,
        slack: room - metrics.tail - asLast.used,
      });
      return pages;
    }

    // ปิดจบไม่ได้ → หน้านี้เป็นหน้าที่ยังไม่จบตาราง อัดแถวให้เต็มหน้า
    const asCont = fill(room);
    const end = avoidOrphanRows(
      rows,
      index,
      Math.max(asCont.end, index + 1), // เดินหน้าอย่างน้อย 1 แถวเสมอ กันลูปค้าง
    );
    let used = 0;
    for (let row = index; row < end; row++) used += rows[row].height;
    pages.push({ start: index, end, isLast: false, slack: room - used });
    index = end;

    if (index >= rows.length) break;
  }

  // แถวหมดพอดีแต่บล็อกท้ายยังไม่ได้ลง → ให้บล็อกท้ายไปอยู่หน้าใหม่ตามลำพัง
  pages.push({
    start: rows.length,
    end: rows.length,
    isLast: true,
    slack: metrics.usable - metrics.contHeader - metrics.tail,
  });
  return pages;
}

/* ------------------------------------------------------------------------- *
 * ค่าประมาณสำหรับฝั่งที่ไม่มีเบราว์เซอร์ให้วัด (หน้าจอแก้ไขใบเสนอราคา)
 *
 * หน่วยเป็น "บรรทัด" = ความสูงแถวตาราง 1 แถว (5mm) ตัวเลขทั้งชุดสอบทานกับความจุ
 * ที่วัดจริงด้วย headless Chrome: กระดาษ A4 ใบที่จบในหน้าเดียว + งวดชำระ n งวด
 * จุได้ 29 − n บรรทัด (2 งวด→27 · 3 งวด→26 · 4 งวด→25 · 5 งวด→24)
 * (สมัยที่ยังเป็นกระดาษ Letter เตี้ยกว่า A4 อยู่ 17.6mm ความจุคือ 26 − n)
 * ------------------------------------------------------------------------- */

/** A4 297mm − ขอบบน 13mm − ขอบล่าง 7mm − เผื่อปัดเศษ 2mm = 275mm ÷ 5mm ต่อบรรทัด */
const ESTIMATE_USABLE = 55.0;
/** หัวเอกสารเต็ม: โลโก้ + ที่อยู่บริษัท + ตารางลูกค้า/ผู้ติดต่อ */
const ESTIMATE_FIRST_HEADER = 11.2;
/** หัวย่อของหน้าต่อ: โลโก้ + เลขที่ใบ + ชื่อลูกค้า/โครงการ */
const ESTIMATE_CONT_HEADER = 4.33;
const ESTIMATE_THEAD = 1.12;
/** แถวตารางจริงสูง 5.25mm ไม่ใช่ 5mm — 25 แถวคลาดกันไปกว่าหนึ่งบรรทัดถ้าปัดทิ้ง */
const ESTIMATE_ROW = 1.05;
/** บล็อกท้าย: ช่องว่าง 8mm + หัวข้อ + งวดละ 4.6mm + ธนาคาร/QR 25mm + สรุปยอด 31.5mm */
const estimateTail = (paymentTermCount: number) => 14.56 + 0.92 * paymentTermCount;

export function estimateQuotationMetrics(
  paymentTermCount: number,
): QuotationPaginationMetrics {
  const terms = Math.max(1, Math.floor(Number(paymentTermCount) || 0));
  return {
    usable: ESTIMATE_USABLE,
    firstHeader: ESTIMATE_FIRST_HEADER,
    contHeader: ESTIMATE_CONT_HEADER,
    thead: ESTIMATE_THEAD,
    tail: estimateTail(terms),
  };
}

/** ประมาณความสูงของแต่ละแถวจากความยาวชื่อรายการ */
export function estimateQuotationRowMetrics(
  rows: readonly { text: unknown; isHead: boolean }[],
): QuotationRowMetric[] {
  return rows.map((row) => ({
    height: countQuotationRowLines(row.text) * ESTIMATE_ROW,
    isHead: row.isHead,
  }));
}

/**
 * จำนวนหน้าของ "ใบเสนอราคา" ที่คาดว่าจะได้ (รวมหน้าเงื่อนไข/ลายเซ็นท้ายเล่ม 1 หน้า)
 * ใช้บอกผู้ใช้ตอนแก้ใบว่าเอกสารจะยาวกี่หน้า — ไม่ได้ใช้ตัดสินใจตอนพิมพ์จริง
 */
export function estimateQuotationPageCount(
  rows: readonly { text: unknown; isHead: boolean }[],
  paymentTermCount: number,
): number {
  const pages = paginateQuotationRows(
    estimateQuotationRowMetrics(rows),
    estimateQuotationMetrics(paymentTermCount),
  );
  return pages.length + 1;
}
