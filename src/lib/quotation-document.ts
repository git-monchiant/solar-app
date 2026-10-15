import "server-only";
import { getDb, sql } from "@/lib/db";
import { GSB_SOLAR_LOAN_DEFAULTS, rateForYear, readInterestSchedule, type LoanInterestTier } from "@/lib/loan-defaults";
import { missingLoadAnswers } from "@/lib/load-assumption";
import {
  getQuotationLegalContent,
  parseQuotationOmSettings,
  parseQuotationTermTree,
  type QuotationLegalContent,
  type QuotationOmSettings,
  type QuotationTermTree,
} from "@/lib/quotation-terms";

// v5 = snapshot เก็บข้อความเงื่อนไข/ข้อกำหนด (legal) ไว้ในตัวด้วย ก่อนหน้านี้ PDF
// เรนเดอร์จากข้อความในโค้ดสด ๆ ทุกครั้ง ใบที่อนุมัติไปแล้วจึงเปลี่ยนตามการแก้โค้ด
export const QUOTATION_DOCUMENT_VERSION = 5;
// v3 = จุดคุ้มทุนแบบสินเชื่อนับดอกเบี้ยด้วย + ระยะได้เงินดาวน์คืน (แผน 20261012-06)
// v4 = ดอกเบี้ยสินเชื่อเป็นตารางหลายช่วงตามประกาศออมสิน (แผน 20261014-02)
export const QUOTATION_FINANCE_FORMULA_VERSION = "gsb-tiered-interest-v4";

// รหัสชุดเดียวกับ PAYMENT_INTERESTS ในแบบสอบถาม — ใบเสนอราคาใช้คำตอบ Pre-Survey
// เป็นค่าเริ่มต้นได้ตรง ๆ ไม่ต้องแปลงรหัส
export type QuotationPaymentMethod = "cash" | "loan" | "credit_card";
const PAYMENT_METHODS: readonly QuotationPaymentMethod[] = ["cash", "loan", "credit_card"];
export const readPaymentMethod = (value: unknown): QuotationPaymentMethod | null =>
  PAYMENT_METHODS.includes(value as QuotationPaymentMethod) ? (value as QuotationPaymentMethod) : null;

export type QuotationDocumentInputs = {
  om: QuotationOmSettings;
  // ชุดเงื่อนไข/ข้อกำหนดที่ผู้ใช้แก้ไว้เฉพาะใบนี้ · null = ยังใช้ชุดมาตรฐานในโค้ด
  terms: QuotationTermTree | null;
  recommendation_reason: string;
  // รูปแบบการชำระที่ใบนี้เสนอ — รายงานสำรวจแสดงเฉพาะทางเลือกที่ตรงกัน
  // null = ใบเก่าที่ไม่ได้เลือกและลูกค้าไม่ได้ตอบใน Customer Info → แสดงทุกทางเลือกแบบเดิม
  payment_method: QuotationPaymentMethod | null;
  // % ค่าธรรมเนียมผ่อนบัตรเครดิต 10 เดือน · null = ไม่กรอก พิมพ์เส้นว่างให้เขียนมือ
  // ใช้แสดงในรายงานอย่างเดียว ไม่บวกเข้ายอดใบ (ค่าธรรมเนียมจริงคิดที่ขั้น Order)
  credit_card_fee_percent: number | null;
  loan_enabled: boolean;
  loan_bank: string;
  loan_term_months: number;
  down_payment_percent: number;
  // ดอกเบี้ยแต่ละช่วงปี (ใบก่อน v4 เก็บเป็น interest_rate_year_1_2 / _3_plus — snapshot เก่ายังมีสองช่องนั้น)
  interest_schedule: LoanInterestTier[];
  rate_source: string;
  rate_effective_date: string;
  current_monthly_bill: number;
  electricity_rate: number;
  production_kwh_per_kw_month: number;
  annual_degradation_percent: number;
};

export type FinancialSnapshot = {
  formula_version: string;
  inputs: QuotationDocumentInputs;
  outputs: {
    system_kwp: number;
    monthly_production_kwh: number;
    monthly_saving: number;
    down_payment_amount: number;
    loan_amount: number;
    monthly_installment: number;
    total_loan_payment: number;
    total_interest: number;
    net_monthly_after_saving: number;
    payback_months: number;
    // optional เพราะ snapshot ที่ freeze ก่อนสูตร v3 ไม่มี — ผู้อ่าน fallback ไป payback_months
    // จุดคุ้มทุนแบบสินเชื่อ = (ดาวน์ + ค่างวดรวมทั้งสัญญา) ÷ ประหยัดต่อเดือน
    payback_months_with_loan?: number;
    // ได้เงินดาวน์คืนจากส่วนที่ประหยัดเกินค่างวด · null = ประหยัดไม่เกินค่างวด
    down_recovered_months?: number | null;
    saving_25_years: number;
    co2_reduction_tons_per_year: number;
    equivalent_trees: number;
  };
};

