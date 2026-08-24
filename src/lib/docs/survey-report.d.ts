type LeadRow = Record<string, unknown>;

type SurveyReportOptions = {
  quotationAttached?: boolean;
  /** Quotation add-on lines (everything that is not the main package) shown in §5. */
  items?: Array<Record<string, unknown>>;
  watermark?: string;
  quotation?: {
    docNo?: string;
    /** Main package price only — what §4 prices. */
    packageAmount?: number;
    /** Package + add-ons before discount, i.e. the quotation subtotal. */
    grossAmount?: number;
    discountAmount?: number;
    discountLabel?: string;
    contractAmount?: number;
    depositAmount?: number;
    netAmount?: number;
  };
  financial?: {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  };
};

/** Build the 15-page survey report HTML for one lead (hybrid fill — blanks stay blank). */
export function buildSurveyReportHtml(L: LeadRow, D: LeadRow, PKG: LeadRow | null, options?: SurveyReportOptions): string;

/** Absolute path of the accepted quotation PDF to append as ภาคผนวก ก, or null. */
export function quotationPdfPath(L: LeadRow): string | null;
