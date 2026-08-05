import "server-only";
import { getDb, sql } from "@/lib/db";
import { GSB_SOLAR_LOAN_DEFAULTS } from "@/lib/loan-defaults";

export const QUOTATION_DOCUMENT_VERSION = 3;
export const QUOTATION_FINANCE_FORMULA_VERSION = "contract-price-before-deposit-v2";

export type QuotationDocumentInputs = {
  recommendation_reason: string;
  loan_enabled: boolean;
  loan_bank: string;
  loan_term_months: number;
  down_payment_percent: number;
  interest_rate_year_1_2: number;
  interest_rate_year_3_plus: number;
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
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function parseDocumentInputs(raw: unknown, fallback: Partial<QuotationDocumentInputs> = {}): QuotationDocumentInputs {
  let parsed: Partial<QuotationDocumentInputs> = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw as Partial<QuotationDocumentInputs>) || {};
  } catch { /* use fallbacks */ }
  const number = (value: unknown, defaultValue: number) => Number.isFinite(Number(value)) ? Number(value) : defaultValue;
  return {
    recommendation_reason: String(parsed.recommendation_reason ?? fallback.recommendation_reason ?? "").trim(),
    loan_enabled: Boolean(parsed.loan_enabled ?? fallback.loan_enabled ?? GSB_SOLAR_LOAN_DEFAULTS.loan_enabled),
    loan_bank: String(parsed.loan_bank ?? fallback.loan_bank ?? GSB_SOLAR_LOAN_DEFAULTS.loan_bank).trim(),
    loan_term_months: Math.max(0, Math.round(number(parsed.loan_term_months ?? fallback.loan_term_months, GSB_SOLAR_LOAN_DEFAULTS.loan_term_months))),
    down_payment_percent: Math.min(100, Math.max(0, number(parsed.down_payment_percent ?? fallback.down_payment_percent, GSB_SOLAR_LOAN_DEFAULTS.down_payment_percent))),
    interest_rate_year_1_2: Math.max(0, number(parsed.interest_rate_year_1_2 ?? fallback.interest_rate_year_1_2, GSB_SOLAR_LOAN_DEFAULTS.interest_rate_year_1_2)),
    interest_rate_year_3_plus: Math.max(0, number(parsed.interest_rate_year_3_plus ?? fallback.interest_rate_year_3_plus, GSB_SOLAR_LOAN_DEFAULTS.interest_rate_year_3_plus)),
    rate_source: String(parsed.rate_source ?? fallback.rate_source ?? GSB_SOLAR_LOAN_DEFAULTS.rate_source).trim(),
    rate_effective_date: String(parsed.rate_effective_date ?? fallback.rate_effective_date ?? GSB_SOLAR_LOAN_DEFAULTS.rate_effective_date).slice(0, 10),
    current_monthly_bill: Math.max(0, number(parsed.current_monthly_bill ?? fallback.current_monthly_bill, 0)),
    electricity_rate: Math.max(0, number(parsed.electricity_rate ?? fallback.electricity_rate, 5)),
    production_kwh_per_kw_month: Math.max(0, number(parsed.production_kwh_per_kw_month ?? fallback.production_kwh_per_kw_month, 120)),
    annual_degradation_percent: Math.min(10, Math.max(0, number(parsed.annual_degradation_percent ?? fallback.annual_degradation_percent, 0.5))),
  };
}

function paymentForVariableRates(principal: number, months: number, firstRate: number, laterRate: number) {
  if (principal <= 0 || months <= 0) return 0;
  const rates = Array.from({ length: months }, (_, index) => (index < 24 ? firstRate : laterRate) / 1200);
  if (rates.every(rate => rate === 0)) return principal / months;
  const endingBalance = (payment: number) => rates.reduce((balance, rate) => Math.max(0, balance * (1 + rate) - payment), principal);
  let low = 0;
  let high = principal * (1 + Math.max(firstRate, laterRate) / 100) + 1;
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
  const installment = inputs.loan_enabled ? paymentForVariableRates(loanAmount, inputs.loan_term_months, inputs.interest_rate_year_1_2, inputs.interest_rate_year_3_plus) : 0;
  const totalLoanPayment = installment * (inputs.loan_enabled ? inputs.loan_term_months : 0);
  const degradation = 1 - inputs.annual_degradation_percent / 100;
  let saving25Years = 0;
  for (let year = 0; year < 25; year++) saving25Years += monthlySaving * 12 * Math.pow(degradation, year);
  const annualProduction = monthlyProduction * 12;
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
      payback_months: monthlySaving > 0 ? Math.ceil(financedBase / monthlySaving) : 0,
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
      p.installed_kwp, p.panel_count, p.panel_watt, p.panel_brand, p.warranty_years
    FROM quotations q
    JOIN leads l ON l.id=q.lead_id
    LEFT JOIN packages p ON p.id=q.package_id
    LEFT JOIN projects pr ON pr.id=l.project_id
    LEFT JOIN users owner ON owner.id=l.assigned_user_id
    LEFT JOIN users surveyor ON surveyor.id=l.survey_completed_by
    LEFT JOIN users creator ON creator.id=q.created_by
    WHERE q.id=@id;
    SELECT TOP 1 * FROM lead_data WHERE lead_id=(SELECT lead_id FROM quotations WHERE id=@id);
    SELECT source_type,item_name_snapshot,quantity,unit,unit_price,line_total,sort_order
      FROM quotation_items WHERE quotation_id=@id ORDER BY sort_order,id;
    SELECT [key],value FROM app_settings WHERE [key] IN ('bank_account_bank','bank_account_branch','bank_account_number','bank_account_name');
  `);
  const sets = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const row = sets[0]?.[0];
  if (!row) return null;
  const quotationKeys = new Set(["id","lead_id","option_no","doc_no","revision_no","status","package_id","package_name_snapshot","package_price_snapshot","issue_date","valid_days","subtotal_incl_vat","discount_label","discount_type","discount_value","discount_amount","discount_reason","contract_total_incl_vat","deposit_paid_amount","outstanding_amount","vat_rate","amount_before_vat","vat_amount","payment_terms_json","terms_text","note","created_by","created_by_name","created_by_title","submitted_at","approved_at","approver_name_snapshot","approver_title_snapshot","project_display_name"]);
  const packageKeys = new Set(["package_id","package_current_name","kwp","installed_kwp","phase","is_upgrade","is_other","has_panel","has_inverter","has_battery","battery_kwh","battery_brand","battery_model","solar_panels","panel_count","panel_watt","panel_brand","inverter_kw","inverter_brand","inverter_model","warranty_years"]);
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
    current_monthly_bill: Number(row.survey_monthly_bill || row.pre_monthly_bill || row.monthly_bill_max || 0),
    loan_bank: String(row.finance_loan_bank || row.finance_bank || ""),
    loan_term_months: Number(row.finance_months || 84),
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
    items: sets[2] || [],
    settings: Object.fromEntries((sets[3] || []).map(setting => [String(setting.key), String(setting.value || "")])),
    financial,
  };
}
