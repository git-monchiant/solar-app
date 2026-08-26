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
 * ลำดับขั้นตอนจริงตามเส้นทางงาน ใช้เรียงตัวเลือกในตัวกรอง — เรียงตามตัวอักษรแล้ว
 * อ่านไม่ออกว่าขั้นไหนมาก่อนหลัง ("เข้าตรวจสำรวจ" ขึ้นก่อน "ติดต่อ Lead ครั้งแรก")
 * CONTACT_RETRY ต่อจาก FIRST_CONTACT เพราะเป็นรอบตามต่อของการติดต่อครั้งแรก
 */
export const SLA_POLICY_ORDER: readonly string[] = [
  "FIRST_CONTACT",
  "CONTACT_RETRY",
  "ELECTRICITY_ASSESSMENT",
  "BOOK_SURVEY",
  "SITE_SURVEY",
  "PROPOSAL_ROI",
  "DEPOSIT_CLOSE",
  "PAYMENT_INSTALLMENT_1",
  "LOAN_PREAPPROVAL",
  "SCHEDULE_INSTALLATION",
  "INSTALLATION",
  "CLOSE_LEAD",
];

/** ลำดับสำหรับ .sort() — policy ที่ยังไม่ได้ขึ้นทะเบียนไว้ไปต่อท้าย */
export function slaPolicyOrder(policyCode?: string | null): number {
  const index = policyCode ? SLA_POLICY_ORDER.indexOf(policyCode) : -1;
  return index === -1 ? SLA_POLICY_ORDER.length : index;
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

/**
 * ขั้นตอนที่เคย (หรือกำลัง) เกินกำหนด SLA สรุปต่อหนึ่งขั้นของแถบ pipeline
 * รวมมาจากหลาย policy ที่ตกอยู่ขั้นเดียวกัน เช่น DEPOSIT_CLOSE /
 * PAYMENT_INSTALLMENT_1 / LOAN_PREAPPROVAL ที่นับเป็นขั้น "ชำระเงิน" ทั้งหมด
 */
export type LateSlaStage = {
  /** จำนวนงาน SLA ที่เกินกำหนดในขั้นนั้น (CONTACT_RETRY มีได้หลายรอบ) */
  count: number;
  /** เกินกำหนดนานสุดในขั้นนั้น หน่วยนาที — งานที่ปิดแล้วนับถึงเวลาที่ปิด */
  overdueMinutes: number;
  /** true = ยังมีงานที่นาฬิกาเดินค้างอยู่ ไม่ใช่ความช้าที่จบไปแล้ว */
  stillOpen: boolean;
};

type LateSlaRow = { policy_code?: string; late_count?: number; overdue_minutes?: number; still_open?: number };

/** แปลงคอลัมน์ sla_late_stages (FOR JSON PATH จาก LATE_SLA_STAGES_APPLY) เป็น map ต่อขั้นตอน */
export function parseLateSlaStages(json?: string | null): Partial<Record<SlaWorkflowStage, LateSlaStage>> {
  if (!json) return {};
  let rows: unknown;
  try { rows = JSON.parse(json); } catch { return {}; }
  if (!Array.isArray(rows)) return {};
  const stages: Partial<Record<SlaWorkflowStage, LateSlaStage>> = {};
  for (const row of rows as LateSlaRow[]) {
    const stage = slaWorkflowStage(row?.policy_code);
    if (!stage) continue;
    const previous = stages[stage];
    stages[stage] = {
      count: (previous?.count ?? 0) + Math.max(1, Number(row.late_count) || 1),
      overdueMinutes: Math.max(previous?.overdueMinutes ?? 0, Math.max(0, Number(row.overdue_minutes) || 0)),
      stillOpen: (previous?.stillOpen ?? false) || Number(row.still_open) === 1,
    };
  }
  return stages;
}
