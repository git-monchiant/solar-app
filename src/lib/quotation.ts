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
  source_type?:
    | "addon"
    | "custom"
    | "addon_package"
    | "addon_package_detail"
    | "custom_group"
    | "custom_detail";
  package_item_id?: number | null;
  item_name: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  line_total?: number;
  // Set when this add-on line is itself a package (chosen from Package Master).
  // Lets the API promote the first such add-on to the main package when no main
  // package is selected, so its equipment detail lines render like a main one.
  source_package_id?: number;
};

export function parseQuotationAddOnItems(value: unknown): QuotationInputItem[] {
  if (!Array.isArray(value)) return [];
  const allowedSources = new Set([
    "addon",
    "custom",
    "addon_package",
    "addon_package_detail",
    "custom_group",
    "custom_detail",
  ]);
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(
          item &&
            typeof item === "object" &&
            String((item as Record<string, unknown>).item_name || "").trim(),
        ),
    )
    .map((item) => {
      const sourceType = String(item.source_type || "custom");
      const quantity = Number(item.quantity);
      const unitPrice = Math.max(0, Number(item.unit_price) || 0);
      const packageItemId = Number(item.package_item_id);
      const unit = String(item.unit || "").trim().slice(0, 50);
      const isPackageSnapshot =
        sourceType === "addon_package" ||
        sourceType === "addon_package_detail" ||
        sourceType === "custom_detail";
      return {
        source_type: allowedSources.has(sourceType)
          ? (sourceType as QuotationInputItem["source_type"])
          : "custom",
        package_item_id:
          Number.isInteger(packageItemId) && packageItemId > 0
            ? packageItemId
            : null,
        item_name: String(item.item_name).trim().slice(0, 500),
        quantity:
          Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: unit || (isPackageSnapshot ? null : "ชุด"),
        unit_price: unitPrice,
        line_total:
          sourceType === "addon_package"
            ? Math.max(0, Number(item.line_total) || 0)
            : undefined,
        source_package_id: Number(item.source_package_id) || undefined,
      };
    });
}

export type QuotationPackageInputItem = {
  package_item_id: number | null;
  item_name: string;
  quantity: number;
  unit: string | null;
};

export function parseQuotationPackageItems(
  value: unknown,
): QuotationPackageInputItem[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(
          item &&
            typeof item === "object" &&
            String((item as Record<string, unknown>).item_name || "").trim(),
        ),
    )
    .map((item) => {
      const quantity = Number(item.quantity);
      const packageItemId = Number(item.package_item_id);
      return {
        package_item_id:
          Number.isInteger(packageItemId) && packageItemId > 0
            ? packageItemId
            : null,
        item_name: String(item.item_name).trim().slice(0, 500),
        quantity:
          Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: String(item.unit || "").trim().slice(0, 50) || null,
      };
    });
}

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

// Roles allowed to create / edit / delete quotations. Any of these can act on
// ANY lead — the old per-lead "assigned owner" restriction was dropped so the
// whole sales + solar team can manage quotations together (admin included).
// Note: account / leadsseeker are intentionally NOT here.
export const QUOTATION_MANAGE_ROLES = ["admin", "sales", "sales_sup", "solar", "solar_sup"];
export function canManageQuotation(roles: string[] | undefined | null): boolean {
  return Array.isArray(roles) && roles.some((r) => QUOTATION_MANAGE_ROLES.includes(r));
}

export function calculateQuotation(packagePrice: number, items: QuotationInputItem[], discountType: string, discountValue: number, deposit: number, vatRate = 7) {
  const extras = items.reduce(
    (sum, item) =>
      sum +
      (item.source_type === "addon_package"
        ? Math.max(0, Number(item.line_total) || 0)
        : Math.max(0, Number(item.quantity) || 0) *
          Math.max(0, Number(item.unit_price) || 0)),
    0,
  );
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
  const prefix = `SSR-QT-${year}-`;
  const result = await new sql.Request(tx)
    .input("like", sql.NVarChar(30), `${prefix}%`)
    .input("legacy_like", sql.NVarChar(30), `SM-QT-${year}-%`)
    .query(`
      SELECT MAX(TRY_CAST(RIGHT(doc_no, CHARINDEX('-', REVERSE(doc_no)) - 1) AS INT)) AS max_num
      FROM quotations WITH (UPDLOCK, HOLDLOCK)
      WHERE doc_no LIKE @like OR doc_no LIKE @legacy_like
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
           approver.full_name approved_by_name,
           solar.full_name solar_approved_name, solar.job_title solar_approved_title,
           solar.signature_data solar_approved_signature_data, solar.signature_mime solar_approved_signature_mime
    FROM quotations q
    JOIN leads l ON l.id = q.lead_id
    LEFT JOIN projects project ON project.id = l.project_id
    LEFT JOIN users creator ON creator.id = q.created_by
    LEFT JOIN users approver ON approver.id = q.approved_by
    LEFT JOIN users solar ON solar.id = q.solar_approved_by
    WHERE q.id = @id;
    SELECT qi.*, pi.package_id source_package_id
    FROM quotation_items qi
    LEFT JOIN package_items pi ON pi.id=qi.package_item_id
    WHERE qi.quotation_id = @id ORDER BY qi.sort_order, qi.id;
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
