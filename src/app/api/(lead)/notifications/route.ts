import { NextRequest, NextResponse } from "next/server";
import { fixDates, getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const APPROVAL_STAGES = ["solar_sup", "sales_sup"] as const;
type ApprovalStage = (typeof APPROVAL_STAGES)[number];
type NotificationScope = ApprovalStage | "account" | null;

async function getNotificationScope(req: NextRequest, userId: number): Promise<NotificationScope | NextResponse> {
  const requested = req.nextUrl.searchParams.get("stage");
  const requestedScope = req.nextUrl.searchParams.get("scope");
  if (requested && requestedScope) {
    return NextResponse.json({ error: "Use either stage or scope" }, { status: 400 });
  }
  const scope = requested || requestedScope;
  if (!scope) return null;
  if (scope !== "account" && !APPROVAL_STAGES.includes(scope as ApprovalStage)) {
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

  if (!roles.includes("admin") && !roles.includes(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return scope as NotificationScope;
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const scope = await getNotificationScope(req, gate.userId);
  if (scope instanceof NextResponse) return scope;
  const stage = scope === "account" ? null : scope;
  const includeQuotation = scope !== "account";
  const includeAccounting = !stage;

  const db = await getDb();
  if (req.nextUrl.searchParams.get("summary") === "1") {
    const summary = await db.request()
      .input("uid", sql.Int, gate.userId)
      .input("stage", sql.NVarChar(30), stage)
      .input("includeQuotation", sql.Bit, includeQuotation ? 1 : 0)
      .input("includeAccounting", sql.Bit, includeAccounting ? 1 : 0)
      .query(`
        SELECT
          (SELECT COUNT_BIG(*)
           FROM dbo.quotation_approval_notifications
           WHERE @includeQuotation = 1
             AND recipient_user_id = @uid
             AND read_at IS NULL
             AND (@stage IS NULL OR approval_stage = @stage))
          +
          (SELECT COUNT_BIG(*)
           FROM dbo.accounting_notifications
           WHERE @includeAccounting = 1
             AND recipient_user_id = @uid
             AND read_at IS NULL
             AND resolved_at IS NULL) unread_count;
      `);
    return NextResponse.json({ unread_count: Number(summary.recordset[0]?.unread_count || 0) });
  }
  const result = await db.request()
    .input("uid", sql.Int, gate.userId)
    .input("stage", sql.NVarChar(30), stage)
    .input("includeQuotation", sql.Bit, includeQuotation ? 1 : 0)
    .input("includeAccounting", sql.Bit, includeAccounting ? 1 : 0)
    .query(`
      WITH combined AS (
        SELECT
          N'quotation' notification_source,
          n.id, n.quotation_id, CAST(NULL AS INT) payment_id, n.lead_id,
          n.notification_type, n.approval_stage, n.title, n.message,
          CAST(NULL AS NVARCHAR(500)) target_url,
          n.read_at, CAST(NULL AS DATETIME2) resolved_at, n.created_at,
          q.doc_no, q.status quotation_status, l.full_name customer_name,
          creator.full_name created_by_name
        FROM dbo.quotation_approval_notifications n
        JOIN dbo.quotations q ON q.id = n.quotation_id
        JOIN dbo.leads l ON l.id = n.lead_id
        LEFT JOIN dbo.users creator ON creator.id = n.created_by
        WHERE @includeQuotation = 1
          AND n.recipient_user_id = @uid
          AND (@stage IS NULL OR n.approval_stage = @stage)

        UNION ALL

        SELECT
          N'accounting' notification_source,
          n.id, CAST(NULL AS INT) quotation_id, n.payment_id, n.lead_id,
          n.notification_type, CAST(NULL AS NVARCHAR(30)) approval_stage,
          n.title, n.message, n.target_url, n.read_at, n.resolved_at, n.created_at,
          COALESCE(p.doc_no, l.pre_doc_no, CONCAT('#', n.lead_id)) doc_no,
          CAST(NULL AS NVARCHAR(30)) quotation_status,
          l.full_name customer_name, creator.full_name created_by_name
        FROM dbo.accounting_notifications n
        JOIN dbo.leads l ON l.id = n.lead_id
        LEFT JOIN dbo.payments p ON p.id = n.payment_id
        LEFT JOIN dbo.users creator ON creator.id = n.created_by
        WHERE @includeAccounting = 1
          AND n.recipient_user_id = @uid
      )
      SELECT TOP (100) * FROM combined
      ORDER BY created_at DESC, id DESC;

      SELECT
        (SELECT COUNT_BIG(*)
         FROM dbo.quotation_approval_notifications
         WHERE @includeQuotation = 1
           AND recipient_user_id = @uid
           AND read_at IS NULL
           AND (@stage IS NULL OR approval_stage = @stage))
        +
        (SELECT COUNT_BIG(*)
         FROM dbo.accounting_notifications
         WHERE @includeAccounting = 1
           AND recipient_user_id = @uid
           AND read_at IS NULL
           AND resolved_at IS NULL) unread_count;
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

  const scope = await getNotificationScope(req, gate.userId);
  if (scope instanceof NextResponse) return scope;
  const stage = scope === "account" ? null : scope;
  const includeQuotation = scope !== "account";
  const includeAccounting = !stage;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const source = body.source === "accounting" ? "accounting" : "quotation";
  const markAll = body.all === true;
  if (!markAll && (!Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "กรุณาระบุรายการแจ้งเตือน" }, { status: 400 });
  }

  const db = await getDb();
  const request = db.request()
    .input("uid", sql.Int, gate.userId)
    .input("stage", sql.NVarChar(30), stage)
    .input("includeQuotation", sql.Bit, includeQuotation ? 1 : 0)
    .input("includeAccounting", sql.Bit, includeAccounting ? 1 : 0);
  if (markAll) {
    await request.query(`
      UPDATE dbo.quotation_approval_notifications
      SET read_at = COALESCE(read_at, GETDATE())
      WHERE @includeQuotation = 1
        AND recipient_user_id = @uid
        AND read_at IS NULL
        AND (@stage IS NULL OR approval_stage = @stage);

      UPDATE dbo.accounting_notifications
      SET read_at = COALESCE(read_at, GETDATE()), updated_at = GETDATE()
      WHERE @includeAccounting = 1
        AND recipient_user_id = @uid
        AND read_at IS NULL;
    `);
  } else if (source === "accounting") {
    await request.input("id", sql.BigInt, id).query(`
      UPDATE dbo.accounting_notifications
      SET read_at = COALESCE(read_at, GETDATE()), updated_at = GETDATE()
      WHERE @includeAccounting = 1 AND id = @id AND recipient_user_id = @uid;
    `);
  } else {
    await request.input("id", sql.BigInt, id).query(`
      UPDATE dbo.quotation_approval_notifications
      SET read_at = COALESCE(read_at, GETDATE())
      WHERE @includeQuotation = 1
        AND id = @id
        AND recipient_user_id = @uid
        AND (@stage IS NULL OR approval_stage = @stage);
    `);
  }
  return NextResponse.json({ ok: true });
}
