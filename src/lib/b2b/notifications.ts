import { sql } from "./db";
import type { AppRole } from "@/lib/role-permissions";

// แจ้งเตือน B2B ในกระดิ่งกลาง (แผน 20261015-11) — ★ ฝั่ง server · เรียกใน transaction ของการกระทำ
// ยกกลไกจาก src/lib/quotation-notifications.ts (B2C): แจ้งทั้ง role (+ admin) / แจ้งคนเดียว / ปิดของชั้นที่มีคนกดแล้ว
// ไม่แจ้งตัวเอง (คนกดเป็นผู้รับด้วย เช่น admin ส่งใบเอง)

type Queryable = { request(): sql.Request };
export type B2bNotifyInput = {
  kind: "approval_requested" | "approval_completed" | "changes_required";
  projectId: number; quotationId: number; tier?: number | null;
  title: string; message?: string | null; createdBy: number | null;
};

const bind = (r: sql.Request, x: B2bNotifyInput) => r
  .input("k", sql.VarChar(30), x.kind).input("p", sql.Int, x.projectId).input("q", sql.Int, x.quotationId)
  .input("t", sql.TinyInt, x.tier ?? null).input("title", sql.NVarChar(250), x.title.slice(0, 250))
  .input("m", sql.NVarChar(1000), x.message ? x.message.slice(0, 1000) : null).input("u", sql.Int, x.createdBy);

/** แจ้งผู้ใช้ทุกคนที่มี role นี้ (+ admin) — แบบ notifyQuotationRole ของ B2C */
export async function notifyB2bRole(db: Queryable, role: AppRole, x: B2bNotifyInput) {
  await bind(db.request(), x).input("role", sql.NVarChar(30), role).query(`
    INSERT INTO b2b_notifications (recipient_user_id, kind, project_id, quotation_id, tier, title, message, created_by)
    SELECT u.id, @k, @p, @q, @t, @title, @m, @u FROM users u
    WHERE u.is_active = 1 AND ISJSON(u.roles) = 1 AND (@u IS NULL OR u.id <> @u)
      AND EXISTS (SELECT 1 FROM OPENJSON(u.roles) r WHERE r.[value] IN (@role, 'admin'))`);
}

export async function notifyB2bUser(db: Queryable, userId: number | null | undefined, x: B2bNotifyInput) {
  if (!userId || userId === x.createdBy) return;
  await bind(db.request(), x).input("r", sql.Int, userId).query(`
    INSERT INTO b2b_notifications (recipient_user_id, kind, project_id, quotation_id, tier, title, message, created_by)
    VALUES (@r, @k, @p, @q, @t, @title, @m, @u)`);
}

/** ชั้นนี้มีคนกดอนุมัติ/ส่งกลับแล้ว (หรือส่งอนุมัติรอบใหม่ — ไม่ระบุชั้น = ทุกชั้น) → ของคนอื่นปิด ไม่ค้างในกระดิ่ง */
export async function resolveB2bQuoteNotifications(db: Queryable, quotationId: number, tier?: number) {
  await db.request().input("q", sql.Int, quotationId).input("t", sql.TinyInt, tier ?? null).query(`
    UPDATE b2b_notifications SET resolved_at = SYSDATETIMEOFFSET(), read_at = COALESCE(read_at, SYSDATETIMEOFFSET())
    WHERE quotation_id = @q AND kind = 'approval_requested' AND resolved_at IS NULL AND (@t IS NULL OR tier = @t)`);
}

/** ผู้ใช้ที่อาจได้รับแจ้งเตือน B2B — กระดิ่งดึง /api/b2b/notifications เฉพาะคนที่มี role เหล่านี้ (ลดภาระของผู้ใช้ฝั่ง B2C) */
export const B2B_NOTIFY_ROLES = ["b2b", "b2b_review1", "b2b_review2", "b2b_review3", "admin"] as const satisfies readonly AppRole[];
