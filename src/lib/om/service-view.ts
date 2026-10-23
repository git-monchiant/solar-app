// ของที่หน้ารายการงานบริการกับหน้ารายละเอียดใช้ร่วมกัน
// (แยกออกมาตอนทำเฟส 3 ของแผน 20260922-01 — เดิมอยู่ในไฟล์เดียวกับหน้ารายการ
//  พอรายละเอียดมี URL ของตัวเองแล้วต้อง import ข้ามไฟล์ได้)
//
// ★ ค่าคงที่ล้วน ห้ามลาก mssql เข้ามา — ทั้งสองฝั่งเป็น "use client"
import { formatSlotsRange } from "@/lib/time-slots";

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
  // ★ 22 ต.ค. 69 เข้างาน → ปฏิบัติงาน (ชื่อขั้น ไม่ใช่ชื่อสถานะ — ใบยืนยันนัดหมายก็ยืนขั้นนี้ จึงไม่ใช้ "กำลังดำเนินการ")
  { k: "progress", t: "ปฏิบัติงาน" },
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
// ★ 23 ต.ค. 69 แผน 20261023-01 (ผู้ใช้เลือกแบบ B): ใบที่ยืนยันนัดหมายแล้วอยู่ขั้น 04 นัดหมาย จนช่างถึงหน้างาน
//   แถบนัด + Reschedule + ปุ่มช่างถึงหน้างาน อยู่การ์ดขั้น 04 · ขั้น 05 เริ่มเมื่อช่างถึง (progress)
//   เดิม 1 ต.ค. 69 ดันใบที่มีวันนัดไปขั้น 05 — แท็บ "ยืนยันนัดหมาย" เลยชี้ขั้นปฏิบัติงาน ผู้ใช้งง
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

/** ใบงานซ่อม (เฟส 5 แผน 20260924-02) — ผู้ใช้สั่ง "ยกเลิกงานซ่อมก่อน" 14 ต.ค. 69 (แผน 20261014-07)
 *  false = ซ่อนทางเข้าบนหน้าจอ: ปุ่มเปิดใบงานซ่อม (ขั้นปิดงาน) · ช่อง "พบงานซ่อม" ในใบตรวจ · ชิปรอเปิดใบซ่อมบนการ์ด
 *  ข้อมูลเดิม / ใบซ่อมที่เปิดไว้แล้ว / API คงไว้ — เปิดกลับ = เปลี่ยนเป็น true ที่นี่ที่เดียว */
export const OM_REPAIR_ENABLED = false;

/** ช่างแจ้งพบงานซ่อมในใบงานล่าสุด (ปิดแล้ว) แต่ยังไม่มีใครเปิดใบงานซ่อม — ชิปเตือนบนการ์ด (เฟส 5)
 *  เปิดแล้วยกเลิก (ลูกค้าไม่ซ่อม) = มีคนตัดสินใจแล้ว ไม่เตือนซ้ำ */
export const repairPending = (r: Pick<Item, "job_status" | "repair_needed" | "repair_child_id" | "repair_cancel_id">) =>
  OM_REPAIR_ENABLED && r.job_status === "closed" && r.repair_needed === 1 && !r.repair_child_id && !r.repair_cancel_id;

/** สถานะใบเสนอราคา → ป้าย (ชุดเดียวกับลำดับอนุมัติฝั่งขาย แผน 20260730-01) */
export const QUOTE_STATUS: Record<string, { t: string; tone: string }> = {
  draft: { t: "ร่าง", tone: "bg-gray-100 text-gray-700" },
  // ★ 21 ต.ค. 69 แผน 20261021-01: ชื่อผู้อนุมัติตาม roles.ts (เดิม Solar Sup / Sale Sup)
  pending_solar_sup: { t: "รอ Solar Manager อนุมัติ", tone: "bg-amber-50 text-amber-700" },
  pending_sales_sup: { t: "รอ Sale Manager อนุมัติ", tone: "bg-amber-50 text-amber-700" },
  pending_approval: { t: "รอ Sale Manager อนุมัติ", tone: "bg-amber-50 text-amber-700" },
  changes_required: { t: "ส่งกลับแก้ไข", tone: "bg-red-50 text-red-700" },
  approved: { t: "อนุมัติแล้ว", tone: "bg-emerald-50 text-emerald-700" },
  // ลูกค้าไม่เอา — ยกเลิกทั้งใบงาน (POST /api/om/bookings/[id]/cancel) · สถานะเดียวกับที่ฝั่งขายเตรียมไว้
  cancelled: { t: "ยกเลิกแล้ว", tone: "bg-gray-100 text-gray-500" },
};

