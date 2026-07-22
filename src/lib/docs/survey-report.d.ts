type LeadRow = Record<string, unknown>;

/** Build the 15-page survey report HTML for one lead (hybrid fill — blanks stay blank). */
export function buildSurveyReportHtml(L: LeadRow, D: LeadRow, PKG: LeadRow | null): string;

/** Absolute path of the accepted quotation PDF to append as ภาคผนวก ก, or null. */
export function quotationPdfPath(L: LeadRow): string | null;
