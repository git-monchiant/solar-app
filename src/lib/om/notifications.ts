import { sql } from "@/lib/db";

// แจ้งเตือนงาน O&M — ★ อยู่ในโมดูล O&M ล้วน (ผู้ใช้ย้ำ 24 ก.ย. 69)
// ★ เฟส 6 ของแผน 20260922-01
//
// ★★ ห้ามต่อเข้ากล่องแจ้งเตือนกลาง (/api/notifications · NotificationBell · /notifications)
//   เหตุผล 2 ชั้น
//   1) ข้อ 4.1 ที่ผู้ใช้เคาะ: งาน O&M อยู่ในการ์ดตัวเองจนกว่าจะนิ่ง กล่องกลางเป็นของฝั่งขายที่ใช้ทุกวัน
//   2) กล่องกลางวิ่งบน getDb() ซึ่งชี้ฐาน v2 ได้ · SQL Server แปลชื่อตารางทั้งสคริปต์ตอน compile
//      om_notifications ไม่มีบนฐาน v2 ⇒ เอาไป UNION เมื่อไร กระดิ่งของทุกคนดับทันที
//      (กับดักเดียวกับที่เจอตอนเฟส 1 ที่ /api/journey-summary)
//   ⇒ อ่านผ่าน getOmDb() เท่านั้น ซึ่งปฏิเสธฐานที่ชื่อไม่ลงท้าย v3 อยู่แล้ว
//
// ★ เขียนใน transaction เดียวกับการแก้ om_bookings เสมอ (กติกาเดียวกับ booking-log.ts)
//   ถ้าแจ้งเตือนไปแล้วแต่ transaction rollback คนจะได้อีเมล/กระดิ่งเรื่องที่ไม่เคยเกิดขึ้น

type DbExecutor = sql.ConnectionPool | sql.Transaction;

export type OmNotificationType =
  | "om_owner_assigned"     // ถูกมอบหมายให้ดูแลใบงาน
  | "om_job_reminder";      // ใกล้ถึงวันนัดแล้ว

export interface OmNotificationInput {
  recipientUserId: number;
  type: OmNotificationType;
  /** กันแจ้งซ้ำ — คีย์เดิมยิงซ้ำจะอัปเดตแถวเดิมแล้วปลุกให้เป็น "ยังไม่อ่าน" ใหม่ */
  eventKey: string;
  title: string;
  message?: string | null;
  houseId?: number | null;
  bookingId?: number | null;
  /** ไม่ส่ง = เด้งไปหน้ารายละเอียดของบ้านหลังนั้น (ต้องมี houseId) */
  targetUrl?: string | null;
  createdBy?: number | null;
}

function request(db: DbExecutor) {
  return db instanceof sql.Transaction ? new sql.Request(db) : db.request();
}

/**
 * แจ้งเตือน 1 คน — ไม่แจ้งตัวเอง (คนกดมอบหมายรู้อยู่แล้วว่าทำอะไรไป)
 * คืน false เมื่อข้ามการแจ้ง เพื่อให้ผู้เรียกเขียน log ได้ตรงความจริง
 */
export async function notifyOmUser(db: DbExecutor, input: OmNotificationInput): Promise<boolean> {
  if (!input.recipientUserId) return false;
  if (input.createdBy && input.createdBy === input.recipientUserId) return false;

  const targetUrl = input.targetUrl
    ?? (input.houseId ? `/om/services/${input.houseId}` : "/om/services");

  await request(db)
    .input("houseId", sql.Int, input.houseId ?? null)
    .input("bookingId", sql.Int, input.bookingId ?? null)
    .input("uid", sql.Int, input.recipientUserId)
    .input("type", sql.VarChar(50), input.type)
    .input("eventKey", sql.NVarChar(160), input.eventKey)
    .input("title", sql.NVarChar(250), input.title)
    .input("message", sql.NVarChar(1000), input.message ?? null)
    .input("targetUrl", sql.NVarChar(500), targetUrl)
    .input("createdBy", sql.Int, input.createdBy ?? null)
    .query(`
      MERGE dbo.om_notifications WITH (HOLDLOCK) AS target
      USING (SELECT @uid recipient_user_id, @eventKey event_key) AS source
        ON target.recipient_user_id = source.recipient_user_id
       AND target.event_key = source.event_key
      WHEN MATCHED THEN UPDATE SET
        house_id = @houseId, booking_id = @bookingId,
        notification_type = @type, title = @title, message = @message,
        target_url = @targetUrl, created_by = @createdBy,
        read_at = NULL, resolved_at = NULL,
        created_at = GETDATE(), updated_at = GETDATE()
      WHEN NOT MATCHED THEN INSERT (
        house_id, booking_id, recipient_user_id, notification_type,
        event_key, title, message, target_url, created_by
      ) VALUES (
        @houseId, @bookingId, source.recipient_user_id, @type,
        source.event_key, @title, @message, @targetUrl, @createdBy
      );`);
  return true;
}

