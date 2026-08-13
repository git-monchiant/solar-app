import { sql } from "@/lib/db";

type DbExecutor = sql.ConnectionPool | sql.Transaction;

type AccountingNotificationInput = {
  paymentId?: number | null;
  leadId: number;
  slipField: string;
  type: PaymentNotificationType;
  title: string;
  message?: string | null;
  createdBy?: number | null;
};

type AccountWorkNotificationType =
  | "account_payment_waiting_review"
  | "account_cheque_waiting_receive"
  | "account_cheque_waiting_money";

type PaymentNotificationType =
  | AccountWorkNotificationType
  | "sale_payment_approved"
  | "sale_payment_rejected";

const ACCOUNT_WORK_NOTIFICATION_TYPES: AccountWorkNotificationType[] = [
  "account_payment_waiting_review",
  "account_cheque_waiting_receive",
  "account_cheque_waiting_money",
];

function request(db: DbExecutor) {
  return db instanceof sql.Transaction ? new sql.Request(db) : db.request();
}

export async function notifyAccountingRole(db: DbExecutor, input: AccountingNotificationInput) {
  const paymentKey = input.paymentId ? String(input.paymentId) : `${input.leadId}:${input.slipField}`;
  const eventKey = `${input.type}:${paymentKey}`;
  const targetUrl = `/report/pending?payment_id=${input.paymentId || ""}`;

  await request(db)
    .input("paymentId", sql.Int, input.paymentId || null)
    .input("leadId", sql.Int, input.leadId)
    .input("slipField", sql.NVarChar(50), input.slipField)
    .input("type", sql.NVarChar(50), input.type)
    .input("eventKey", sql.NVarChar(160), eventKey)
    .input("title", sql.NVarChar(250), input.title)
    .input("message", sql.NVarChar(1000), input.message || null)
    .input("targetUrl", sql.NVarChar(500), targetUrl)
    .input("createdBy", sql.Int, input.createdBy || null)
    .query(`
      MERGE dbo.accounting_notifications WITH (HOLDLOCK) AS target
      USING (
        SELECT u.id recipient_user_id
        FROM dbo.users u
        WHERE u.is_active = 1
          AND ISJSON(u.roles) = 1
          AND EXISTS (
            SELECT 1 FROM OPENJSON(u.roles) roles
            WHERE roles.[value] IN ('account', 'admin')
          )
      ) AS source
      ON target.recipient_user_id = source.recipient_user_id
        AND target.event_key = @eventKey
      WHEN MATCHED THEN UPDATE SET
        payment_id = @paymentId,
        lead_id = @leadId,
        slip_field = @slipField,
        notification_type = @type,
        title = @title,
        message = @message,
        target_url = @targetUrl,
        created_by = @createdBy,
        read_at = NULL,
        resolved_at = NULL,
        created_at = GETDATE(),
        updated_at = GETDATE()
      WHEN NOT MATCHED THEN INSERT (
        payment_id, lead_id, slip_field, recipient_user_id,
        notification_type, event_key, title, message, target_url, created_by
      ) VALUES (
        @paymentId, @leadId, @slipField, source.recipient_user_id,
        @type, @eventKey, @title, @message, @targetUrl, @createdBy
      );
    `);
}

export async function notifyLeadOwner(
  db: DbExecutor,
  input: AccountingNotificationInput & { targetUrl?: string; submittedBy?: number | null },
) {
  const paymentKey = input.paymentId ? String(input.paymentId) : `${input.leadId}:${input.slipField}`;
  const eventKey = `${input.type}:${paymentKey}`;
  const targetUrl = input.targetUrl || `/leads/${input.leadId}?focus=1`;

  await request(db)
    .input("paymentId", sql.Int, input.paymentId || null)
    .input("leadId", sql.Int, input.leadId)
    .input("slipField", sql.NVarChar(50), input.slipField)
    .input("type", sql.NVarChar(50), input.type)
    .input("eventKey", sql.NVarChar(160), eventKey)
    .input("title", sql.NVarChar(250), input.title)
    .input("message", sql.NVarChar(1000), input.message || null)
    .input("targetUrl", sql.NVarChar(500), targetUrl)
    .input("createdBy", sql.Int, input.createdBy || null)
    .input("submittedBy", sql.Int, input.submittedBy || null)
    .query(`
      MERGE dbo.accounting_notifications WITH (HOLDLOCK) AS target
      USING (
        SELECT DISTINCT u.id recipient_user_id
        FROM dbo.users u
        WHERE u.is_active = 1
          AND u.id IN (
            SELECT l.assigned_user_id FROM dbo.leads l WHERE l.id = @leadId
            UNION
            SELECT p.submitted_by
            FROM dbo.payments p
            WHERE (@paymentId IS NOT NULL AND p.id = @paymentId)
               OR (@paymentId IS NULL AND p.lead_id = @leadId AND p.slip_field = @slipField)
            UNION
            SELECT @submittedBy
          )
      ) AS source
      ON target.recipient_user_id = source.recipient_user_id
        AND target.event_key = @eventKey
      WHEN MATCHED THEN UPDATE SET
        payment_id = @paymentId,
        lead_id = @leadId,
        slip_field = @slipField,
        notification_type = @type,
        title = @title,
        message = @message,
        target_url = @targetUrl,
        created_by = @createdBy,
        read_at = NULL,
        resolved_at = NULL,
        created_at = GETDATE(),
        updated_at = GETDATE()
      WHEN NOT MATCHED THEN INSERT (
        payment_id, lead_id, slip_field, recipient_user_id,
        notification_type, event_key, title, message, target_url, created_by
      ) VALUES (
        @paymentId, @leadId, @slipField, source.recipient_user_id,
        @type, @eventKey, @title, @message, @targetUrl, @createdBy
      );
    `);
}

export async function resolveAccountingNotifications(
  db: DbExecutor,
  input: { paymentId?: number | null; leadId?: number | null; slipField?: string | null; types?: AccountWorkNotificationType[] },
) {
  if (!input.paymentId && (!input.leadId || !input.slipField)) return;
  const types = input.types?.length ? input.types : ACCOUNT_WORK_NOTIFICATION_TYPES;
  await request(db)
    .input("paymentId", sql.Int, input.paymentId || null)
    .input("leadId", sql.Int, input.leadId || null)
    .input("slipField", sql.NVarChar(50), input.slipField || null)
    .input("type1", sql.NVarChar(50), types[0] || null)
    .input("type2", sql.NVarChar(50), types[1] || null)
    .input("type3", sql.NVarChar(50), types[2] || null)
    .query(`
      UPDATE dbo.accounting_notifications
      SET resolved_at = COALESCE(resolved_at, GETDATE()),
          read_at = COALESCE(read_at, GETDATE()),
          updated_at = GETDATE()
      WHERE resolved_at IS NULL
        AND (
          (@paymentId IS NOT NULL AND payment_id = @paymentId)
          OR (@leadId IS NOT NULL AND @slipField IS NOT NULL AND lead_id = @leadId AND slip_field = @slipField)
        )
        AND notification_type IN (@type1, @type2, @type3);
    `);
}
