// ของที่หน้ารายการงานบริการกับหน้ารายละเอียดใช้ร่วมกัน
// (แยกออกมาตอนทำเฟส 3 ของแผน 20260922-01 — เดิมอยู่ในไฟล์เดียวกับหน้ารายการ
//  พอรายละเอียดมี URL ของตัวเองแล้วต้อง import ข้ามไฟล์ได้)
//
// ★ ค่าคงที่ล้วน ห้ามลาก mssql เข้ามา — ทั้งสองฝั่งเป็น "use client"

/** แถบความคืบหน้าในการ์ด/หน้ารายละเอียด — 6 ขั้น · ชื่อต้องตรงกับ BOOKING_STATUS ใน booking.ts
 *  paid = ขั้นของงานเสียเงินเท่านั้น (สิทธิ์หมด / ซ่อมนอกประกัน / งานเพิ่ม) งานใช้สิทธิ์ฟรีข้ามไป
 *  ★ 28 ก.ย. 69 ผู้ใช้เคาะตัด "รอปิด" (checked) ออก: 7 → 6 ขั้น — กรอกใบตรวจ + ลูกค้าเซ็น แล้วกดปิดงานจบเลย
 *    ไม่เคยมีใบงานจอดที่รอปิดจริง (ปุ่มปิดงานวิ่งผ่านรวดเดียว · ยืนยันทาง LINE ยังไม่เปิด) แต่แถบ/ราง/แท็บยังโชว์
 *    (เดิมเพิ่มเข้ามา 24 ก.ย. แผน 20260924-02 เฟส 1) · สถานะ checked + เลข 2600 ยังสงวนไว้ให้ LINE/Q.C. ในอนาคต */
export const FLOW = [
  { k: "follow", t: "ติดตาม" },
  { k: "quote", t: "เสนอราคา", paid: true },
  { k: "payment", t: "ชำระเงิน", paid: true },
  { k: "appoint", t: "นัดหมาย" },
  { k: "progress", t: "เข้างาน" },
  { k: "closed", t: "ปิดงาน" },
] as const;

/** status ของใบงาน → ตำแหน่งบน FLOW — ที่เดียว ใช้ทั้งการ์ดและหน้ารายละเอียด
 *  (เดิมต่างคน findIndex เอง หน้ารายละเอียดเลยพาใบงาน "รอลูกค้ายืนยัน" กลับไปขั้น 01)
 *  ยกเลิก/ไม่อยู่บ้าน = บ้านกลับมาแท็บติดตามแล้ว จึงยืนที่ขั้นติดตาม (ป้ายแดงบนการ์ดบอกเหตุ)
 *  ใบเก่าที่ค้าง checked (ไม่มีขั้นบนแถบแล้ว) ยืนที่เข้างาน — ใบตรวจ/ปุ่มปิดงานอยู่ขั้นนั้น */
const FLOW_AT: Record<string, number> = {
  follow: 0, quote: 1, payment: 2, pending: 3, confirmed: 3, progress: 4, checked: 4, closed: 5, cancelled: 0, no_show: 0,
};
export const flowIndex = (status: string | null) => FLOW_AT[status ?? "follow"] ?? 0;

/** ตำแหน่งงานบนราง/แถบ — ตาม flowIndex ยกเว้นกรณีเดียว: ชำระเงินครบแล้ว (รอโทรนัด) = งานอยู่ขั้นนัดหมาย
 *  ★ 29 ก.ย. 69 (แผน 20260929-02): ขั้นที่ปิดแล้วอ่านอย่างเดียวแบบฝั่งขาย — เดิมให้กลับไปโทรตกลงนัดที่ขั้น 01
 *    ตอนนี้ฟอร์มโทรตกลงวันนัดอยู่การ์ดนัดหมาย (แบบขั้นย่อย "นัด" ของ Install) · สถานะในฐานยังเป็น payment จนตกลงนัด
 *    ใช้ทั้งรางหน้ารายละเอียดและแถบในการ์ดหน้ารายการ ตำแหน่งต้องตรงกัน */
export const jobAt = (r: Pick<Item, "job_status" | "pay_state">) =>
  r.job_status === "payment" && r.pay_state === "paid" ? 3 : flowIndex(r.job_status);

