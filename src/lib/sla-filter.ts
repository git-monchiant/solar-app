/**
 * นิยามตัวกรอง SLA ที่หน้า Today กับ Pipeline ใช้ร่วมกัน
 *
 * แยกออกมาตอนยกชิปไปหน้า Pipeline — ถ้าปล่อยให้ต่างคนต่างประกาศ สีกับกติกา
 * "ไม่มีงาน SLA เลือกร่วมกับสถานะอื่นไม่ได้" จะเพี้ยนคนละหน้าเมื่อแก้ทีหลัง
 */

export type SlaFilterKey = "breached" | "near_due" | "active" | "without";
export type SlaStatusKey = Exclude<SlaFilterKey, "without">;

/** เรียงตามความเร่งด่วน ใช้ทั้งลำดับปุ่มบนจอและลำดับค่าใน URL จะได้ลิงก์คงที่ */
export const SLA_FILTER_ORDER: SlaFilterKey[] = ["breached", "near_due", "active", "without"];

export type SlaChip = {
  key: SlaFilterKey;
  label: string;
  /** คลาสของชิปตอนติ๊กแล้ว */
  on: string;
  /** คลาสของกล่องติ๊กตอนติ๊กแล้ว */
  tick: string;
  /** สีตัวเลขตอน "ยังไม่ติ๊ก" — ติ๊กแล้วรับสีเข้มจาก `on` แทน */
  num: string;
};

export const SLA_CHIPS: SlaChip[] = [
  { key: "breached", label: "เกินกำหนด", on: "border-red-200 bg-red-50 text-red-700", tick: "border-red-500 bg-red-500", num: "text-red-600" },
  { key: "near_due", label: "ใกล้กำหนด", on: "border-amber-200 bg-amber-50 text-amber-700", tick: "border-amber-500 bg-amber-500", num: "text-amber-600" },
  { key: "active", label: "ตามแผน", on: "border-sky-200 bg-sky-50 text-sky-700", tick: "border-sky-500 bg-sky-500", num: "text-sky-700" },
  { key: "without", label: "ไม่มีงาน SLA", on: "border-gray-300 bg-gray-100 text-gray-700", tick: "border-gray-600 bg-gray-600", num: "text-gray-500" },
];

/** "ไม่มีงาน SLA" กับสถานะอื่นอยู่ร่วมกันไม่ได้ — Lead ที่ไม่มี SLA ย่อมไม่มีสถานะ SLA */
export function normalizeSlaFilters(keys: SlaFilterKey[]): SlaFilterKey[] {
  const unique = new Set(keys);
  if (unique.has("without")) return ["without"];
  return SLA_FILTER_ORDER.filter(key => unique.has(key));
}

export function parseSlaFilters(value: string | null): SlaFilterKey[] {
  if (!value) return [];
  const keys: SlaFilterKey[] = [];
  for (const part of value.split(",")) {
    const key = part.trim();
    // ลิงก์เดิม ?sla=all คือ "มีงาน SLA" ซึ่งเท่ากับติ๊กครบทั้งสามสถานะ
    if (key === "all") keys.push("breached", "near_due", "active");
    else if ((SLA_FILTER_ORDER as string[]).includes(key)) keys.push(key as SlaFilterKey);
  }
  return normalizeSlaFilters(keys);
}

/** ติ๊กปุ่มหนึ่ง แล้วคืนชุดใหม่ที่ยังถูกกติกา — ติ๊กซ้ำคือปลด */
export function toggleSlaFilter(current: SlaFilterKey[], key: SlaFilterKey): SlaFilterKey[] {
  if (current.includes(key)) return current.filter(item => item !== key);
  if (key === "without") return ["without"];
  return normalizeSlaFilters([...current.filter(item => item !== "without"), key]);
}

/** `near_due` รวม warning กับ critical ไว้ด้วยกัน คนอ่านไม่ต้องแยกสองคำ */
export function matchesSlaStatus(status: string | null | undefined, keys: SlaStatusKey[]): boolean {
  return keys.some(key => (key === "near_due"
    ? status === "warning" || status === "critical"
    : status === key));
}

/** สถานะ SLA ของ Lead ตกอยู่ชิปไหน — คืน null ถ้าไม่เข้าชิปใดเลย */
export function slaFilterKeyOf(status: string | null | undefined): SlaFilterKey | null {
  if (!status) return "without";
  if (status === "breached") return "breached";
  if (status === "warning" || status === "critical") return "near_due";
  if (status === "active") return "active";
  return null;
}
