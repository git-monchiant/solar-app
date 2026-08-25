const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokHour(value: Date): number {
  return new Date(value.getTime() + BANGKOK_OFFSET_MS).getUTCHours();
}

/**
 * Human-readable time rules for the SLA clocks shown in Lead Timeline.
 * Keep these aligned with the anchors and durations reconciled in
 * sla-service.ts. FIRST_CONTACT is replaced at runtime by the applicable
 * Bangkok receipt window so the text explains its non-fixed duration.
 */
export const SLA_TIME_CONDITION_TEXT = {
  FIRST_CONTACT: "กำหนดตามช่วงเวลาที่รับ Lead",
  CONTACT_RETRY: "แต่ละรอบนับ 3/5/7/30 วันปฏิทินจากครั้งก่อนที่ติดต่อไม่ได้",
  ELECTRICITY_ASSESSMENT: "ภายใน 24 ชม. หลังติดต่อ Lead สำเร็จ",
  BOOK_SURVEY: "ภายใน 24 ชม. หลังผ่านขั้นตอนยืนยันค่าสำรวจ",
  SITE_SURVEY: "ภายใน 7 วัน นับจากเวลานัดสำรวจที่ยืนยันแล้ว",
  PROPOSAL_ROI: "ภายใน 2 วัน หลังสำรวจเสร็จ",
  DEPOSIT_CLOSE: "ภายใน 3 วัน หลังส่ง Proposal/เข้า Order",
  PAYMENT_INSTALLMENT_1: "ภายใน 7 วัน หลังลูกค้าได้รับใบเสนอราคา",
  LOAN_PREAPPROVAL: "ภายใน 15 วัน หลังสำรวจและเอกสารสินเชื่อครบ",
  SCHEDULE_INSTALLATION: "ภายใน 3 วัน หลังยืนยันรับเงินมัดจำ",
  INSTALLATION: "ภายใน 15 วัน นับจากเวลานัดติดตั้ง",
  CLOSE_LEAD: "ภายใน 3 วัน หลังติดตั้งจริงเสร็จ",
} as const;

export function slaTimeConditionText(policyCode: string, startedAt: string): string | null {
  if (policyCode === "FIRST_CONTACT") {
    const receivedAt = new Date(startedAt);
    if (!Number.isNaN(receivedAt.getTime())) {
      const hour = bangkokHour(receivedAt);
      if (hour >= 9 && hour < 19) {
        return "รับ Lead 09:00–18:59 → ไม่เกิน 23:59 วันเดียวกัน";
      }
      if (hour >= 19) {
        return "รับ Lead 19:00–23:59 → ไม่เกิน 12:00 วันถัดไป";
      }
      return "รับ Lead 00:00–08:59 → ไม่เกิน 12:00 วันเดียวกัน";
    }
  }
  return SLA_TIME_CONDITION_TEXT[policyCode as keyof typeof SLA_TIME_CONDITION_TEXT] ?? null;
}
