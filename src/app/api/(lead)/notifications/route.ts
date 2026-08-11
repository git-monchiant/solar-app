import { NextRequest, NextResponse } from "next/server";
import { fixDates, getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const APPROVAL_STAGES = ["solar_sup", "sales_sup"] as const;
type ApprovalStage = (typeof APPROVAL_STAGES)[number];

async function getNotificationStage(req: NextRequest, userId: number): Promise<ApprovalStage | null | NextResponse> {
  const requested = req.nextUrl.searchParams.get("stage");
  if (!requested) return null;
  if (!APPROVAL_STAGES.includes(requested as ApprovalStage)) {
    return NextResponse.json({ error: "Invalid notification stage" }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.request()
    .input("uid", sql.Int, userId)
    .query(`SELECT roles FROM dbo.users WHERE id = @uid AND is_active = 1;`);
  let roles: string[] = [];
  try {
    const parsed = JSON.parse(result.recordset[0]?.roles || "[]");
    if (Array.isArray(parsed)) roles = parsed.filter((role): role is string => typeof role === "string");
  } catch {}

  if (!roles.includes("admin") && !roles.includes(requested)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return requested as ApprovalStage;
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const stage = await getNotificationStage(req, gate.userId);
  if (stage instanceof NextResponse) return stage;

  const db = await getDb();
  if (req.nextUrl.searchParams.get("summary") === "1") {
    const summary = await db.request()
      .input("uid", sql.Int, gate.userId)
      .input("stage", sql.NVarChar(30), stage)
      .query(`
        SELECT COUNT_BIG(*) unread_count
        FROM dbo.quotation_approval_notifications
        WHERE recipient_user_id = @uid
          AND read_at IS NULL
          AND (@stage IS NULL OR approval_stage = @stage);
      `);
    return NextResponse.json({ unread_count: Number(summary.recordset[0]?.unread_count || 0) });
  }
  const result = await db.request()
    .input("uid", sql.Int, gate.userId)
    .input("stage", sql.NVarChar(30), stage)
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
        AND (@stage IS NULL OR n.approval_stage = @stage)
      ORDER BY n.created_at DESC, n.id DESC;

      SELECT COUNT_BIG(*) unread_count
      FROM dbo.quotation_approval_notifications
      WHERE recipient_user_id = @uid
        AND read_at IS NULL
        AND (@stage IS NULL OR approval_stage = @stage);
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

  const stage = await getNotificationStage(req, gate.userId);
  if (stage instanceof NextResponse) return stage;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const markAll = body.all === true;
  if (!markAll && (!Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "กรุณาระบุรายการแจ้งเตือน" }, { status: 400 });
  }

  const db = await getDb();
  const request = db.request()
    .input("uid", sql.Int, gate.userId)
    .input("stage", sql.NVarChar(30), stage);
  if (markAll) {
    await request.query(`
      UPDATE dbo.quotation_approval_notifications
      SET read_at = COALESCE(read_at, GETDATE())
      WHERE recipient_user_id = @uid
        AND read_at IS NULL
        AND (@stage IS NULL OR approval_stage = @stage);
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