/** งานนี้ข้ามขั้นเสนอราคา/ชำระเงินไหม (เส้นฟรี)
 *  ★ เฟส 2: ใบงานที่มีใบเสนอราคา (q_id) หรือยืนอยู่ขั้น 2–3 = เส้นเสียเงินแน่นอน
 *    ที่เหลือ: เลยขั้นติดตามไปแล้วโดยไม่มีใบ = มาทางฟรี · ยังติดตามอยู่ดูจากสิทธิ์ (หมด = ต้องเสนอราคา)
 *  ★ เฟส 5: ใบงานซ่อมที่ทีมเลือก "ในประกัน" = ฟรีเสมอ ไม่ดูสิทธิ์ล้าง (ซ่อมไม่ใช้สิทธิ์ล้างอยู่แล้ว) */
export const skipsPaidSteps = (r: Pick<Item, "balance" | "job_status"> & { q_id?: number | null; in_warranty?: number | null }) => {
  const at = flowIndex(r.job_status);
  if (r.q_id || at === 1 || at === 2) return false;
  if (r.in_warranty === 1) return true;
  return at > 0 || r.balance > 0;
};

/** ช่างแจ้งพบงานซ่อมในใบงานล่าสุด (ปิดแล้ว) แต่ยังไม่มีใครเปิดใบงานซ่อม — ชิปเตือนบนการ์ด (เฟส 5)
 *  เปิดแล้วยกเลิก (ลูกค้าไม่ซ่อม) = มีคนตัดสินใจแล้ว ไม่เตือนซ้ำ */
export const repairPending = (r: Pick<Item, "job_status" | "repair_needed" | "repair_child_id" | "repair_cancel_id">) =>
  r.job_status === "closed" && r.repair_needed === 1 && !r.repair_child_id && !r.repair_cancel_id;

/** สถานะใบเสนอราคา → ป้าย (ชุดเดียวกับลำดับอนุมัติฝั่งขาย แผน 20260730-01) */
export const QUOTE_STATUS: Record<string, { t: string; tone: string }> = {
  draft: { t: "ร่าง", tone: "bg-gray-100 text-gray-700" },
  pending_solar_sup: { t: "รอ Solar Sup อนุมัติ", tone: "bg-amber-50 text-amber-700" },
  pending_sales_sup: { t: "รอ Sale Sup อนุมัติ", tone: "bg-amber-50 text-amber-700" },
  pending_approval: { t: "รอ Sale Sup อนุมัติ", tone: "bg-amber-50 text-amber-700" },
  changes_required: { t: "ส่งกลับแก้", tone: "bg-red-50 text-red-700" },
  approved: { t: "อนุมัติแล้ว", tone: "bg-emerald-50 text-emerald-700" },
  // ลูกค้าไม่เอา — ยกเลิกทั้งใบงาน (POST /api/om/bookings/[id]/cancel) · สถานะเดียวกับที่ฝั่งขายเตรียมไว้
  cancelled: { t: "ยกเลิกแล้ว", tone: "bg-gray-100 text-gray-500" },
};

/** สถานะเงินของใบงานขั้นชำระเงิน (เฟส 4) — ชุดเดียวกับขั้นย่อย journey 2310/2320/2330 */
export const PAY_STATE: Record<"unpaid" | "verifying" | "paid", { t: string; tone: string }> = {
  unpaid: { t: "รอชำระ", tone: "bg-fuchsia-50 text-fuchsia-800" },
  verifying: { t: "รอ Account ยืนยันรับเงิน", tone: "bg-amber-50 text-amber-800" },
  paid: { t: "ชำระแล้ว · รอโทรนัด", tone: "bg-emerald-50 text-emerald-800" },
};

/** แท็บของหน้ารายการ — ขั้นที่มีงานอยู่จริง + 3 ทางออก
 *  (เสนอราคาเปิดแท็บเฟส 2 · ชำระเงินเฟส 4 · นัดหมายแยก 2 แท็บตามขั้นย่อย 2410/2420)
 *  ★ 28 ก.ย. 69 ตัดแท็บ "รอปิด" พร้อมขั้นบน FLOW — ใบ checked ที่ค้างอยู่ follow-sql จัดเข้าแท็บเข้างาน */
