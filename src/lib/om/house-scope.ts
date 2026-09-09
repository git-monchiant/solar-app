// การจัดกลุ่มบ้าน O&M — ใช้ร่วมกันระหว่าง /houses/groups (นับ) กับ /houses (ลิสต์)
// เพื่อให้ "ตัวเลขบนหัวกลุ่ม" กับ "จำนวนบ้านที่เปิดเข้าไปเห็น" ตรงกันเป๊ะเสมอ (ห้าม logic แยกสองที่)
//
// Scope ลิสต์บ้าน (ผู้ใช้เคาะ 3 ก.ย. 69 — mockup 20260903_01):
//   ★ แนวราบอย่างเดียว · ลิสต์หลักแสดง/นับเฉพาะ "บ้านแนวราบที่ให้บริการ" =
//     โอนแล้ว·เคยบริการ / VIP / ลูกค้านอกโครงการ
//   ★ เกณฑ์ลูกผสม: เคยล้างแผง "หรือ" REM มีสัญญาโอน → แสดงเสมอ
//     (บ้านที่ป้าย import ค้างว่า พร้อมขาย/บ้านตัวอย่าง แต่ขายจริงแล้ว จะดึงกลับเอง — กันบ้านจริงหาย)
//   ★ ซ่อน (ข้อมูลอยู่ครบ ไม่ลบ): ไม่ใช่แนวราบ (คอนโด/สนง.ขาย/ส่วนกลาง) · ยังไม่ขาย · บ้านตัวอย่าง

export const HG = {
  VIP: "__VIP__",
  NOPJ: "__NOPJ__",       // แนวราบนอกโครงการเสนา = ลูกค้าทั่วไป (ซื้อโซลาร์เอง)
  CONDO: "__CONDO__",
  SALES: "__SALES__",
  FACILITY: "__FACILITY__",
  UNSOLD: "__UNSOLD__",   // ห้องว่าง/พร้อมขาย ที่ยังไม่มีสัญญาโอน + ไม่เคยล้าง
  DEMO: "__DEMO__",       // บ้านตัวอย่าง (โครงการ demo หรือ unit_status = บ้านตัวอย่าง) ที่ยังไม่ขาย
} as const;

// กลุ่มที่ "ซ่อนจากลิสต์หลัก" — ไม่นับใน total ของหน้าบ้าน (แต่เปิดดูรายกลุ่มได้)
export const HIDDEN_GROUPS: string[] = [HG.CONDO, HG.SALES, HG.FACILITY, HG.UNSOLD, HG.DEMO];

// ป้ายกลุ่มพิเศษ (กลุ่มที่ขึ้นต้น __ ไม่ใช่รหัสโครงการ)
export const GROUP_LABEL: Record<string, string> = {
  [HG.VIP]: "VIP · นอกโครงการ",
  [HG.NOPJ]: "ลูกค้าทั่วไป · นอกโครงการ",
  [HG.CONDO]: "คอนโด",
  [HG.SALES]: "สำนักงานขาย",
  [HG.FACILITY]: "ส่วนกลาง",
  [HG.UNSOLD]: "ยังไม่ขาย",
  [HG.DEMO]: "บ้านตัวอย่าง",
};

// SQL: คืน "bucket" ของบ้านหนึ่งหลัง — รับ SQL expression ของแต่ละ input
//   groups ส่งคอลัมน์จาก #temp · houses ส่ง correlated EXISTS — แต่ logic เดียวกันเป๊ะ
//   ★ ลำดับสำคัญ: ไม่ใช่แนวราบมาก่อน (คอนโด/สนง.ขาย/ส่วนกลาง ไม่มีทางอยู่ลิสต์หลัก)
export function bucketSql(x: {
  seg: string; vip: string; demo: string; unit: string; washed: string; rem: string; pid: string;
}): string {
  return `CASE
    WHEN ${x.seg} = 'condo'        THEN '${HG.CONDO}'
    WHEN ${x.seg} = 'sales_office' THEN '${HG.SALES}'
    WHEN ${x.seg} = 'facility'     THEN '${HG.FACILITY}'
    WHEN ${x.vip} = 1 THEN '${HG.VIP}'
    WHEN ${x.washed} = 1 OR ${x.rem} = 1
         OR (${x.demo} = 0 AND ${x.unit} NOT IN (N'ห้องว่าง', N'พร้อมขาย', N'บ้านตัวอย่าง'))
      THEN CASE WHEN ${x.pid} IS NULL THEN '${HG.NOPJ}' ELSE ${x.pid} END
    WHEN ${x.demo} = 1 OR ${x.unit} = N'บ้านตัวอย่าง' THEN '${HG.DEMO}'
    ELSE '${HG.UNSOLD}'
  END`;
}

// เงื่อนไข SQL "อยู่ในลิสต์หลัก (แสดง)" — bucket ไม่อยู่ในกลุ่มซ่อน
export function shownSql(bucketExpr: string): string {
  return `${bucketExpr} NOT IN (${HIDDEN_GROUPS.map((g) => `N'${g}'`).join(", ")})`;
}
