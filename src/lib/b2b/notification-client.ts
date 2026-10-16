import { apiFetch } from "@/lib/api";

// ฝั่งหน้าจอของแจ้งเตือน B2B (แผน 20261015-11) — กระดิ่ง + หน้าการแจ้งเตือนดึงจาก /api/b2b/notifications มารวมกับแจ้งเตือนกลาง
// ไม่ throw เลย: ส่วน B2B ล่ม (ฐานไม่ใช่ v3 ฯลฯ) แจ้งเตือนกลางต้องยังขึ้นตามปกติ
// ดึงเฉพาะผู้ใช้ที่มี role B2B (role ที่ได้รับ ไม่ใช่ role ที่สวมอยู่ — ผู้ตรวจสอบที่สวม role อื่นต้องไม่พลาดใบรออนุมัติ)
const URL = "/api/b2b/notifications";
const ROLES = ["b2b", "b2b_review1", "b2b_review2", "b2b_review3", "admin"];

export const wantsB2bNotifications = (roles: readonly string[]) => roles.some((r) => ROLES.includes(r));

export async function loadB2bNotifications<T>(summary: boolean): Promise<{ items: T[]; unread_count: number }> {
  try {
    const d = await apiFetch(summary ? `${URL}?summary=1` : URL);
    return { items: (d.items ?? []) as T[], unread_count: Number(d.unread_count) || 0 };
  } catch {
    return { items: [], unread_count: 0 };
  }
}

export async function markB2bNotifications(body: { id: number } | { all: true }): Promise<void> {
  try {
    await apiFetch(URL, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    // อ่านแล้วไม่สำเร็จ — ไม่ขวางการเปิดงาน
  }
}
