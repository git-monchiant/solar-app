import { getDb, sql } from "@/lib/db";

// Build the Content-Disposition header for a generated document. Pulls the
// lead's full_name and weaves it into the filename so downloaded PDFs/images
// land in the user's Downloads folder with a name they can recognise instead
// of `survey_123.pdf`.
//
// Thai characters are non-ASCII, so we emit BOTH `filename=` (ASCII fallback
// with the name stripped) and `filename*=UTF-8''<encoded>` (RFC 5987). Modern
// browsers prefer the encoded form; older ones use the fallback. The header
// is returned ready to drop into a NextResponse {headers} object.

export type Disposition = "inline" | "attachment";

function sanitize(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .trim()
    // Drop characters that are illegal in filenames on every common OS.
    .replace(/[\\/:*?"<>|]/g, "")
    // Collapse runs of whitespace into a single underscore.
    .replace(/\s+/g, "_");
}

function asciiOnly(s: string): string {
  // Strip anything outside printable ASCII so the legacy `filename=` token
  // stays valid even when the customer's name is full Thai. Stripping Thai
  // leaves the separators behind ("วรรณวิมล_รัตนสุวรรณ" → "__"), so collapse
  // and trim them too — otherwise the fallback reads "-691__.pdf".
  return s.replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
}

export async function leadFullName(leadId: number): Promise<string | null> {
  if (!leadId) return null;
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT full_name FROM leads WHERE id = @id`);
    const v = r.recordset[0]?.full_name;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

// Build the Content-Disposition value. Pass `base` like "survey_123" and the
// helper appends the customer name + extension. If `customerName` is null
// (lead not found, etc.) the file is named with the base only.
export function buildContentDisposition(opts: {
  base: string;            // "survey_123"
  ext: string;              // "pdf" / "png"
  customerName: string | null;
  disposition?: Disposition; // defaults to "inline"
}): string {
  const cleaned = sanitize(opts.customerName);
  const stem = cleaned ? `${opts.base}_${cleaned}` : opts.base;
  const filename = `${stem}.${opts.ext}`;
  // `base` also has to be stripped, not just the customer name: a Thai base
  // (e.g. "รายงานสำรวจ") left in the plain `filename=` token makes the whole
  // header non-ByteString and the response throws before it is ever sent.
  // Empty parts are dropped rather than joined, so an all-Thai base + name
  // degrades to "document.pdf" instead of "document__.pdf".
  const asciiStem = [asciiOnly(opts.base), asciiOnly(cleaned)].filter(Boolean).join("_") || "document";
  const asciiFilename = `${asciiStem}.${opts.ext}`;
  const disp = opts.disposition || "inline";
  // RFC 5987 — encode the UTF-8 form. The ASCII form keeps legacy clients
  // happy; modern browsers use the starred token.
  return `${disp}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// One-shot helper: fetch the name then build the disposition header.
export async function dispositionForLead(leadId: number, opts: { base: string; ext: string; disposition?: Disposition }): Promise<string> {
  const name = await leadFullName(leadId);
  return buildContentDisposition({ ...opts, customerName: name });
}