export const TABS = [
  { k: "follow", t: "ติดตาม" },
  { k: "quote", t: "เสนอราคา" },
  { k: "payment", t: "ชำระเงิน" },
  { k: "pending", t: "รอยืนยันนัด" },
  { k: "confirmed", t: "นัดแล้ว" },
  { k: "progress", t: "เข้างาน" },
  { k: "closed", t: "ปิดงาน" },
  { k: "unreachable", t: "ติดต่อไม่ได้" },
  { k: "declined", t: "ไม่เอา" },
  { k: "noquota", t: "สิทธิ์หมด" },
] as const;

/** แท็บของหน้า Today ของ O&M (/om/today · แผน 20260928-01) — 1 บ้านอยู่แท็บเดียว เกณฑ์อยู่ที่ /api/om/today */
export const TODAY_TABS = [
  { k: "appt_today", t: "นัดวันนี้", empty: "วันนี้ไม่มีนัดเข้าบ้าน",
    hint: "ใบงานที่นัดเข้าบ้านวันนี้ (รอยืนยันนัด · นัดแล้ว · เข้างาน)" },
  { k: "call_today", t: "โทรวันนี้", empty: "วันนี้ไม่มีบ้านที่ถึงวันนัดโทร",
    hint: "บ้านที่ยังไม่ได้นัด และถึงวันนัดโทรใหม่แล้ว (ตั้งจากผลโทร \"ไม่รับสาย\" / \"ขอเลื่อน\")" },
  { k: "overdue", t: "เลยนัด", empty: "ไม่มีงานที่เลยวันนัด",
    hint: "ใบงานที่เลยวันนัดแล้วแต่ยังไม่ปิด — ตามช่าง/ลูกค้า หรือเลื่อนนัดใหม่" },
  { k: "money", t: "เสนอราคา / รอเงิน", empty: "ไม่มีใบงานค้างเสนอราคาหรือรอชำระ",
    hint: "ใบงานเสียเงินที่ค้างขั้นเสนอราคาหรือชำระเงิน — งานของ Sale" },
] as const;

export const TONE: Record<string, string> = {
  follow: "bg-gray-500", quote: "bg-pink-600", payment: "bg-fuchsia-600", pending: "bg-amber-500", confirmed: "bg-blue-600",
  progress: "bg-violet-600", checked: "bg-teal-600", closed: "bg-emerald-600",
  unreachable: "bg-red-500", declined: "bg-gray-400", noquota: "bg-orange-500",
};
/** สีอ่อนของแท็บเดียวกัน — ใช้กับชิปบนหน้าภาพรวม (พื้นเข้มอ่านเลขโต ๆ ไม่ออก) */
export const TONE_SOFT: Record<string, string> = {
  follow: "bg-gray-100 text-gray-700", quote: "bg-pink-50 text-pink-700", payment: "bg-fuchsia-50 text-fuchsia-700", pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700", progress: "bg-violet-50 text-violet-700",
  checked: "bg-teal-50 text-teal-700", closed: "bg-emerald-50 text-emerald-700",
  unreachable: "bg-red-50 text-red-700", declined: "bg-gray-50 text-gray-500",
  noquota: "bg-orange-50 text-orange-700",
};

export const BUCKET_LABEL: Record<string, string> = Object.fromEntries(TABS.map((t) => [t.k, t.t]));

export const SORTS = [
  { k: "overdue", t: "ค้างนานที่สุดก่อน" },
  { k: "recent", t: "เพิ่งถึงรอบก่อน" },
  { k: "quota", t: "สิทธิ์เหลือมากก่อน" },
  { k: "project", t: "รวมตามโครงการ" },
  { k: "house", t: "บ้านเลขที่" },
];

