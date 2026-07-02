import { getDb, sql } from "@/lib/db";

type Pool = Awaited<ReturnType<typeof getDb>>;
type Tx = InstanceType<typeof sql.Transaction>;

// Doc-no factory shared by every numbered document in the system.
//
// Each doc-type maps to:
//   - settings key for prefix/digits (configurable via /settings UI)
//   - default prefix when no setting is stored
//   - the leads column where the number lives
//
// Format: `{PREFIX}-{YY}{NNN…}` where YY is the 2-digit current year and the
// counter resets per year per type. The counter is scoped per-type so the
// SM-26045 booking never collides with QT-26045 quotation.
//
// Used by:
//   - /api/leads/[id]/book                 booking doc on order placement
//   - /api/payments POST                   booking doc on pre_slip confirm
//                                          (fallback for leads that skipped /book)
//   - /api/doc/invoice/[token]/data        booking doc on invoice render
//   - /api/leads/[id]/doc-no/mint POST     generic on-demand mint from frontend
//                                          (QuoteStep, WarrantyStep, …)
//
// Pass `tx` to run inside an existing transaction so the mint commits/rolls
// back with the surrounding work.
export type DocType = "booking" | "quotation" | "survey" | "warranty" | "install_checklist";

const DEFAULTS: Record<DocType, { prefix: string; column: string; digits?: number }> = {
  booking:           { prefix: "SM",  column: "pre_doc_no" },
  quotation:         { prefix: "QT",  column: "quotation_doc_no" },
  survey:            { prefix: "SV",  column: "survey_doc_no" },
  warranty:          { prefix: "SSE", column: "warranty_doc_no" },
  // SSE-CK-YY#### — 4-digit counter (#### per user spec).
  install_checklist: { prefix: "SSE-CK", column: "install_checklist_doc_no", digits: 4 },
};

function reqFor(poolOrTx: Pool | Tx) {
  return "begin" in poolOrTx
    ? new sql.Request(poolOrTx as Tx)
    : (poolOrTx as Pool).request();
}

