/**
 * Short start-to-finish descriptions for the SLA clocks shown in Lead Timeline.
 * Keep these aligned with the durable milestones reconciled in sla-service.ts.
 */
export const SLA_CONDITION_TEXT = {
  FIRST_CONTACT: "ลงทะเบียน Lead → บันทึกผลการติดต่อครั้งแรก",
  CONTACT_RETRY: "บันทึกว่าติดต่อไม่ได้ครั้งก่อน → บันทึกผลการติดต่อครั้งถัดไป",
  ELECTRICITY_ASSESSMENT: "ติดต่อ Lead สำเร็จ → กำหนด Grade Lead",
  BOOK_SURVEY: "ผ่านขั้นตอนยืนยันค่าสำรวจ → บันทึกนัดสำรวจ",
  SITE_SURVEY: "ถึงเวลานัดสำรวจที่ยืนยันแล้ว → ส่งต่องานจาก Survey ไป Quotation",
  PROPOSAL_ROI: "สำรวจเสร็จ → ส่งต่องานเข้า Order",
  DEPOSIT_CLOSE: "ส่ง Proposal/เข้า Order → ยืนยันรับเงินมัดจำ",
  PAYMENT_INSTALLMENT_1: "ลูกค้าได้รับใบเสนอราคา → ยืนยันชำระเงินงวดที่ 1",
  LOAN_PREAPPROVAL: "สำรวจและเอกสารสินเชื่อครบ → บันทึกผลอนุมัติเบื้องต้น",
  SCHEDULE_INSTALLATION: "ยืนยันรับเงินมัดจำ → บันทึกนัดติดตั้ง",
  INSTALLATION: "ถึงเวลานัดติดตั้ง → บันทึกวันที่ติดตั้งจริงเสร็จ",
  CLOSE_LEAD: "ติดตั้งจริงเสร็จ → ออกใบรับประกัน",
} as const;

export function slaConditionText(policyCode: string): string | null {
  return SLA_CONDITION_TEXT[policyCode as keyof typeof SLA_CONDITION_TEXT] ?? null;
}
