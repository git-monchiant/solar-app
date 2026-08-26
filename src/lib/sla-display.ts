const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export type SlaWorkflowStage = "pre_survey" | "booking" | "survey" | "quote" | "order" | "wait_install" | "install" | "warranty";

export const SLA_WORKFLOW_STAGE_BY_POLICY: Record<string, SlaWorkflowStage> = {
  FIRST_CONTACT: "pre_survey",
  CONTACT_RETRY: "pre_survey",
  ELECTRICITY_ASSESSMENT: "pre_survey",
  BOOK_SURVEY: "booking",
  SITE_SURVEY: "survey",
  PROPOSAL_ROI: "quote",
  DEPOSIT_CLOSE: "order",
  PAYMENT_INSTALLMENT_1: "order",
  LOAN_PREAPPROVAL: "order",
  SCHEDULE_INSTALLATION: "wait_install",
  INSTALLATION: "install",
  CLOSE_LEAD: "warranty",
};

export function slaWorkflowStage(policyCode?: string | null): SlaWorkflowStage | null {
  return policyCode ? SLA_WORKFLOW_STAGE_BY_POLICY[policyCode] ?? null : null;
}

/**
 * The one place a policy's step name is written. sla-service.ts reconciles
 * instances with these strings and the UI reads them back through
 * slaTaskLabel(), so a renamed step lands in both without a data migration.
 *
 * lead_sla_instances.task_name is only a snapshot taken when the row was last
 * reconciled — refreshOpenSlaStates() rewrites `status` on every Today load but
 * never the name, so rows created before a rename keep the old wording until
 * someone edits that lead. Reading through the map avoids showing that stale
 * copy. CONTACT_RETRY is absent on purpose: its name carries the round number
 * ("ติดตามลูกค้าครั้งที่ 2"), so it falls back to the stored value.
 */
export const SLA_TASK_LABEL: Record<string, string> = {
  FIRST_CONTACT: "ติดต่อ Lead ครั้งแรก",
  ELECTRICITY_ASSESSMENT: "ประเมินและกำหนด Grade Lead",
  BOOK_SURVEY: "ยืนยันวัน เวลา และนัดหมาย Pre-Survey",
  SITE_SURVEY: "เข้าตรวจสำรวจหน้างาน",
  PROPOSAL_ROI: "จัดส่ง Proposal พร้อม ROI และทางเลือกการเงิน",
  DEPOSIT_CLOSE: "ติดตามปิดการขายและรับมัดจำ",
  PAYMENT_INSTALLMENT_1: "ติดตามชำระเงินงวดที่ 1 เพื่อยืนยันราคา",
  LOAN_PREAPPROVAL: "ติดตามผลอนุมัติเบื้องต้นจากธนาคาร",
  SCHEDULE_INSTALLATION: "นัดวันติดตั้งและแจ้งเตรียมเอกสาร",
  INSTALLATION: "ติดตั้ง ทดสอบระบบ และส่งมอบงาน",
  CLOSE_LEAD: "ปิด Lead เมื่อออกใบรับประกัน",
};

export function slaTaskLabel(policyCode?: string | null, taskName?: string | null): string {
  return (policyCode ? SLA_TASK_LABEL[policyCode] : null) ?? taskName ?? "งาน SLA";
}

/**
 * True when one of the lead's SLA clocks already IS the follow-up appointment,
 * so the card must not print the same date twice. Takes every SLA the card
 * holds — CONTACT_RETRY is often not the most urgent one, and the collapsed
 * card only renders the first.
 */
export function slaOwnsFollowUpDate(
  items: { policy_code?: string | null; due_at?: string | null }[],
  nextFollowUp?: string | null,
): boolean {
  if (!nextFollowUp) return false;
  const followUpDay = String(nextFollowUp).slice(0, 10);
  return items.some(item =>
    item.policy_code === "CONTACT_RETRY"
    && !!item.due_at
    && String(item.due_at).slice(0, 10) === followUpDay);
}

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