export type QuotationDocumentSnapshot = {
  version: number;
  generated_at: string;
  quotation: Record<string, unknown>;
  lead: Record<string, unknown>;
  lead_data: Record<string, unknown>;
  package: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  settings: Record<string, string>;
  financial: FinancialSnapshot;
  // ข้อความเงื่อนไข/ข้อกำหนดที่ถูกแช่แข็งไว้กับใบ (snapshot v5 ขึ้นไป)
  // optional เพราะ snapshot ที่ freeze ไว้ก่อน v5 ไม่มีคีย์นี้ — ผู้อ่านต้อง
  // fallback ไปคำนวณสดเอง
  legal?: QuotationLegalContent;
};

export async function expandOtherPackageAddOns(
  items: Array<Record<string, unknown>>,
  transaction?: InstanceType<typeof sql.Transaction>,
): Promise<Array<Record<string, unknown>>> {
  const db = transaction ? null : await getDb();
  const expanded: Array<Record<string, unknown>> = [];

  for (const item of items) {
    if (
      item.source_type === "package" ||
      item.source_type === "addon_package" ||
      item.source_type === "addon_package_detail"
    ) {
      expanded.push(item);
      continue;
    }

    const packageId = Number(item.source_package_id) || null;
    const packageName = String(item.item_name_snapshot || item.item_name || "")
      .replace(/^Package เพิ่มเติม:\s*/i, "")
      .trim();
    if (!packageId && !packageName) {
      expanded.push(item);
      continue;
    }

    const packageRequest = transaction ? new sql.Request(transaction) : db!.request();
    const packageResult = await packageRequest
      .input("packageId", sql.Int, packageId)
      .input("packageName", sql.NVarChar(200), packageName)
      .query(`
        SELECT TOP 1 id
        FROM packages
        WHERE is_active=1 AND (is_other=1 OR is_upgrade=1)
          AND ((@packageId IS NOT NULL AND id=@packageId) OR LTRIM(RTRIM(name))=@packageName)
        ORDER BY CASE WHEN id=@packageId THEN 0 ELSE 1 END, id DESC
      `);
    const matchedPackageId = Number(packageResult.recordset[0]?.id);
    if (!matchedPackageId) {
      expanded.push(item);
      continue;
    }

    const itemRequest = transaction ? new sql.Request(transaction) : db!.request();
    const packageItems = (await itemRequest
      .input("packageId", sql.Int, matchedPackageId)
      .query(`
        SELECT id package_item_id, item_name item_name_snapshot, quantity, unit
        FROM package_items
        WHERE package_id=@packageId AND is_active=1
        ORDER BY sort_order,id
      `)).recordset as Array<Record<string, unknown>>;
    if (packageItems.length === 0) {
      expanded.push(item);
      continue;
    }

    const [firstItem, ...detailItems] = packageItems;
    expanded.push({
      ...item,
      ...firstItem,
      source_type: "addon_package",
      source_package_id: matchedPackageId,
    });
    expanded.push(...detailItems.map(detail => ({
      ...detail,
      source_type: "addon_package_detail",
      source_package_id: matchedPackageId,
      unit_price: 0,
      line_total: 0,
    })));
  }

  return expanded;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// อ่านชุดเงื่อนไขของใบแบบหลวม ๆ ตรงนี้ (ยังไม่รู้ package จึงยังไม่รู้ profile ที่แท้จริง)
// การบังคับกติกา locked ของจริงเกิดตอน getQuotationLegalContent() ซึ่ง parse ซ้ำ
// ด้วย profile ที่ derive จาก package — ที่นั่นคือด่านความปลอดภัย ไม่ใช่ที่นี่
function readTermTree(raw: unknown): QuotationTermTree | null {
  if (!raw) return null;
  let value: unknown = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  const declared = (value as Record<string, unknown> | null)?.profile;
  return parseQuotationTermTree(
    value,
    declared === "additional_install" ? "additional_install" : "full_install",
  );
}

export function parseDocumentInputs(raw: unknown, fallback: Partial<QuotationDocumentInputs> = {}): QuotationDocumentInputs {
  let parsed: Partial<QuotationDocumentInputs> = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw as Partial<QuotationDocumentInputs>) || {};
  } catch { /* use fallbacks */ }
  const number = (value: unknown, defaultValue: number) => Number.isFinite(Number(value)) ? Number(value) : defaultValue;
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(parsed ?? {}, key);
  // ไม่มีตัวเลือก "ไม่ระบุ" แล้ว (14 ต.ค.) — ใบที่ยังว่างใช้ fallback ซึ่งผู้สร้างเอกสาร
  // ส่งคำตอบ Customer Info (lead_data.payment_interest) มา · snapshot ที่ freeze แล้วไม่ผ่านตรงนี้
  const paymentMethod = readPaymentMethod(parsed.payment_method) ?? readPaymentMethod(fallback.payment_method);
  const feeRaw = hasOwn("credit_card_fee_percent") ? parsed.credit_card_fee_percent : fallback.credit_card_fee_percent;
  const fee = feeRaw === null || feeRaw === undefined || String(feeRaw).trim() === "" ? Number.NaN : Number(feeRaw);
  const savedSchedule = readInterestSchedule(parsed.interest_schedule) ?? readInterestSchedule(fallback.interest_schedule);
  return {
    om: parseQuotationOmSettings(parsed.om ?? fallback.om),
    // ต้องแยก "ไม่ได้ส่งมา" ออกจาก "ส่ง null มา" — ปุ่มคืนค่าชุดมาตรฐานส่ง null
    // มาโดยตั้งใจ ถ้าใช้ ?? ค่าเดิมใน DB จะถูก fallback กลับมาทับ ปุ่มจะไม่มีผล
    terms: readTermTree(
      Object.prototype.hasOwnProperty.call(parsed ?? {}, "terms")
        ? parsed.terms
        : fallback.terms,
    ),
    recommendation_reason: String(parsed.recommendation_reason ?? fallback.recommendation_reason ?? "").trim(),
    payment_method: paymentMethod,
    credit_card_fee_percent: Number.isFinite(fee) ? Math.min(100, Math.max(0, fee)) : null,
    // ระบุรูปแบบแล้ว สินเชื่อเปิดเฉพาะใบที่เลือกผ่อน · ไม่ระบุ = ค่าเดิม (เปิด)
    loan_enabled: paymentMethod
      ? paymentMethod === "loan"
      : Boolean(parsed.loan_enabled ?? fallback.loan_enabled ?? GSB_SOLAR_LOAN_DEFAULTS.loan_enabled),
    loan_bank: String(parsed.loan_bank ?? fallback.loan_bank ?? GSB_SOLAR_LOAN_DEFAULTS.loan_bank).trim(),
    loan_term_months: Math.max(0, Math.round(number(parsed.loan_term_months ?? fallback.loan_term_months, GSB_SOLAR_LOAN_DEFAULTS.loan_term_months))),
    down_payment_percent: Math.min(100, Math.max(0, number(parsed.down_payment_percent ?? fallback.down_payment_percent, GSB_SOLAR_LOAN_DEFAULTS.down_payment_percent))),
    // ใบร่างเก่าที่มีแต่สองช่องเดิม (3.5/3.5 ค่าตั้งต้นที่ไม่มีใครแก้ได้) ใช้ตารางปัจจุบัน
    // พร้อมที่มา/วันที่มีผลของตารางนั้น — D3 แผน 20261014-02
    interest_schedule: savedSchedule ?? GSB_SOLAR_LOAN_DEFAULTS.interest_schedule.map((tier) => ({ ...tier })),
    rate_source: savedSchedule
      ? String(parsed.rate_source ?? fallback.rate_source ?? GSB_SOLAR_LOAN_DEFAULTS.rate_source).trim()
      : GSB_SOLAR_LOAN_DEFAULTS.rate_source,
    rate_effective_date: savedSchedule
      ? String(parsed.rate_effective_date ?? fallback.rate_effective_date ?? GSB_SOLAR_LOAN_DEFAULTS.rate_effective_date).slice(0, 10)
      : GSB_SOLAR_LOAN_DEFAULTS.rate_effective_date,
    current_monthly_bill: Math.max(0, number(parsed.current_monthly_bill ?? fallback.current_monthly_bill, 0)),
    electricity_rate: Math.max(0, number(parsed.electricity_rate ?? fallback.electricity_rate, 5)),
    production_kwh_per_kw_month: Math.max(0, number(parsed.production_kwh_per_kw_month ?? fallback.production_kwh_per_kw_month, 120)),
    annual_degradation_percent: Math.min(10, Math.max(0, number(parsed.annual_degradation_percent ?? fallback.annual_degradation_percent, 0.5))),
  };
}