/** สถานะเงินของใบงานขั้นชำระเงิน (เฟส 4) — ชุดเดียวกับขั้นย่อย journey 2310/2320/2330 */
export const PAY_STATE: Record<NonNullable<Item["pay_state"]>, { t: string; tone: string }> = {
  unpaid: { t: "รอชำระเงิน", tone: "bg-fuchsia-50 text-fuchsia-800" },
  // แผน 20261014-03 — เช็คที่รับแล้วเด้ง แถวเก็บไว้ · ต้องแนบหลักฐานชำระใหม่
  bounced: { t: "เช็คคืน · รอชำระใหม่", tone: "bg-red-50 text-red-700" },
  verifying: { t: "รอฝ่ายบัญชียืนยันรับเงิน", tone: "bg-amber-50 text-amber-800" },
  paid: { t: "ชำระแล้ว · รอโทรนัด", tone: "bg-emerald-50 text-emerald-800" },
};

/** แท็บของหน้ารายการ — ขั้นที่มีงานอยู่จริง + 3 ทางออก
 *  (เสนอราคาเปิดแท็บเฟส 2 · ชำระเงินเฟส 4 · นัดหมายแยก 2 แท็บตามขั้นย่อย 2410/2420)
 *  ★ 28 ก.ย. 69 ตัดแท็บ "รอปิด" พร้อมขั้นบน FLOW — ใบ checked ที่ค้างอยู่ follow-sql จัดเข้าแท็บเข้างาน */
// ★ 21 ต.ค. 69 ผู้ใช้สั่ง "ถ้าไม่ใช้เอาออก": เอาแท็บ "รอยืนยันนัด" ออก — ตั้งแต่ 1 ต.ค. 69 ไม่มีทางไหนเข้าสถานะนี้แล้ว
//   (ขั้น 04 "ยืนยันและเข้างาน" = นัดแล้วทันที · เลื่อนนัดไม่ถอยกลับ) · ใบเก่าที่ยังเป็น pending ขึ้นแท็บนัดแล้ว (follow-sql.ts)
// ★ 22 ต.ค. 69 ผู้ใช้ขอคำทางการ: นัดแล้ว → ยืนยันนัดหมาย · เข้างาน → กำลังปฏิบัติงาน (23 ต.ค. · ชื่อสถานะใน booking.ts เปลี่ยนตาม)
//   สิทธิ์หมด → ไม่มีสิทธิ์คงเหลือ (รวมบ้านที่สิทธิ์หมดอายุจนเหลือ 0 ด้วย) · ขั้นบน FLOW ใช้ "ปฏิบัติงาน"
export const TABS = [
  { k: "follow", t: "ติดตาม" },
  { k: "quote", t: "เสนอราคา" },
  { k: "payment", t: "ชำระเงิน" },
  { k: "confirmed", t: "ยืนยันนัดหมาย" },
  // ★ 23 ต.ค. 69 กำลังดำเนินการ → กำลังปฏิบัติงาน ให้คำโยงกับขั้นปฏิบัติงาน (แบบ รอติดตั้ง/กำลังติดตั้ง ฝั่งขาย)
  { k: "progress", t: "กำลังปฏิบัติงาน" },
  { k: "closed", t: "ปิดงาน" },
  { k: "unreachable", t: "ติดต่อไม่ได้" },
  { k: "declined", t: "ปฏิเสธ" },
  { k: "noquota", t: "ไม่มีสิทธิ์คงเหลือ" },
] as const;

