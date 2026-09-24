// ของที่หน้ารายการงานบริการกับหน้ารายละเอียดใช้ร่วมกัน
// (แยกออกมาตอนทำเฟส 3 ของแผน 20260922-01 — เดิมอยู่ในไฟล์เดียวกับหน้ารายการ
//  พอรายละเอียดมี URL ของตัวเองแล้วต้อง import ข้ามไฟล์ได้)
//
// ★ ค่าคงที่ล้วน ห้ามลาก mssql เข้ามา — ทั้งสองฝั่งเป็น "use client"

/** แถบความคืบหน้าในการ์ด/หน้ารายละเอียด — 7 ขั้น (แผน 20260924-02 เฟส 1 · ผู้ใช้เคาะ 24 ก.ย. 69)
 *  แทนแถบ 5 ขั้นเดิมของ mockup 20260909_04 ที่ขาด "รอปิด" (checked) — งานที่ทำเสร็จแล้วรอปิด
 *  จึงเคยโชว์ว่ายังอยู่ "เข้า O&M" · ชื่อต้องตรงกับ BOOKING_STATUS ใน booking.ts
 *  paid = ขั้นของงานเสียเงินเท่านั้น (สิทธิ์หมด / ซ่อมนอกประกัน / งานเพิ่ม) งานใช้สิทธิ์ฟรีข้ามไป */
export const FLOW = [
  { k: "follow", t: "ติดตาม" },
  { k: "quote", t: "เสนอราคา", paid: true },
  { k: "payment", t: "ชำระเงิน", paid: true },
  { k: "appoint", t: "นัดหมาย" },
  { k: "progress", t: "เข้างาน" },
  { k: "checked", t: "รอปิด" },
  { k: "closed", t: "ปิดงาน" },
] as const;

/** status ของใบงาน → ตำแหน่งบน FLOW — ที่เดียว ใช้ทั้งการ์ดและหน้ารายละเอียด
 *  (เดิมต่างคน findIndex เอง หน้ารายละเอียดเลยพาใบงาน "รอลูกค้ายืนยัน" กลับไปขั้น 01)
 *  ยกเลิก/ไม่อยู่บ้าน = บ้านกลับมาแท็บติดตามแล้ว จึงยืนที่ขั้นติดตาม (ป้ายแดงบนการ์ดบอกเหตุ) */
const FLOW_AT: Record<string, number> = {
  follow: 0, pending: 3, confirmed: 3, progress: 4, checked: 5, closed: 6, cancelled: 0, no_show: 0,
};
export const flowIndex = (status: string | null) => FLOW_AT[status ?? "follow"] ?? 0;

/** งานนี้ข้ามขั้นเสนอราคา/ชำระเงินไหม (เส้นฟรี)
 *  ★ เฟส 1 ยังไม่มีใบเสนอราคา O&M — ใบงานที่เลยขั้นติดตามไปแล้วจึงมาทางฟรีทั้งหมด
 *    ส่วนที่ยังติดตามอยู่ดูจากสิทธิ์: หมดแล้ว = งานถัดไปต้องเสนอราคา
 *    เฟส 2+ ต้องเปลี่ยนมาอ่านจากใบเสนอราคาจริง / ติ๊ก "ในประกัน" ของใบงานซ่อม */
export const skipsPaidSteps = (r: Pick<Item, "balance" | "job_status">) =>
  flowIndex(r.job_status) > 0 || r.balance > 0;

/** แท็บของหน้ารายการ — ขั้นที่มีงานอยู่จริง + 3 ทางออก
 *  (เสนอราคา/ชำระเงินยังไม่มีแท็บ จะเพิ่มพร้อมเฟสที่เปิดใช้ · นัดหมายแยก 2 แท็บตามขั้นย่อย 2410/2420) */
export const TABS = [
  { k: "follow", t: "ติดตาม" },
  { k: "pending", t: "รอยืนยันนัด" },
  { k: "confirmed", t: "นัดแล้ว" },
  { k: "progress", t: "เข้างาน" },
  { k: "checked", t: "รอปิด" },
  { k: "closed", t: "ปิดงาน" },
  { k: "unreachable", t: "ติดต่อไม่ได้" },
  { k: "declined", t: "ไม่เอา" },
  { k: "noquota", t: "สิทธิ์หมด" },
] as const;

export const TONE: Record<string, string> = {
  follow: "bg-gray-500", pending: "bg-amber-500", confirmed: "bg-blue-600",
  progress: "bg-violet-600", checked: "bg-teal-600", closed: "bg-emerald-600",
  unreachable: "bg-red-500", declined: "bg-gray-400", noquota: "bg-orange-500",
};
/** สีอ่อนของแท็บเดียวกัน — ใช้กับชิปบนหน้าภาพรวม (พื้นเข้มอ่านเลขโต ๆ ไม่ออก) */
export const TONE_SOFT: Record<string, string> = {
  follow: "bg-gray-100 text-gray-700", pending: "bg-amber-50 text-amber-700",
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
  calls: number; no_answer: number; last_call_at: string | null; next_call: string | null;
  last_outcome: string | null; last_by: string | null;
  booking_id: number | null; job_status: string | null; scheduled_at: string | null;
  team_id: number | null; team_name: string | null; service_type: string | null;
  /** เจ้าของเคส (เฟส 4) — คนคุมงาน/คนโทร คนละอย่างกับ team_id ที่เป็นทีมช่างไปหน้างาน */
  owner_user_id: number | null; owner_name: string | null;
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
}

export const thD = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
export const thDT = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const monthsAgo = (s: string | null) =>
  !s ? null : Math.round((Date.now() - new Date(s).getTime()) / 2592000000);
