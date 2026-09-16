// ใบตรวจรับงาน / ใบบริการ — ชนิดข้อมูล + ค่าคงที่ที่ไม่ได้ผูกกับชนิดงาน
// ★ 16 ก.ย. 69: หัวข้อในใบ (QUALITY / MEASURES) ย้ายไปอยู่ในฐานแล้ว
//   ตาราง om_job_form + om_job_form_item · แต่ละชนิดงานมีใบของตัวเอง
//   ไฟล์นี้จึงเหลือแต่ของที่ทั้ง client และ API ใช้ร่วมกันโดยไม่ต้องถามฐาน

/** 1 ข้อในใบตรวจ — ตรงกับ 1 แถวใน dbo.om_job_form_item */
export type FormItemKind = "bool" | "num" | "text" | "photo";
export type FormItem = {
  id: number;
  code: string;        // ★ คีย์ที่ไปโผล่ใน checks / measures JSON
  section: string;     // quality | measure | photo
  label_th: string;
  kind: FormItemKind;
  unit: string | null;
  required: boolean;
  sort_order: number;
};

/** หัวใบ — 1 แถวใน dbo.om_job_form */
export type JobForm = {
  id: number;
  version: number;
  label_th: string;
  service_code: string | null;
  /** true = ชนิดงานนี้ยังไม่มีใบของตัวเอง ยืมใบ install มาใช้ไปก่อน */
  fallback: boolean;
};

export type QualityValue = { pass?: boolean; fix?: string };
export type Checks = Record<string, QualityValue>;
export type Measures = Record<string, number | null>;

export const CLOSE_METHOD = {
  onsite_sign: "ลูกค้าเซ็นที่หน้างาน",
  line_otp: "ลูกค้ายืนยันทาง LINE + OTP",
  tech_proxy: "ช่างเซ็นแทน",
} as const;

export const PROXY_REASONS = [
  "ลูกค้าไม่อยู่บ้าน ไม่มีผู้รับมอบ",
  "ลูกค้าอยู่แต่ไม่สะดวกเซ็น",
  "ลูกค้าไม่มี LINE และไม่รับสาย",
  "อื่น ๆ",
];

/**
 * นับข้อที่ไม่ผ่าน — เก็บไว้เป็นคอลัมน์สรุปใน om_job_report จะได้กรองโดยไม่ต้องแกะ JSON
 * ★ หัวข้อมาจากฐานแล้ว จึงต้องส่ง items ของใบนั้นเข้ามาด้วย
 *   นับเฉพาะข้อ bool ที่ required ตามแผน 20260916_01
 */
export const failCount = (
  c: Checks | null | undefined,
  items: readonly Pick<FormItem, "code" | "kind" | "required">[],
): number =>
  !c ? 0 : items.filter((i) => i.kind === "bool" && i.required && c[i.code]?.pass === false).length;

/** เลขใบงานที่พิมพ์บนใบตรวจรับงาน — แทนเลขเล่ม/เลขที่ของกระดาษ */
export const jobNo = (id: number, at: Date = new Date()) =>
  `OM-${String((at.getFullYear() + 543) % 100).padStart(2, "0")}${String(at.getMonth() + 1).padStart(2, "0")}-${String(id).padStart(4, "0")}`;