/** 1 แถวของ /api/om/follow — บ้าน 1 หลัง พร้อมใบงานล่าสุด (ถ้ามี) */
export interface Item {
  house_id: number; house_number: string | null; project_id: string | null; project_name: string | null;
  balance: number; last_wash: string | null; wash_count: number;
  customer_id: number | null; customer_name: string | null; phone: string | null;
  kwp_list: string | null; warranty_start: string | null;
  /** วันหมดประกันจากใบรับประกันฝั่งขาย — บ้าน REM ไม่มี (เฟส 5 ใช้เลือก "ในประกัน" ให้ก่อน) */
  warranty_end: string | null;
  calls: number; no_answer: number; last_call_at: string | null; next_call: string | null;
  last_outcome: string | null; last_by: string | null;
  booking_id: number | null; job_status: string | null; scheduled_at: string | null;
  team_id: number | null; team_name: string | null; service_type: string | null;
  /** เจ้าของเคส (เฟส 4) — คนคุมงาน/คนโทร คนละอย่างกับ team_id ที่เป็นทีมช่างไปหน้างาน */
  owner_user_id: number | null; owner_name: string | null;
  /** ใบเสนอราคาล่าสุดของใบงาน (เฟส 2 แผน 20260924-02) — ว่าง = ยังไม่เคยออกใบ */
  q_id: number | null; q_doc_no: string | null; q_status: string | null; q_total: number | null;
  /** การรับเงินของใบเสนอราคา (เฟส 4) — unpaid ยังไม่มีสลิป · verifying รอ Account ยืนยัน · paid รับเงินแล้ว */
  pay_state: "unpaid" | "verifying" | "paid" | null;
  /** ชนิดงานของใบงานล่าสุด — cleaning / repair / … · consumes_quota 1 = ปิดงานแล้วตัดสิทธิ์ */
  service_code: string | null; consumes_quota: number | null;
  /** ใบงานซ่อม (เฟส 5 แผน 20260924-02) — มาจากใบงานไหน · ในประกันไหม (1 ฟรี / 0 เสียเงิน) · อาการ */
  parent_booking_id: number | null; in_warranty: number | null; job_note: string | null;
  /** ช่างแจ้งพบงานซ่อมในใบตรวจรับงานของใบงานล่าสุด · ใบซ่อมที่เปิดจากใบนี้แล้ว (ไม่นับที่ยกเลิก) */
  repair_needed: number | null; repair_detail: string | null; repair_child_id: number | null;
  /** ใบซ่อมที่เปิดจากใบนี้แล้วถูกยกเลิก (ล่าสุด) + เหตุผล — ถือว่าตัดสินใจแล้ว แต่ยังเปิดใหม่ได้ */
  repair_cancel_id: number | null; repair_cancel_reason: string | null;
  bucket: string;
}

export type Team = { id: number; name: string; color: string | null; open_jobs: number };

/** 1 แถวประวัติจาก om_booking_history */
export interface HistoryRow {
  id: number; booking_id: number | null; action: string;
  /** ป้ายไทยของ action — API เติมมาให้ (booking-log.ts เป็นแหล่งเดียว ฝั่ง client ใช้ mssql ไม่ได้) */
  action_label?: string;
  outcome: string | null; reason: string | null; actor_name: string | null;
  created_at: string; next_action_date: string | null;
  /** ค่าเดิม/ค่าใหม่เฉพาะฟิลด์ที่เปลี่ยน (JSON string) — แท็บ Timeline อ่านรายละเอียด (แผน 20260928-05) */
  from_json?: string | null; to_json?: string | null;
}

/** ใบงาน 1 ใบของบ้าน — หัวกลุ่มของแท็บ Timeline (`bookings` จาก /api/om/follow?house= · แผน 20260928-05) */
export interface BookingSummary {
  id: number; status: string; service_type: string | null; consumes_quota: number | null;
  scheduled_at: string | null; created_at: string;
  /** ใบงานซ่อม — มาจากใบงานไหน · 1 ในประกัน / 0 นอกประกัน */
  parent_booking_id: number | null; in_warranty: number | null;
  cancelled_reason: string | null; rescheduled_count: number; team_name: string | null;
  /** จากใบตรวจรับงาน — เลขใบบริการ · ผลตรวจ · เวลาปิด */
  job_no: string | null; result: string | null; finished_at: string | null;
  /** จำนวนใบตัดสิทธิ์ที่ผูกกับใบงานนี้ (ไม่นับที่ยกเลิก) */
  redeemed: number;
}

export const thD = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
export const thDT = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const monthsAgo = (s: string | null) =>
  !s ? null : Math.round((Date.now() - new Date(s).getTime()) / 2592000000);
/** ชื่อทีมช่างพร้อมคำว่า "ทีม" — ชื่อในฐานบางทีมมีคำว่าทีมอยู่แล้ว ("ทีม A") ไม่งั้นขึ้น "ทีม ทีม A" */
export const teamLabel = (name: string) => (name.trim().startsWith("ทีม") ? name.trim() : `ทีม ${name.trim()}`);
