import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// รายการห้องแชต O&M เรียงตามข้อความล่าสุด พร้อมจำนวนยังไม่อ่านและข้อมูลบ้านที่ผูกไว้
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const db = await getOmDb();
  const r = await db.request().query(`
    SELECT u.id, u.line_user_id, u.display_name, u.picture_url, u.phone,
           u.identity_status, u.is_follow, u.channel_mode, u.last_message_at,
           u.house_id, h.house_number, h.project_id, p.name_th AS project_name,
           lm.text AS last_text, lm.direction AS last_direction, lm.message_type AS last_type,
           unread.n AS unread_count
    FROM om_line_users u
    LEFT JOIN om_houses h ON h.id = u.house_id
    LEFT JOIN om_projects p ON p.project_id = h.project_id
    OUTER APPLY (
      SELECT TOP 1 text, direction, message_type FROM om_line_messages m
      WHERE m.line_user_id = u.line_user_id ORDER BY m.created_at DESC, m.id DESC
    ) lm
    OUTER APPLY (
      SELECT COUNT(*) n FROM om_line_messages m
      WHERE m.line_user_id = u.line_user_id AND m.direction = 'in' AND m.is_read = 0
    ) unread
    ORDER BY u.last_message_at DESC`);

  return NextResponse.json({ conversations: fixDates(r.recordset) });
}
