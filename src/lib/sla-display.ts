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
  CLOSE_LEAD: "ออกใบรับประกัน",
};

/**
 * "นับจากอะไร" ของแต่ละนโยบาย — คู่กับ config_json.anchor ใน sla_policies
 *
 * ตัวเลข "1 วัน / 7 วัน" อย่างเดียวบอกไม่ได้ว่าเริ่มจับเวลาตอนไหน ซึ่งเป็นจุดที่เข้าใจ
 * ผิดกันบ่อยที่สุด — BOOK_SURVEY ถูกย้ายจุดเริ่มนับมาแล้ว 3 รอบโดยที่ตัวเลข "1 วัน"
 * ไม่เคยเปลี่ยนเลย คนอ่านหน้าจอจึงแยกไม่ออกว่าตอนนี้ระบบใช้กติกาไหนอยู่
 *
 * ข้อความต้องตรงกับ anchorAt ที่ syncOperationalSlas เลือกจริงใน sla-service.ts
 * ไม่ใช่ตรงกับที่เอกสารอยากให้เป็น — ถ้าสองอย่างไม่ตรงกันต้องแก้ที่ต้นทาง ไม่ใช่แก้คำ
 */
export const SLA_ANCHOR_LABEL: Record<string, string> = {
  payment_confirmed: "นับจากได้รับค่าสำรวจ หรือยืนยันฟรี",
  first_connected_contact: "นับจากติดต่อลูกค้าได้ครั้งแรก",
  later_of_scheduled_or_confirmation: "นับจากเวลานัดสำรวจ หรือเวลายืนยันนัด",
  survey_completed: "นับจากสำรวจหน้างานเสร็จ",
  proposal_sent: "นับจากวันที่เสนอราคา",
  deposit_confirmed: "นับจากยืนยันรับมัดจำ",
  scheduled_installation: "นับจากเวลานัดติดตั้ง",
  installation_completed: "นับจากติดตั้งเสร็จ",
};

/**
 * ข้อความเต็มสำหรับ tooltip — ใส่เฉพาะ anchor ที่ย่อแล้วเสียรายละเอียดสำคัญไป
 *
 * ช่อง SLA กว้างคงที่ 248px ข้อความที่ยาวกว่าหนึ่งบรรทัดทำให้แถวสูงขึ้นจนตารางอ่านยาก
 * ป้ายบนจอจึงย่อให้จบในบรรทัดเดียว ส่วนเงื่อนไขที่ตัดออก (เช่น Site Survey นับจาก
 * "อย่างไหนช้ากว่า") เก็บไว้ให้เอาเมาส์ชี้ดู ไม่ได้หายไปเฉย ๆ
 */
export const SLA_ANCHOR_DETAIL: Record<string, string> = {
  payment_confirmed: "นับจากเวลาที่ได้รับค่าสำรวจ หรือเวลาที่ยืนยันฟรีค่าสำรวจ",
  later_of_scheduled_or_confirmation: "นับจากเวลานัดสำรวจ หรือเวลายืนยันนัด แล้วแต่อย่างไหนช้ากว่า",
};

/** คำอธิบายจุดเริ่มนับ — anchor ที่ยังไม่ได้ลงทะเบียนไว้ไม่ต้องแสดงอะไร ดีกว่าเดาผิด */
export function slaAnchorLabel(anchor?: string | null): string | null {
  return anchor ? SLA_ANCHOR_LABEL[anchor] ?? null : null;
}

/** ข้อความเต็มของจุดเริ่มนับ ถ้าไม่มีก็ใช้ป้ายบนจอไปเลย (ไม่ได้ย่อจนเสียความหมาย) */
export function slaAnchorDetail(anchor?: string | null): string | null {
  if (!anchor) return null;
  return SLA_ANCHOR_DETAIL[anchor] ?? SLA_ANCHOR_LABEL[anchor] ?? null;
}

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
  ELECTRICITY_ASSESSMENT: "ภายใน 1 วัน หลังติดต่อ Lead สำเร็จ",
  BOOK_SURVEY: "ภายใน 1 วัน นับตั้งแต่ได้รับค่าสำรวจ หรือยืนยันฟรีค่าสำรวจ",
  SITE_SURVEY: "ภายใน 7 วัน นับจากเวลานัดสำรวจที่ยืนยันแล้ว",
  PROPOSAL_ROI: "ภายใน 2 วัน หลังสำรวจเสร็จ",
  DEPOSIT_CLOSE: "ภายใน 3 วัน หลังส่ง Proposal/เข้า Order",
  PAYMENT_INSTALLMENT_1: "ภายใน 7 วัน นับจากวันที่เสนอราคา",
  LOAN_PREAPPROVAL: "ภายใน 15 วัน นับจากวันที่เสนอราคา",
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
        return "รับ Lead เวลา 09:00–18:59 ครบกำหนดภายใน 23:59 ของวันเดียวกัน";
      }
      if (hour >= 19) {
        return "รับ Lead เวลา 19:00–23:59 ครบกำหนดภายใน 12:00 ของวันถัดไป";
      }
      return "รับ Lead เวลา 00:00–08:59 ครบกำหนดภายใน 12:00 ของวันเดียวกัน";
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