// Read the effective prefix + digits for a doc type — config falls back to the
// hard-coded defaults whenever the row is absent or malformed.
export async function getDocConfig(
  poolOrTx: Pool | Tx,
  type: DocType,
): Promise<{ prefix: string; digits: number }> {
  const cfg = await reqFor(poolOrTx).query(
    `SELECT [key], value FROM app_settings WHERE [key] IN ('doc_prefix_${type}', 'doc_digits_${type}')`,
  );
  const map: Record<string, string> = {};
  for (const r of cfg.recordset) map[r.key] = r.value;
  // Allow a single internal dash for multi-segment prefixes (e.g. "SSE-CK")
  // — strip everything else, collapse repeats, and trim leading/trailing.
  const prefix = (map[`doc_prefix_${type}`] || DEFAULTS[type].prefix)
    .replace(/[^A-Z0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase() || DEFAULTS[type].prefix;
  // Per-type digit default (fallback 3) — install_checklist defaults to 4
  // for the #### spec. Admin can still override via doc_digits_<type>.
  const defaultDigits = String(DEFAULTS[type].digits ?? 3);
  const digits = Math.max(3, Math.min(5, parseInt(map[`doc_digits_${type}`] || defaultDigits) || (DEFAULTS[type].digits ?? 3)));
  return { prefix, digits };
}

// Build the exact regex a stored doc-no must match for the type — used by
// validators on PATCH endpoints to keep malformed strings out of the column.
export async function getDocRegex(
  poolOrTx: Pool | Tx,
  type: DocType,
): Promise<RegExp> {
  const { prefix, digits } = await getDocConfig(poolOrTx, type);
  // ^PREFIX-YY{N digits}$  (one dash only, exact length)
  return new RegExp(`^${prefix}-\\d{${2 + digits}}$`);
}

// Mint the next doc-no for a lead. Idempotent — if the column is already set
// the existing value is returned untouched so receipts already in customers'
// hands stay valid.
export async function mintDocNo(
  poolOrTx: Pool | Tx,
  leadId: number,
  type: DocType,
): Promise<string | null> {
  const column = DEFAULTS[type].column;

  const existing = await reqFor(poolOrTx)
    .input("id", sql.Int, leadId)
    .query(`SELECT ${column} AS doc FROM leads WHERE id = @id`);
  const current = existing.recordset[0]?.doc;
  if (current) return current as string;

  // install_checklist piggybacks on the lead's quotation running number —
  // user wants the install handover doc to share the QT serial so customers
  // can see at a glance that QT-260694 and SSE-CK-260694 belong together.
  // If the lead has no quotation yet we fall through to minting a fresh
  // install sequence.
  if (type === "install_checklist") {
    const reuse = await mintFromQuotation(poolOrTx, leadId, column);
    if (reuse) return reuse;
  }

  const { prefix, digits } = await getDocConfig(poolOrTx, type);
  const year = new Date().getFullYear().toString().slice(-2);
  const like = `${prefix}-${year}%`;
  // Pull MAX of the counter portion regardless of digit-length — lets the
  // sequence continue smoothly when an admin bumps doc_digits_* (existing
  // SM-26051 → next SM-260052 instead of restarting at SM-260001).
  // TRY_CAST drops any historical row whose counter isn't pure digits so a
  // malformed legacy doc (`SM-PM-26001`) won't pollute the max.
  const counterStart = prefix.length + 1 + 2 + 1; // 1-indexed: position after `{prefix}-{yy}`
  const maxRes = await reqFor(poolOrTx)
    .input("like", sql.NVarChar(20), like)
    .query(`SELECT MAX(TRY_CAST(SUBSTRING(${column}, ${counterStart}, 20) AS INT)) AS max_num
            FROM leads
            WHERE ${column} LIKE @like`);
  const nextNum = ((maxRes.recordset[0].max_num || 0) + 1).toString().padStart(digits, "0");
  const docNo = `${prefix}-${year}${nextNum}`;

  // Guard with column IS NULL so a concurrent mint can't clobber.
  await reqFor(poolOrTx)
    .input("id", sql.Int, leadId)
    .input("doc_no", sql.NVarChar(20), docNo)
    .query(`UPDATE leads SET ${column} = @doc_no, updated_at = GETDATE()
            WHERE id = @id AND ${column} IS NULL`);

  return docNo;
}

// Helper for install_checklist — reuse the lead's quotation running number,
// just swap the prefix (QT-260694 -> SSE-CK-260694). Returns null if the
// lead has no quotation_doc_no yet so the caller can fall back to minting a
// fresh sequence.
async function mintFromQuotation(
  poolOrTx: Pool | Tx,
  leadId: number,
  column: string,
): Promise<string | null> {
  const qtRes = await reqFor(poolOrTx)
    .input("id", sql.Int, leadId)
    .query(`SELECT quotation_doc_no FROM leads WHERE id = @id`);
  const qtDoc = qtRes.recordset[0]?.quotation_doc_no as string | null | undefined;
  if (!qtDoc) return null;

  const qtPrefix = (await getDocConfig(poolOrTx, "quotation")).prefix;
  const ckPrefix = (await getDocConfig(poolOrTx, "install_checklist")).prefix;
  if (!qtDoc.startsWith(`${qtPrefix}-`)) return null;
  const running = qtDoc.slice(qtPrefix.length + 1);
  const docNo = `${ckPrefix}-${running}`;

  await reqFor(poolOrTx)
    .input("id", sql.Int, leadId)
    .input("doc_no", sql.NVarChar(20), docNo)
    .query(`UPDATE leads SET ${column} = @doc_no, updated_at = GETDATE()
            WHERE id = @id AND ${column} IS NULL`);
  return docNo;
}

// Back-compat wrapper for the original booking-only helper.
export const mintPreDocNo = (poolOrTx: Pool | Tx, leadId: number) =>
  mintDocNo(poolOrTx, leadId, "booking");

// Reject doc-no inputs that don't match the type's config. Used by the
// PATCH /api/leads/[id] route to keep the data clean — without this any
// string could be saved (the cause of "SM-PM-26001", "SM-SN-26006" etc.
// observed in the wild).
//
// Allowed:
//   - null / "" / undefined         (clear the column)
//   - "{PREFIX}-{YY}{NNN…}"         (canonical)
//   - "{PREFIX}-{YY}{NNN…}-N"       (suffix for QuoteStep slot variants)
export async function validateDocNo(
  poolOrTx: Pool | Tx,
  type: DocType,
  value: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (value === null || value === undefined || value === "") return { ok: true };
  if (typeof value !== "string") return { ok: false, reason: "doc-no must be a string" };
  const { prefix } = await getDocConfig(poolOrTx, type);
  // Lenient on counter length (5–7 digits = 2 year + 3–5 counter) so
  // grandfathered docs from older config (digits=3, SM-26049) keep validating
  // after the admin bumps doc_digits_* to 4 or 5. Mint logic always uses the
  // current config; validation just guards against the structural mistakes
  // (extra dashes, wrong prefix) that caused SM-PM-26001 / SM-SN-26006.
  const re = new RegExp(`^${prefix}-\\d{5,7}(?:-\\d+)?$`);
  if (!re.test(value)) {
    return { ok: false, reason: `doc-no must match ${prefix}-YYNNN[N[N]] (optional -N suffix)` };
  }
  return { ok: true };
}

