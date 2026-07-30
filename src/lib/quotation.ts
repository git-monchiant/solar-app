import "server-only";
import { getDb, sql } from "@/lib/db";

export const QUOTATION_STATUSES = [
  "draft",
  "pending_solar_sup",
  "pending_sales_sup",
  "pending_approval",
  "approved",
  "changes_required",
] as const;
export type QuotationStatus = typeof QUOTATION_STATUSES[number];
export type QuotationInputItem = {
  source_type?: "addon" | "custom";
  item_name: string;
  quantity: number;
  unit?: string;
  unit_price: number;
};

export function parseRoles(raw: unknown): string[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === "string") : [];
  } catch { return []; }
}

export async function getQuotationActor(userId: number) {
  const db = await getDb();
  const result = await db.request().input("id", sql.Int, userId).query(`
    SELECT id, full_name, job_title, signature_url, signature_data, signature_mime, roles
    FROM users WHERE id = @id AND is_active = 1
  `);
  const row = result.recordset[0];
  return row ? { ...row, roles: parseRoles(row.roles) } : null;
}

export function calculateQuotation(packagePrice: number, items: QuotationInputItem[], discountType: string, discountValue: number, deposit: number, vatRate = 7) {
  const extras = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_price) || 0), 0);
  const subtotal = Math.max(0, Number(packagePrice) || 0) + extras;
  const safeValue = Math.max(0, Number(discountValue) || 0);
  const discountAmount = discountType === "percent" ? subtotal * Math.min(safeValue, 100) / 100 : Math.min(safeValue, subtotal);
  const total = Math.max(0, subtotal - discountAmount);
  const depositPaid = Math.min(Math.max(0, Number(deposit) || 0), total);
  const outstanding = Math.max(0, total - depositPaid);
  const beforeVat = outstanding / (1 + Math.max(0, vatRate) / 100);
  return {
    subtotal: round2(subtotal), discountAmount: round2(discountAmount), total: round2(total),
    deposit: round2(depositPaid), outstanding: round2(outstanding),
    beforeVat: round2(beforeVat), vatAmount: round2(outstanding - beforeVat),
  };
}

function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export async function nextQuotationDocNo(tx: InstanceType<typeof sql.Transaction>): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `SM-QT-${year}-`;
  const result = await new sql.Request(tx).input("like", sql.NVarChar(30), `${prefix}%`).query(`
    SELECT MAX(TRY_CAST(SUBSTRING(doc_no, ${prefix.length + 1}, 10) AS INT)) AS max_num
    FROM quotations WITH (UPDLOCK, HOLDLOCK) WHERE doc_no LIKE @like
  `);
  return `${prefix}${String((result.recordset[0]?.max_num || 0) + 1).padStart(4, "0")}`;
}

export async function getQuotationDetail(id: number) {
  const db = await getDb();
  const result = await db.request().input("id", sql.Int, id).query(`
    SELECT q.*, l.full_name customer_name, l.phone customer_phone, l.email customer_email,
           l.installation_address, l.id_card_address, l.id_card_number, l.assigned_user_id,
           COALESCE(NULLIF(l.project_alias, N''), NULLIF(l.project_name, N''), project.name) project_name,
           creator.full_name created_by_name, creator.job_title created_by_title,
           creator.phone created_by_phone, creator.email created_by_email,
           creator.signature_data created_by_signature_data, creator.signature_mime created_by_signature_mime,
           approver.full_name approved_by_name
    FROM quotations q
    JOIN leads l ON l.id = q.lead_id
    LEFT JOIN projects project ON project.id = l.project_id
    LEFT JOIN users creator ON creator.id = q.created_by
    LEFT JOIN users approver ON approver.id = q.approved_by
    WHERE q.id = @id;
    SELECT * FROM quotation_items WHERE quotation_id = @id ORDER BY sort_order, id;
    SELECT e.*, u.full_name acted_by_name FROM quotation_approval_events e
    LEFT JOIN users u ON u.id = e.acted_by WHERE e.quotation_id = @id ORDER BY e.acted_at;
    SELECT [key], value FROM app_settings WHERE [key] IN (
      'bank_account_bank', 'bank_account_branch', 'bank_account_number', 'bank_account_name'
    );
  `);
  const recordsets = result.recordsets as unknown as Array<typeof result.recordset>;
  if (!recordsets[0]?.[0]) return null;
  return { ...recordsets[0][0], items: recordsets[1], events: recordsets[2], settings: recordsets[3] };
}