function paymentForVariableRates(principal: number, months: number, schedule: LoanInterestTier[]) {
  if (principal <= 0 || months <= 0) return 0;
  const rates = Array.from({ length: months }, (_, index) => rateForYear(schedule, Math.floor(index / 12) + 1) / 1200);
  if (rates.every(rate => rate === 0)) return principal / months;
  const endingBalance = (payment: number) => rates.reduce((balance, rate) => Math.max(0, balance * (1 + rate) - payment), principal);
  let low = 0;
  let high = principal * (1 + Math.max(...rates) * 12) + 1;
  for (let index = 0; index < 80; index++) {
    const middle = (low + high) / 2;
    if (endingBalance(middle) > 0) low = middle; else high = middle;
  }
  return high;
}

export function calculateFinancialSnapshot(inputs: QuotationDocumentInputs, quotation: Record<string, unknown>, pkg: Record<string, unknown>): FinancialSnapshot {
  const systemKwp = Math.max(0, Number(pkg.kwp || 0));
  const monthlyProduction = systemKwp * inputs.production_kwh_per_kw_month;
  const monthlySaving = Math.min(inputs.current_monthly_bill, monthlyProduction * inputs.electricity_rate);
  // Finance and payback are based on the agreed package price after discount,
  // before the booking/survey deposit is deducted. The deposit is a payment
  // credit, not a reduction of the system's actual price.
  const financedBase = Math.max(0, Number(
    quotation.contract_total_incl_vat ?? quotation.subtotal_incl_vat ?? quotation.outstanding_amount ?? 0
  ));
  const downPayment = inputs.loan_enabled ? financedBase * inputs.down_payment_percent / 100 : financedBase;
  const loanAmount = inputs.loan_enabled ? Math.max(0, financedBase - downPayment) : 0;
  const installment = inputs.loan_enabled ? paymentForVariableRates(loanAmount, inputs.loan_term_months, inputs.interest_schedule) : 0;
  const totalLoanPayment = installment * (inputs.loan_enabled ? inputs.loan_term_months : 0);
  const degradation = 1 - inputs.annual_degradation_percent / 100;
  let saving25Years = 0;
  for (let year = 0; year < 25; year++) saving25Years += monthlySaving * 12 * Math.pow(degradation, year);
  const annualProduction = monthlyProduction * 12;
  const paybackMonths = monthlySaving > 0 ? Math.ceil(financedBase / monthlySaving) : 0;
  // ดอกเบี้ยเป็นเงินที่ลูกค้าจ่ายจริง จุดคุ้มทุนของคนกู้จึงนับยอดที่จ่ายทั้งหมด
  const paybackWithLoan = inputs.loan_enabled && monthlySaving > 0
    ? Math.ceil((downPayment + totalLoanPayment) / monthlySaving)
    : paybackMonths;
  const savingAfterInstallment = monthlySaving - installment;
  const downRecoveredMonths = inputs.loan_enabled && downPayment > 0 && savingAfterInstallment > 0
    ? Math.ceil(downPayment / savingAfterInstallment)
    : null;
  return {
    formula_version: QUOTATION_FINANCE_FORMULA_VERSION,
    inputs,
    outputs: {
      system_kwp: round2(systemKwp),
      monthly_production_kwh: round2(monthlyProduction),
      monthly_saving: round2(monthlySaving),
      down_payment_amount: round2(downPayment),
      loan_amount: round2(loanAmount),
      monthly_installment: round2(installment),
      total_loan_payment: round2(totalLoanPayment),
      total_interest: round2(Math.max(0, totalLoanPayment - loanAmount)),
      net_monthly_after_saving: round2(installment - monthlySaving),
      payback_months: paybackMonths,
      payback_months_with_loan: paybackWithLoan,
      down_recovered_months: downRecoveredMonths,
      saving_25_years: round2(saving25Years),
      co2_reduction_tons_per_year: round2(annualProduction * 0.0005),
      equivalent_trees: Math.round(annualProduction * 0.0005 * 100),
    },
  };
}

