// One quotation option attached to a lead. QuoteStep persists up to 3 of
// these as a JSON array in leads.quotation_files. Legacy rows (bare CSV of
// URLs) are migrated on read using the lead-level quotation_doc_no /
// quotation_amount as the first entry's metadata.
export type QuoteOption = { url: string; doc_no: string; amount: number };

export function parseQuotationFiles(
  value: string | null | undefined,
  fallbackDocNo: string = "",
  fallbackAmount: number = 0,
): QuoteOption[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr
          .map((e, i) => ({
            url: String(e?.url || ""),
            doc_no: String(e?.doc_no || (i === 0 ? fallbackDocNo : "")),
            amount: Number(e?.amount) || (i === 0 ? fallbackAmount : 0),
          }))
          .filter(q => q.url);
      }
    } catch {
      // fall through to CSV handling
    }
  }
  return trimmed.split(",")
    .map(u => u.trim())
    .filter(Boolean)
    .map((url, i) => ({
      url,
      doc_no: i === 0 ? fallbackDocNo : "",
      amount: i === 0 ? fallbackAmount : 0,
    }));
}

export function serializeQuotationFiles(options: QuoteOption[]): string | null {
  const cleaned = options.filter(o => o.url).map(o => ({
    url: o.url,
    doc_no: o.doc_no || "",
    amount: Number(o.amount) || 0,
  }));
  if (cleaned.length === 0) return null;
  return JSON.stringify(cleaned);
}
