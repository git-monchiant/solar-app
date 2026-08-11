import { NextRequest, NextResponse } from "next/server";
import { fixDates, getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const db = await getDb();
  if (req.nextUrl.searchParams.get("summary") === "1") {
    const summary = await db.request()
      .input("uid", sql.Int, gate.userId)
      .query(`
        SELECT COUNT_BIG(*) unread_count
        FROM dbo.quotation_approval_notifications
        WHERE recipient_user_id = @uid AND read_at IS NULL;
      `);
    return NextResponse.json({ unread_count: Number(summary.recordset[0]?.unread_count || 0) });
  }
  const result = await db.request()
    .input("uid", sql.Int, gate.userId)
    .query(`
      SELECT TOP (100)
        n.id, n.quotation_id, n.lead_id, n.notification_type,
        n.approval_stage, n.title, n.message, n.read_at, n.created_at,
        q.doc_no, q.status quotation_status, l.full_name customer_name,
        creator.full_name created_by_name
      FROM dbo.quotation_approval_notifications n
      JOIN dbo.quotations q ON q.id = n.quotation_id
      JOIN dbo.leads l ON l.id = n.lead_id
      LEFT JOIN dbo.users creator ON creator.id = n.created_by
      WHERE n.recipient_user_id = @uid
      ORDER BY n.created_at DESC, n.id DESC;

      SELECT COUNT_BIG(*) unread_count
      FROM dbo.quotation_approval_notifications
      WHERE recipient_user_id = @uid AND read_at IS NULL;
    `);
  const recordsets = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  return NextResponse.json({
    items: fixDates(recordsets[0] || []),
    unread_count: Number(recordsets[1]?.[0]?.unread_count || 0),
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const markAll = body.all === true;
  if (!markAll && (!Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "กรุณาระบุรายการแจ้งเตือน" }, { status: 400 });
  }

  const db = await getDb();
  const request = db.request().input("uid", sql.Int, gate.userId);
  if (markAll) {
    await request.query(`
      UPDATE dbo.quotation_approval_notifications
      SET read_at = COALESCE(read_at, GETDATE())
      WHERE recipient_user_id = @uid AND read_at IS NULL;
    `);
  } else {
    await request.input("id", sql.BigInt, id).query(`
      UPDATE dbo.quotation_approval_notifications
      SET read_at = COALESCE(read_at, GETDATE())
      WHERE id = @id AND recipient_user_id = @uid;
    `);
  }
  return NextResponse.json({ ok: true });
}