export function validateQuotationDocument(snapshot: QuotationDocumentSnapshot): string[] {
  const errors: string[] = [];
  const q = snapshot.quotation;
  const lead = snapshot.lead;
  const finance = snapshot.financial;
  if (!String(lead.full_name || "").trim()) errors.push("ไม่พบชื่อลูกค้า");
  if (!String(lead.installation_address || lead.id_card_address || "").trim()) errors.push("ไม่พบสถานที่ติดตั้ง");
  if (!lead.survey_date && !lead.survey_actual_date) errors.push("ไม่พบวันที่สำรวจหน้างาน");
  if (!String(lead.survey_actual_by || lead.survey_completed_by_name || lead.assigned_name || "").trim()) errors.push("ไม่พบผู้สำรวจหน้างาน");
  if (!String(q.doc_no || "").trim()) errors.push("ไม่พบเลขใบเสนอราคา");
  // Package หลักเป็นตัวเลือก (ซื้อเฉพาะรายการเพิ่มเติมได้) — ขอแค่มียอดจริง
  if (Number(q.outstanding_amount) < 0 || Number(q.subtotal_incl_vat) <= 0) errors.push("ยอดใบเสนอราคาไม่สมบูรณ์");
  if (finance.inputs.current_monthly_bill <= 0) errors.push("กรุณาระบุค่าไฟปัจจุบันจากข้อมูลจริง");
  if (finance.inputs.electricity_rate <= 0) errors.push("กรุณาระบุค่าไฟต่อหน่วย");
  if (finance.inputs.production_kwh_per_kw_month <= 0) errors.push("กรุณาระบุสมมติฐานผลผลิตไฟต่อ kWp");
  // The attached survey report's §3 (Load Assumption) is built from these
  // answers — every appliance question must have been asked before the
  // customer sees it. "ไม่ทราบ" counts as asked (plan 20260928-01, D4).
  const loadMissing = missingLoadAnswers(snapshot.lead_data || {});
  if (loadMissing.length) errors.push(`กรุณากรอกการใช้เครื่องใช้ไฟฟ้าในแบบสอบถามลูกค้า (เลือก "ไม่ทราบ" ได้): ${loadMissing.join(", ")}`);
  // ตารางรายการยาวเกินหน้าไม่ใช่ข้อผิดพลาดอีกต่อไป — ตัวเรนเดอร์ขึ้นตารางหน้าใหม่
  // ให้เอง พร้อมแถวยอดยกไป/ยอดยกมา (ดู paginateQuotationRows)
  if (finance.inputs.loan_enabled) {
    if (!finance.inputs.loan_bank) errors.push("กรุณาระบุธนาคาร/ผลิตภัณฑ์สินเชื่อ");
    if (finance.inputs.loan_term_months < 12) errors.push("กรุณาระบุระยะเวลาสินเชื่ออย่างน้อย 12 เดือน");
    if (!finance.inputs.rate_source) errors.push("กรุณาระบุแหล่งข้อมูลอัตราดอกเบี้ย");
    if (!finance.inputs.rate_effective_date) errors.push("กรุณาระบุวันที่มีผลของอัตราดอกเบี้ย");
  }
  return errors;
}

