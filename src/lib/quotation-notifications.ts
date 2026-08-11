import { sql } from "@/lib/db";

type NotificationInput = {
  quotationId: number;
  leadId: number;
  type: string;
  stage?: string | null;
  title: string;
  message?: string | null;
  createdBy?: number | null;
};

export async function closeQuotationStageNotifications(
  tx: sql.Transaction,
  quotationId: number,
  stage: "solar_sup" | "sales_sup",
) {
  await new sql.Request(tx)
    .input("quotationId", sql.Int, quotationId)
    .input("stage", sql.NVarChar(30), stage)
    .query(`
      UPDATE dbo.quotation_approval_notifications
      SET read_at = COALESCE(read_at, GETDATE())
      WHERE quotation_id = @quotationId
        AND approval_stage = @stage
        AND read_at IS NULL;
    `);
}

export async function notifyQuotationRole(
  tx: sql.Transaction,
  role: "solar_sup" | "sales_sup",
  input: NotificationInput,
) {
  await new sql.Request(tx)
    .input("quotationId", sql.Int, input.quotationId)
    .input("leadId", sql.Int, input.leadId)
    .input("role", sql.NVarChar(30), role)
    .input("type", sql.NVarChar(40), input.type)
    .input("stage", sql.NVarChar(30), input.stage || null)
    .input("title", sql.NVarChar(250), input.title)
    .input("message", sql.NVarChar(1000), input.message || null)
    .input("createdBy", sql.Int, input.createdBy || null)
    .query(`
      INSERT dbo.quotation_approval_notifications(
        quotation_id, lead_id, recipient_user_id, notification_type,
        approval_stage, title, message, created_by
      )
      SELECT @quotationId, @leadId, u.id, @type, @stage, @title, @message, @createdBy
      FROM dbo.users u
      WHERE u.is_active = 1
        AND ISJSON(u.roles) = 1
        AND EXISTS (
          SELECT 1 FROM OPENJSON(u.roles) roles WHERE roles.[value] = @role
        );
    `);
}

export async function notifyQuotationUser(
  tx: sql.Transaction,
  recipientUserId: number | null | undefined,
  input: NotificationInput,
) {
  if (!recipientUserId) return;
  await new sql.Request(tx)
    .input("quotationId", sql.Int, input.quotationId)
    .input("leadId", sql.Int, input.leadId)
    .input("recipient", sql.Int, recipientUserId)
    .input("type", sql.NVarChar(40), input.type)
    .input("stage", sql.NVarChar(30), input.stage || null)
    .input("title", sql.NVarChar(250), input.title)
    .input("message", sql.NVarChar(1000), input.message || null)
    .input("createdBy", sql.Int, input.createdBy || null)
    .query(`
      INSERT dbo.quotation_approval_notifications(
        quotation_id, lead_id, recipient_user_id, notification_type,
        approval_stage, title, message, created_by
      )
      SELECT @quotationId, @leadId, u.id, @type, @stage, @title, @message, @createdBy
      FROM dbo.users u
      WHERE u.id = @recipient AND u.is_active = 1;
    `);
}