/**
 * ปิดเรื่องที่จบแล้วของใบงานหนึ่ง — งานปิด/ยกเลิก หรือเปลี่ยนมือเจ้าของ
 * ทำเป็น resolved ไม่ใช่ลบทิ้ง เพื่อให้ยังย้อนดูได้ว่าเคยแจ้งใครไว้ (แถวจะจางลงในกล่อง)
 */
export async function resolveOmNotifications(
  db: DbExecutor,
  input: { bookingId: number; types?: OmNotificationType[]; exceptUserId?: number | null },
): Promise<void> {
  if (!input.bookingId) return;
  const types = input.types?.length ? input.types : (["om_owner_assigned", "om_job_reminder"] as OmNotificationType[]);
  await request(db)
    .input("bookingId", sql.Int, input.bookingId)
    .input("keep", sql.Int, input.exceptUserId ?? null)
    .input("t1", sql.VarChar(50), types[0] ?? null)
    .input("t2", sql.VarChar(50), types[1] ?? null)
    .query(`
      UPDATE dbo.om_notifications
         SET resolved_at = COALESCE(resolved_at, GETDATE()),
             read_at     = COALESCE(read_at, GETDATE()),
             updated_at  = GETDATE()
       WHERE resolved_at IS NULL
         AND booking_id = @bookingId
         AND (@keep IS NULL OR recipient_user_id <> @keep)
         AND notification_type IN (@t1, @t2);`);
}

// ══ อ่าน/อัปเดต — ใช้โดย /api/om/notifications เท่านั้น (getOmDb) ══

export interface OmNotificationRow {
  id: number;
  notification_type: string;
  title: string;
  message: string | null;
  target_url: string;
  house_id: number | null;
  booking_id: number | null;
  house_number: string | null;
  customer_name: string | null;
  created_by_name: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** 100 รายการล่าสุดของคนนี้ */
export async function listOmNotifications(db: sql.ConnectionPool, userId: number) {
  const r = await db.request().input("uid", sql.Int, userId).query(`
    SELECT TOP (100)
      n.id, n.notification_type, n.title, n.message, n.target_url,
      n.house_id, n.booking_id, h.house_number,
      (SELECT TOP 1 c.full_name FROM om_house_customers hc
         JOIN om_customers c ON c.id = hc.customer_id
        WHERE hc.house_id = n.house_id AND hc.is_current = 1
        ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
      creator.full_name created_by_name,
      CONVERT(varchar(33), n.read_at, 126) read_at,
      CONVERT(varchar(33), n.resolved_at, 126) resolved_at,
      CONVERT(varchar(33), n.created_at, 126) created_at
    FROM om_notifications n
    LEFT JOIN om_houses h ON h.id = n.house_id
    LEFT JOIN users creator ON creator.id = n.created_by
    WHERE n.recipient_user_id = @uid
    ORDER BY n.created_at DESC, n.id DESC;`);
  // id เป็น BIGINT — tedious คืนมาเป็น string ต้องแปลงก่อน ไม่งั้นฝั่งหน้าเว็บเทียบ id ไม่ตรง
  return r.recordset.map((x) => ({ ...x, id: Number(x.id) })) as unknown as OmNotificationRow[];
}

/** จำนวนที่ยังไม่อ่านและยังไม่จบเรื่อง — เลขบนกระดิ่งของโมดูล */
export async function countOmUnread(db: sql.ConnectionPool, userId: number): Promise<number> {
  const r = await db.request().input("uid", sql.Int, userId).query(`
    SELECT COUNT_BIG(*) n FROM om_notifications
     WHERE recipient_user_id = @uid AND read_at IS NULL AND resolved_at IS NULL;`);
  return Number(r.recordset[0]?.n ?? 0);
}

/** ทำเครื่องหมายว่าอ่านแล้ว — ส่ง id เดียว หรือ "all" = ทั้งกล่องของคนนี้ */
export async function markOmRead(db: sql.ConnectionPool, userId: number, id: number | "all"): Promise<void> {
  const rq = db.request().input("uid", sql.Int, userId);
  if (id === "all") {
    await rq.query(`UPDATE om_notifications
                       SET read_at = COALESCE(read_at, GETDATE()), updated_at = GETDATE()
                     WHERE recipient_user_id = @uid AND read_at IS NULL;`);
    return;
  }
  await rq.input("id", sql.BigInt, id).query(`
    UPDATE om_notifications
       SET read_at = COALESCE(read_at, GETDATE()), updated_at = GETDATE()
     WHERE id = @id AND recipient_user_id = @uid;`);
}