export async function buildQuotationDocumentSnapshot(quotationId: number, transaction?: InstanceType<typeof sql.Transaction>): Promise<QuotationDocumentSnapshot | null> {
  const db = transaction ? null : await getDb();
  const request = transaction ? new sql.Request(transaction) : db!.request();
  const result = await request.input("id", sql.Int, quotationId).query(`
    SELECT l.*, q.*,
      l.full_name customer_name, l.phone customer_phone, l.email customer_email,
      COALESCE(NULLIF(l.project_alias,N''),NULLIF(l.project_name,N''),pr.name) project_display_name,
      owner.full_name assigned_name, surveyor.full_name survey_completed_by_name,
      creator.full_name created_by_name, creator.job_title created_by_title,
      p.name package_current_name, p.kwp, p.phase, p.is_upgrade, p.is_other, p.has_panel,
      p.has_inverter, p.has_battery, p.battery_kwh, p.battery_brand,
      p.battery_model, p.inverter_kw, p.inverter_brand, p.inverter_model,
      p.installed_kwp, p.panel_count, p.panel_watt, p.panel_brand, p.warranty_years,
      p.term_set_profile
    FROM quotations q
    JOIN leads l ON l.id=q.lead_id
    LEFT JOIN packages p ON p.id=q.package_id
    LEFT JOIN projects pr ON pr.id=l.project_id
    LEFT JOIN users owner ON owner.id=l.assigned_user_id
    LEFT JOIN users surveyor ON surveyor.id=l.survey_completed_by
    LEFT JOIN users creator ON creator.id=q.created_by
    WHERE q.id=@id;
    SELECT TOP 1 * FROM lead_data WHERE lead_id=(SELECT lead_id FROM quotations WHERE id=@id);
    SELECT source_type,package_item_id,item_name_snapshot,quantity,unit,unit_price,line_total,sort_order
      FROM quotation_items WHERE quotation_id=@id ORDER BY sort_order,id;
    SELECT [key],value FROM app_settings WHERE [key] IN ('bank_account_bank','bank_account_branch','bank_account_number','bank_account_name');
  `);
  const sets = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const row = sets[0]?.[0];
  if (!row) return null;
  const quotationKeys = new Set(["id","lead_id","option_no","doc_no","revision_no","status","package_id","package_name_snapshot","package_price_snapshot","issue_date","valid_days","subtotal_incl_vat","discount_label","discount_type","discount_value","discount_amount","discount_reason","contract_total_incl_vat","deposit_paid_amount","outstanding_amount","vat_rate","amount_before_vat","vat_amount","payment_terms_json","terms_text","note","created_by","created_by_name","created_by_title","submitted_at","approved_at","approver_name_snapshot","approver_title_snapshot","project_display_name"]);
  const packageKeys = new Set(["package_id","package_current_name","kwp","installed_kwp","phase","is_upgrade","is_other","has_panel","has_inverter","has_battery","battery_kwh","battery_brand","battery_model","solar_panels","panel_count","panel_watt","panel_brand","inverter_kw","inverter_brand","inverter_model","warranty_years","term_set_profile"]);
  const quotation: Record<string, unknown> = {};
  const pkg: Record<string, unknown> = {};
  const lead: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.includes("signature_data") || key === "document_snapshot_json" || key === "financial_snapshot_json") continue;
    if (quotationKeys.has(key)) quotation[key] = value;
    else if (packageKeys.has(key)) pkg[key === "package_current_name" ? "name" : key] = value;
    else if (!key.startsWith("approval_") && !key.startsWith("approver_") && !key.startsWith("sent_to_customer_")) lead[key] = value;
  }
  const defaults: Partial<QuotationDocumentInputs> = {
    // ลำดับเดียวกับ QuotationBuilder: คำตอบในแบบสอบถาม (lead_data.monthly_bill) ก่อน
    // ถ้าลูกค้าไม่ได้ตอบค่อยใช้ค่าจากฟอร์มสำรวจ · row มาจาก leads.* ซึ่งไม่มีคอลัมน์
    // ค่าไฟของแบบสอบถาม ต้องอ่านจากชุด lead_data แยก (sets[1])
    current_monthly_bill: Number(
      sets[1]?.[0]?.monthly_bill || row.survey_monthly_bill || sets[1]?.[0]?.monthly_bill_max || 0,
    ),
    loan_bank: String(row.finance_loan_bank || row.finance_bank || ""),
    loan_term_months: Number(row.finance_months || 84),
    // ใบที่ยังไม่ได้เลือกรูปแบบการชำระ ใช้คำตอบใน Customer Info
    payment_method: readPaymentMethod(sets[1]?.[0]?.payment_interest),
  };
  const inputs = parseDocumentInputs(row.document_inputs_json, defaults);
  const financial = calculateFinancialSnapshot(inputs, quotation, pkg);
  return {
    version: QUOTATION_DOCUMENT_VERSION,
    generated_at: new Date().toISOString(),
    quotation,
    lead,
    lead_data: sets[1]?.[0] || {},
    package: pkg,
    items: await expandOtherPackageAddOns(sets[2] || [], transaction),
    settings: Object.fromEntries((sets[3] || []).map(setting => [String(setting.key), String(setting.value || "")])),
    financial,
    // อาร์กิวเมนต์ชุดเดียวกับที่ quotation-pdf route เคยเรียกสดตอนเรนเดอร์ —
    // ย้ายมาคำนวณตรงนี้เพื่อให้ถ้อยคำถูกแช่แข็งไปพร้อมกับ snapshot ตอนส่งอนุมัติ
    legal: getQuotationLegalContent(
      pkg,
      quotation.valid_days,
      String(quotation.terms_text || ""),
      inputs.om,
      inputs.terms,
    ),
  };
}
