// ของที่หน้ารายการงานบริการกับหน้ารายละเอียดใช้ร่วมกัน
// (แยกออกมาตอนทำเฟส 3 ของแผน 20260922-01 — เดิมอยู่ในไฟล์เดียวกับหน้ารายการ
//  พอรายละเอียดมี URL ของตัวเองแล้วต้อง import ข้ามไฟล์ได้)
//
// ★ ค่าคงที่ล้วน ห้ามลาก mssql เข้ามา — ทั้งสองฝั่งเป็น "use client"

/** 5 ขั้นที่ผู้ใช้เคาะ 9 ก.ย. 69 (ตรงกับ mockup 20260909_04) — แถบความคืบหน้าในการ์ด/หน้ารายละเอียด */
export const FLOW = [
  { k: "follow", t: "ติดตาม" },
  { k: "pending", t: "ทำนัด" },
  { k: "confirmed", t: "รอ O&M" },
  { k: "progress", t: "เข้า O&M" },
  { k: "closed", t: "ปิดงาน" },
] as const;

/** แท็บของหน้ารายการ — 6 ขั้น + 3 ทางออก (มากกว่า FLOW เพราะ checked/ทางออกไม่อยู่บนเส้น) */
export const TABS = [
  { k: "follow", t: "ติดตาม" },
  { k: "pending", t: "ทำนัด" },
  { k: "confirmed", t: "รอ O&M" },
  { k: "progress", t: "เข้า O&M" },
  { k: "checked", t: "รอลูกค้ายืนยัน" },
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
