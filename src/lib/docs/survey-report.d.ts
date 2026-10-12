type LeadRow = Record<string, unknown>;

type SurveyReportOptions = {
  quotationAttached?: boolean;
  watermark?: string;
  quotation?: {
    docNo?: string;
    /** Package + add-ons before discount, i.e. the quotation subtotal. */
    grossAmount?: number;
    discountAmount?: number;
    discountLabel?: string;
    contractAmount?: number;
    depositAmount?: number;
    netAmount?: number;
  };
  /** ชื่อแพ็กเกจที่จะแสดงใน §4 — บรรทัดแรกของรายการในใบเสนอราคา */
  packageTitle?: string;
  /** package ที่ไม่ใช่ตัวหลัก + งานเพิ่ม — แสดงในตาราง §5 รายการเพิ่มเติม */
  addOns?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    amount?: number;
  }>;
  financial?: {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  };
};

/** Build the survey report HTML for one lead (hybrid fill — blanks stay blank).
 *  15 pages; 14 (loan) or 13 (cash/card) when financial.inputs.payment_method narrows the payment section. */
export function buildSurveyReportHtml(L: LeadRow, D: LeadRow, PKG: LeadRow | null, options?: SurveyReportOptions): string;

/** Number of A4 pages in HTML returned by buildSurveyReportHtml. */
export function countSurveyReportPages(html: string): number;

/** Absolute path of the accepted quotation PDF to append as ภาคผนวก ก, or null. */
export function quotationPdfPath(L: LeadRow): string | null;