/**
 * ทีมเจ้าของงานตามที่บริษัทแบ่งจริง — Sales · สำรวจ · ติดตั้ง · After Sales
 *
 * `lead_sla_instances.owner_role` เก็บได้แค่ 'sales' กับ 'solar' เพราะถูกใช้คุม
 * สิทธิ์และการมอบหมายงาน (ดู sla-service) การเพิ่มค่าใหม่จึงกระทบเรื่องสิทธิ์ทั้ง
 * ระบบ ป้ายบนจอที่คนอ่านจึงแยกทีมจาก policy_code แทน ได้ชื่อทีมตรงกับงานจริง
 * โดยไม่แตะกติกาสิทธิ์ — owner_role ยังเป็นตัวตัดสินว่าใครมอบหมาย/เห็นงานได้
 *
 * ม่วงเป็นสีประจำทีมสำรวจ ตามที่ใช้กันมาใน legend ของหน้า Calendar จึงห้ามเอาไป
 * ใช้กับทีมอื่น ส้มเป็นของทีมติดตั้งตามแถบ event ในหน้าเดียวกัน ทีมขายจึงใช้
 * น้ำเงิน และทีมหลังการขายใช้บานเย็น ทีมเดียวกันได้สีเดียวกันทุกหน้า
 */
export type SlaTeamKey = "sales" | "survey" | "install" | "after_sales";

export const SLA_TEAM: Record<SlaTeamKey, { label: string; chip: string; dot: string }> = {
  sales:       { label: "ทีมขาย",       chip: "bg-blue-100 text-blue-700",       dot: "bg-blue-500" },
  survey:      { label: "ทีมสำรวจ",     chip: "bg-violet-100 text-violet-700",   dot: "bg-active" },
  install:     { label: "ทีมติดตั้ง",    chip: "bg-orange-100 text-orange-700",   dot: "bg-orange-500" },
  after_sales: { label: "ทีมหลังการขาย", chip: "bg-fuchsia-100 text-fuchsia-700", dot: "bg-fuchsia-500" },
};

/**
 * policy ไหนเป็นของทีมไหน
 *
 * ยึดตามตาราง SLA ที่บริษัทกำหนด (คอลัมน์ role) — ข้อ 7 นัดวันติดตั้ง = sale,
 * ข้อ 4 Site Survey / ข้อ 8 ติดตั้ง / ข้อ 9 รับประกัน = solar
 * ฝั่ง solar แตกเป็นทีมสำรวจ / ติดตั้ง / หลังการขาย ตามที่บริษัทแบ่งทีมจริง
 */
const SLA_TEAM_BY_POLICY: Record<string, SlaTeamKey> = {
  FIRST_CONTACT: "sales",
  CONTACT_RETRY: "sales",
  ASSIGN_OWNER: "sales",
  GRADE_PLAYBOOK: "sales",
  GRADE_A_NEXT_ACTION: "sales",
  ELECTRICITY_ASSESSMENT: "sales",
  BOOK_SURVEY: "sales",
  PROPOSAL_ROI: "sales",
  DEPOSIT_CLOSE: "sales",
  PAYMENT_INSTALLMENT_1: "sales",
  LOAN_PREAPPROVAL: "sales",
  SITE_SURVEY: "survey",
  // นัดวันติดตั้งเป็นงานของฝ่ายขายตามตาราง SLA ที่บริษัทกำหนด (ข้อ 7 role = sale)
  // ไม่ใช่ทีมติดตั้ง — เคยใส่ผิดเพราะเดาจากคอมเมนต์ในโค้ดแทนที่จะยึดเอกสาร
  SCHEDULE_INSTALLATION: "sales",
  INSTALLATION: "install",
  AFTER_SALES: "after_sales",
  CLOSE_LEAD: "after_sales",
};

/**
 * ทีมของงาน SLA ชิ้นหนึ่ง — ถ้าเป็น policy ที่ยังไม่ได้จับคู่ไว้ ถอยไปใช้
 * owner_role เดิม (solar ตีความเป็นทีมติดตั้ง) จะได้ไม่มีป้ายว่างเวลาเพิ่ม policy ใหม่
 */
export function slaTeamOf(policyCode?: string | null, ownerRole?: string | null): SlaTeamKey {
  const mapped = policyCode ? SLA_TEAM_BY_POLICY[policyCode] : undefined;
  if (mapped) return mapped;
  return ownerRole === "solar" ? "install" : "sales";
}
