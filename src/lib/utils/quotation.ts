// One quotation option attached to a lead. QuoteStep persists up to 3 of
// these as a JSON array in leads.quotation_files. Legacy rows (bare CSV of
// URLs) are migrated on read using the lead-level quotation_doc_no /
// quotation_amount as the first entry's metadata.
export type QuoteOption = {
  url: string;
  doc_no: string;
  amount: number;
  subtotal?: number;
  discount_label?: string;
  discount_type?: "amount" | "percent";
  discount_value?: number;
  discount_amount?: number;
};

// Chrome's built-in PDF viewer uses the last URL segment as its tab title.
// Keep the quotation id for the API lookup, but append the document number as
// a filename so the tab reads "SM-QT-YY-XXXX.pdf" instead of just "2".
export function withQuotationPdfFilename(url: string, docNo: string): string {
  if (!docNo) return url;
  const match = url.match(
    /^(\/api\/quotation-pdf\/[^/?#]+)(?:\/[^?#]*)?([?#].*)?$/,
  );
  if (!match) return url;
  const filename = `${docNo.replace(/\.pdf$/i, "")}.pdf`;
  return `${match[1]}/${encodeURIComponent(filename)}${match[2] || ""}`;
}

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
          .map((e, i) => {
            const docNo = String(
              e?.doc_no || (i === 0 ? fallbackDocNo : ""),
            );
            return {
              url: withQuotationPdfFilename(String(e?.url || ""), docNo),
              doc_no: docNo,
              amount: Number(e?.amount) || (i === 0 ? fallbackAmount : 0),
              subtotal: Number(e?.subtotal) || undefined,
              discount_label: String(e?.discount_label || ""),
              discount_type: (e?.discount_type === "percent" ? "percent" : "amount") as
                | "percent"
                | "amount",
              discount_value: Number(e?.discount_value) || 0,
              discount_amount: Number(e?.discount_amount) || 0,
            };
          })
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
    subtotal: Number(o.subtotal) || undefined,
    discount_label: o.discount_label || "",
    discount_type: o.discount_type || "amount",
    discount_value: Number(o.discount_value) || 0,
    discount_amount: Number(o.discount_amount) || 0,
  }));
  if (cleaned.length === 0) return null;
  return JSON.stringify(cleaned);
}
