/**
 * นิยามตัวกรอง SLA ที่หน้า Today กับ Pipeline ใช้ร่วมกัน
 *
 * แยกออกมาตอนยกชิปไปหน้า Pipeline — ถ้าปล่อยให้ต่างคนต่างประกาศ สีกับกติกา
 * "ไม่มีงาน SLA เลือกร่วมกับสถานะอื่นไม่ได้" จะเพี้ยนคนละหน้าเมื่อแก้ทีหลัง
 */

export type SlaFilterKey = "breached" | "near_due" | "active" | "done_ontime" | "without";
export type SlaStatusKey = Exclude<SlaFilterKey, "without" | "done_ontime">;

/** เรียงตามความเร่งด่วน ใช้ทั้งลำดับปุ่มบนจอและลำดับค่าใน URL จะได้ลิงก์คงที่ */
export const SLA_FILTER_ORDER: SlaFilterKey[] = ["breached", "near_due", "active", "done_ontime", "without"];

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
  { key: "active", label: "กำลังดำเนินการ", on: "border-sky-200 bg-sky-50 text-sky-700", tick: "border-sky-500 bg-sky-500", num: "text-sky-700" },
  { key: "done_ontime", label: "เสร็จตามกำหนด", on: "border-emerald-200 bg-emerald-50 text-emerald-700", tick: "border-emerald-500 bg-emerald-500", num: "text-emerald-600" },
  { key: "without", label: "ไม่มีงาน SLA", on: "border-gray-300 bg-gray-100 text-gray-700", tick: "border-gray-600 bg-gray-600", num: "text-gray-500" },
];

/**
 * "ไม่มีงาน SLA" กับ "เสร็จตามกำหนด" ยืนเดี่ยวเสมอ — ทั้งคู่แปลว่า Lead ไม่มีงาน
 * SLA ค้างอยู่ จึงไม่มีสถานะ (เกิน/ใกล้/กำลังทำ) ให้จับคู่ด้วยตั้งแต่ต้น
 */
export function normalizeSlaFilters(keys: SlaFilterKey[]): SlaFilterKey[] {
  const unique = new Set(keys);
  if (unique.has("without")) return ["without"];
  if (unique.has("done_ontime")) return ["done_ontime"];
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
  if (key === "without" || key === "done_ontime") return [key];
  return normalizeSlaFilters([...current.filter(item => item !== "without" && item !== "done_ontime"), key]);
}

/** `near_due` รวม warning กับ critical ไว้ด้วยกัน คนอ่านไม่ต้องแยกสองคำ */
export function matchesSlaStatus(status: string | null | undefined, keys: SlaStatusKey[]): boolean {
  return keys.some(key => (key === "near_due"
    ? status === "warning" || status === "critical"
    : status === key));
}

/**
 * สถานะ SLA ของ Lead ตกอยู่ชิปไหน — คืน null ถ้าไม่เข้าชิปใดเลย
 *
 * `done` คือ SLA ที่ปิดงานไปแล้วล่าสุด (ดู SLA_DONE_APPLY) ใช้ตอนไม่มีงานค้าง
 * เพื่อแยก "ทำครบแล้วทันกำหนด" ออกจาก "ไม่เคยมีงาน SLA เลย" ซึ่งเดิมกองรวมกัน
 * ปิดช้ายังนับเป็น without เหมือนเดิม ชิปเขียวสงวนไว้ให้งานที่ทำทันจริง ๆ
 */
export function slaFilterKeyOf(
  status: string | null | undefined,
  done?: { completedAt?: string | null; breachedAt?: string | null } | null,
): SlaFilterKey | null {
  if (!status) return done?.completedAt && !done.breachedAt ? "done_ontime" : "without";
  if (status === "breached") return "breached";
  if (status === "warning" || status === "critical") return "near_due";
  if (status === "active") return "active";
  return null;
}