/** แท็บของหน้า Today ของ O&M (/om/today · แผน 20260928-01) — 1 บ้านอยู่แท็บเดียว เกณฑ์อยู่ที่ /api/om/today */
// ★ 21 ต.ค. 69 ผู้ใช้สั่งเอาแถวคำอธิบายแท็บออกจากหน้า Today — ความหมายแต่ละแท็บเก็บไว้เป็นคอมเมนต์
//   นัดหมายวันนี้ = ใบงานที่นัดเข้าบ้านวันนี้ (นัดแล้ว · เข้างาน)
//   ติดตามวันนี้ = บ้านที่ยังไม่ได้นัด และถึงวันนัดติดตามแล้ว (ตั้งจาก "นัดติดตามครั้งถัดไป" ในหน้าต่าง Follow-up)
//   เกินกำหนดนัดหมาย = ใบงานที่เกินวันนัดแล้วแต่ยังไม่ปิด · เสนอราคา / รอชำระเงิน = ใบงานมีค่าบริการ — งานของฝ่ายขาย
// ★ ชื่อแท็บผู้ใช้เลือก 21 ต.ค. 69: นัดวันนี้ → นัดหมายวันนี้ · โทรวันนี้ → ติดตามวันนี้ (ติดตามได้ทั้งโทร/ลงพื้นที่/LINE) · เกินกำหนดนัด → เกินกำหนดนัดหมาย (ให้คู่กับ "นัดหมายวันนี้")
export const TODAY_TABS = [
  { k: "appt_today", t: "นัดหมายวันนี้", empty: "วันนี้ไม่มีนัดหมายเข้าบ้าน" },
  { k: "call_today", t: "ติดตามวันนี้", empty: "วันนี้ไม่มีบ้านที่ถึงวันนัดติดตาม" },
  { k: "overdue", t: "เกินกำหนดนัดหมาย", empty: "ไม่มีใบงานที่เกินกำหนดนัดหมาย" },
  { k: "money", t: "เสนอราคา / รอชำระเงิน", empty: "ไม่มีใบงานที่รอเสนอราคาหรือรอชำระเงิน" },
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

// เรียง 2 ช่องแบบ Pipeline: ช่องแรก = เรียงตามอะไร · ช่องสอง = ทิศทาง (ป้ายเปลี่ยนตามช่องแรก)
//   def = ทิศที่ตั้งให้เองตอนเปลี่ยนช่องแรก — สิทธิ์ต้องมาก → น้อย ถึงจะได้บ้านที่ยังล้างฟรีได้ขึ้นก่อน
export const SORTS: { k: string; t: string; asc: string; desc: string; def: "asc" | "desc" }[] = [
  { k: "wash", t: "ล้างครั้งล่าสุด", asc: "เก่า → ใหม่", desc: "ใหม่ → เก่า", def: "asc" },
  { k: "quota", t: "สิทธิ์ล้างคงเหลือ", asc: "น้อย → มาก", desc: "มาก → น้อย", def: "desc" },
];

/** 1 แถวของ /api/om/follow — บ้าน 1 หลัง พร้อมใบงานล่าสุด (ถ้ามี) */
export interface Item {
  house_id: number; house_number: string | null; project_id: string | null; project_name: string | null;
  balance: number; last_wash: string | null; wash_count: number;
  /** 1 = บ้านที่ทีมเพิ่มเองที่ยังไม่เคยมีสิทธิ์ล้าง (follow-sql.ts · แผน 20261015-05) — อยู่แท็บติดตาม · ชิปขึ้น "ลูกค้าทั่วไป" แทน "สิทธิ์หมด" */
  new_manual?: number;
  customer_id: number | null; customer_name: string | null; phone: string | null;
  kwp_list: string | null; warranty_start: string | null;
  /** ยี่ห้ออินเวอร์เตอร์ของบ้าน ("SMA" · "ABB + HUAWEI") — หัวรายการใบเสนอราคา O&M (แผน 20261014-04) · ทะเบียนว่าง = null */
  inverter_list?: string | null;
  /** วันหมดประกันจากใบรับประกันฝั่งขาย — บ้าน REM ไม่มี (เฟส 5 ใช้เลือก "ในประกัน" ให้ก่อน) */
  warranty_end: string | null;
  calls: number; no_answer: number; last_call_at: string | null; next_call: string | null;
  last_outcome: string | null; last_by: string | null;
  booking_id: number | null; job_status: string | null; scheduled_at: string | null;
  /** ช่องที่จอง (JSON array แบบนัดสำรวจ · แผน 20261001-01) — ใบเก่าที่ไม่มีวันนัด = null */
  time_slot?: string | null;
  team_id: number | null; team_name: string | null; service_type: string | null;
  /** เจ้าของเคส (เฟส 4) — คนคุมงาน/คนโทร คนละอย่างกับ team_id ที่เป็นทีมช่างไปหน้างาน */
  owner_user_id: number | null; owner_name: string | null;
  /** ใบเสนอราคาล่าสุดของใบงาน (เฟส 2 แผน 20260924-02) — ว่าง = ยังไม่เคยออกใบ */
  q_id: number | null; q_doc_no: string | null; q_status: string | null; q_total: number | null;
  /** การรับเงินของใบเสนอราคา (เฟส 4) — unpaid ยังไม่มีสลิป · verifying รอ Account ยืนยัน · paid รับเงินแล้ว
   *  · bounced เช็คที่รับแล้วเด้ง ยังไม่มีสลิปใหม่ (แผน 20261014-03) */
  pay_state: "unpaid" | "verifying" | "paid" | "bounced" | null;
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
  /** ช่องที่จอง (แผน 20261001-01) */
  time_slot?: string | null;
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
/** วันนัด O&M แบบช่วงเวลา — "2 ต.ค. 69 09:00 - 10:30" (แผน 20261001-01 · ช่องแบบนัดสำรวจ)
 *  ใบที่ยังไม่มี time_slot (ไม่มีวันนัด/ข้อมูลก่อน migration) ใช้วันเวลาเริ่มแบบเดิม */
export const thAppt = (at: string | null, slot?: string | null) =>
  !at ? "—" : formatSlotsRange(slot) ? `${thD(at)} ${formatSlotsRange(slot)}` : thDT(at);
export const monthsAgo = (s: string | null) =>
  !s ? null : Math.round((Date.now() - new Date(s).getTime()) / 2592000000);
/** ชื่อทีมช่างพร้อมคำว่า "ทีม" — ชื่อในฐานบางทีมมีคำว่าทีมอยู่แล้ว ("ทีม A") ไม่งั้นขึ้น "ทีม ทีม A" */
export const teamLabel = (name: string) => (name.trim().startsWith("ทีม") ? name.trim() : `ทีม ${name.trim()}`);
