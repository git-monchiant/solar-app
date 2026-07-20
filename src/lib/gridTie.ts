export type GridTieApplicantType = "individual" | "juristic";
export type GridTieChecklistStatus = "missing" | "received" | "needs_fix";

export interface GridTieChecklistEntry {
  status: GridTieChecklistStatus;
  note: string;
  required?: boolean;
}

export type GridTieChecklistState = Record<string, GridTieChecklistEntry>;

export interface GridTieChecklistItem {
  id: string;
  label: string;
  detail: string;
  conditional?: boolean;
}

const COMMON_ITEMS: GridTieChecklistItem[] = [
  { id: "power_of_attorney", label: "หนังสือมอบอำนาจ", detail: "ลงนามในช่องผู้มอบอำนาจตามเอกสารแนบ" },
  { id: "latest_electricity_bill", label: "สำเนาใบแจ้งค่าไฟเดือนล่าสุด", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ" },
];

const INDIVIDUAL_ITEMS: GridTieChecklistItem[] = [
  { id: "id_card", label: "สำเนาบัตรประชาชน", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ" },
  { id: "house_registration", label: "สำเนาทะเบียนบ้าน", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ" },
  { id: "post_solar_house_registration", label: "สำเนาทะเบียนบ้านหลังติดตั้ง Solar", detail: "เอกสารเพิ่มเติม กรณีลูกค้ายังไม่ย้ายทะเบียนบ้าน", conditional: true },
];

const JURISTIC_ITEMS: GridTieChecklistItem[] = [
  { id: "company_certificate", label: "หนังสือรับรองบริษัท อายุไม่เกิน 3 เดือน", detail: "ลงนามกรรมการผู้มีอำนาจและประทับตราบริษัท" },
  { id: "director_id_card", label: "สำเนาบัตรประชาชนของกรรมการผู้ลงนาม", detail: "กรรมการผู้มีอำนาจลงนาม" },
  { id: "director_house_registration", label: "สำเนาทะเบียนบ้านของกรรมการผู้ลงนาม", detail: "กรรมการผู้มีอำนาจลงนาม" },
  { id: "post_solar_house_registration", label: "สำเนาทะเบียนบ้านหลังติดตั้ง Solar", detail: "เอกสารเพิ่มเติม กรณีลูกค้ายังไม่ย้ายทะเบียนบ้าน", conditional: true },
];

const TAX_CONSENT: GridTieChecklistItem = {
  id: "tax_measure_consent",
  label: "หนังสือยินยอมเข้าร่วมโครงการมาตรการทางภาษี",
  detail: "ฉบับที่ 805 พ.ศ. 2569 ตามเอกสารแนบ (เฉพาะ MEA)",
};

export function getGridTieChecklistItems(utility: string, applicantType: string): GridTieChecklistItem[] {
  if (!utility || !applicantType) return [];
  const applicantItems = applicantType === "juristic" ? JURISTIC_ITEMS : INDIVIDUAL_ITEMS;
  const powerAttorney = applicantType === "juristic"
    ? { ...COMMON_ITEMS[0], detail: "ลงนามกรรมการผู้มีอำนาจและประทับตราบริษัท" }
    : COMMON_ITEMS[0];
  return [powerAttorney, ...(utility === "MEA" ? [TAX_CONSENT] : []), COMMON_ITEMS[1], ...applicantItems]
    .map(item => ({ ...item, id: `${utility}:${applicantType}:${item.id}` }));
}

export function parseGridTieChecklist(value: string | null | undefined): GridTieChecklistState {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getGridTieProgress(utility: string, applicantType: string, checklistValue: string | null | undefined) {
  const checklist = parseGridTieChecklist(checklistValue);
  const items = getGridTieChecklistItems(utility, applicantType);
  const required = items.filter(item => !item.conditional || checklist[item.id]?.required === true);
  const received = required.filter(item => checklist[item.id]?.status === "received").length;
  return { received, total: required.length, complete: required.length > 0 && received === required.length };
}

export interface GridTieFinalData {
  grid_utility?: string | null;
  grid_app_no?: string | null;
  grid_applicant_type?: string | null;
  grid_document_checklist?: string | null;
  grid_application_doc_url?: string | null;
  grid_permit_doc_url?: string | null;
}

export function getGridTieFinalMissing(data: GridTieFinalData): string[] {
  const missing: string[] = [];
  if (!data.grid_utility) missing.push("การไฟฟ้า");
  if (!data.grid_applicant_type) missing.push("ประเภทผู้ยื่น");
  if (!data.grid_app_no) missing.push("เลขที่คำขอ");

  if (data.grid_utility && data.grid_applicant_type) {
    const progress = getGridTieProgress(data.grid_utility, data.grid_applicant_type, data.grid_document_checklist);
    if (!progress.complete) missing.push(`Checklist เอกสาร (${progress.received}/${progress.total})`);
  }

  if (!data.grid_application_doc_url) missing.push("เอกสารยื่นขอขนานไฟ");
  if (!data.grid_permit_doc_url) missing.push("ใบอนุญาต/PPA");
  return missing;
}
