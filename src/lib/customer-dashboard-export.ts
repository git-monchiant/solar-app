import * as XLSX from "xlsx-js-style";
import { getDb, sql, toSqlDate } from "@/lib/db";
import { STATUS_CONFIG } from "@/lib/constants/statuses";
import { getSourceStyle, normalizeSourceKey } from "@/lib/source-tag";
import {
  ABLE_OR_NOT, AC_TIERS, BILL_RISE_ACTIONS, BUSINESS_TYPES,
  DAYTIME_OCCUPANTS, DECISION_FACTORS, DECISION_TIMELINES,
  ELECTRICAL_PHASES, EVER_NEVER, EV_CHARGE_PERIODS, EV_READY_OPTIONS,
  HOUSE_AGES, METER_SIZES, OUTAGE_PRIORITIES, PEAK_USAGE,
  QUESTIONNAIRE_SECTIONS, RESIDENCE_TYPES, ROOF_SHAPES,
  USAGE_TREND_OPTIONS, WORK_DAYS_PER_WEEK, YES_NO, YES_NO_BIN,
  YES_NO_CONSIDERING, YES_NO_MAYBE, optionLabel,
} from "@/lib/customer-questionnaire";
import type { CustomerDashboardFilters } from "@/lib/customer-dashboard-types";

type Option = { value: string; label: string };

export type CustomerExportRow = {
  id: number;
  full_name: string;
  installation_address: string | null;
  house_number: string | null;
  meter_number: string | null;
  project_id: number | null;
  project_name: string | null;
  project_district: string | null;
  project_province: string | null;
  zone: string | null;
  status: string;
  source: string | null;
  customer_type: string | null;
  customer_group: string | null;
  customer_grade: string | null;
  assigned_name: string | null;
  created_at: Date;
  lead_updated_at: Date | null;
  questionnaire_updated_at: Date | null;
  residence_type: string | null;
  house_age: string | null;
  roof_shape: string | null;
  occupant_total: number | null;
  occupant_elderly: number | null;
  occupant_kids: number | null;
  occupant_pets: number | null;
  monthly_bill: number | null;
  monthly_bill_max: number | null;
  electrical_phase: string | null;
  meter_size: string | null;
  peak_usage: string | null;
  home_at_daytime: string | null;
  daytime_occupants: string | null;
  work_at_home: string | null;
  business_type: string | null;
  work_days_per_week: string | null;
  ac_split: string | null;
  appliances: string | null;
  ev_charge_period: string | null;
  future_ev: string | null;
  future_ev_charger: string | null;
  future_extend_home: string | null;
  future_more_members: string | null;
  future_smart_home: string | null;
  future_battery: string | null;
  outage_priorities: string | null;
  bill_rise_action: string | null;
  had_roof_leak: string | null;
  did_roof_repair: string | null;
  had_electrical_issue: string | null;
  did_panel_replacement: string | null;
  self_generates: string | null;
  ev_ready: string | null;
  blackout_resilient: string | null;
  future_usage_trend: string | null;
  decision_factors: string | null;
  decision_timeline: string | null;
  [key: string]: unknown;
};

type ExportColumn = {
  group: string;
  key: string;
  label: string;
  dataType: string;
  options?: string;
  width?: number;
  value: (row: CustomerExportRow) => string | number | Date | null;
};

const CUSTOMER_GROUP_LABELS: Record<string, string> = {
  general: "ลูกค้าทั่วไป", sena: "ลูกค้าเสนา", sme: "SME",
};
const APPLIANCE_OPTIONS: Option[] = [{ value: "ev", label: "มีที่ชาร์จรถ EV" }];

function isAnswered(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
}

function csvValues(value: string | null | undefined): string[] {
  return value ? value.split(",").map(item => item.trim()).filter(Boolean) : [];
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function optionText(options: readonly Option[], value: string | null | undefined): string {
  return value ? safeText(optionLabel(options, value)) : "";
}

function multiText(options: readonly Option[], value: string | null | undefined): string {
  return csvValues(value).map(item => optionText(options, item) || safeText(item)).join("; ");
}

function optionList(options: readonly Option[]): string {
  return options.map(option => `${option.value} = ${option.label}`).join("; ");
}

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function acPeriodText(raw: string | null | undefined, period: "day" | "night"): string {
  const parsed = parseJson(raw);
  const values = parsed[period] && typeof parsed[period] === "object" ? parsed[period] as Record<string, unknown> : {};
  return AC_TIERS.map(tier => ({ label: tier.label, count: Number(values[tier.key]) || 0 }))
    .filter(item => item.count > 0)
    .map(item => `${item.label} ${item.count} เครื่อง`)
    .join("; ");
}

function factorScore(row: CustomerExportRow, key: string): number | null {
  const value = Number(parseJson(row.decision_factors)[key]);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function otherFactor(row: CustomerExportRow): { text: string; score: number | null } {
  const other = parseJson(row.decision_factors).other;
  if (!other || typeof other !== "object") return { text: "", score: null };
  const obj = other as Record<string, unknown>;
  const score = Number(obj.score);
  return {
    text: safeText(obj.text),
    score: Number.isInteger(score) && score >= 1 && score <= 5 ? score : null,
  };
}

function answeredSectionCount(row: CustomerExportRow): number {
  return QUESTIONNAIRE_SECTIONS.filter(section => section.fields.some(field => isAnswered(row[field]))).length;
}

function responseStatus(row: CustomerExportRow): string {
  const count = answeredSectionCount(row);
  return count === 0 ? "ยังไม่ตอบ" : count === QUESTIONNAIRE_SECTIONS.length ? "ตอบครบ 8 หัวข้อ" : "ตอบบางส่วน";
}

function column(
  group: string,
  key: string,
  label: string,
  dataType: string,
  value: ExportColumn["value"],
  options?: string,
  width?: number,
): ExportColumn {
  return { group, key, label, dataType, value, options, width };
}

const LEAD_COLUMNS: ExportColumn[] = [
  column("ข้อมูล Lead", "id", "Lead ID", "number", row => row.id, undefined, 10),
  column("ข้อมูล Lead", "full_name", "ชื่อ-นามสกุล", "text", row => safeText(row.full_name), undefined, 24),
  column("ข้อมูล Lead", "installation_address", "ที่อยู่ติดตั้ง", "text", row => safeText(row.installation_address), undefined, 38),
  column("ข้อมูล Lead", "house_number", "บ้านเลขที่", "text", row => safeText(row.house_number), undefined, 14),
  column("ข้อมูล Lead", "meter_number", "เลขมิเตอร์", "text", row => safeText(row.meter_number), undefined, 18),
  column("ข้อมูล Lead", "project_name", "โครงการ", "text", row => safeText(row.project_name), undefined, 26),
  column("ข้อมูล Lead", "project_district", "เขต/อำเภอโครงการ", "text", row => safeText(row.project_district), undefined, 18),
  column("ข้อมูล Lead", "project_province", "จังหวัดโครงการ", "text", row => safeText(row.project_province), undefined, 18),
  column("ข้อมูล Lead", "zone", "พื้นที่/โซน", "text", row => safeText(row.zone), undefined, 16),
  column("ข้อมูล Lead", "source", "Lead Source", "text", row => getSourceStyle(row.source).label, undefined, 24),
  column("ข้อมูล Lead", "status", "สถานะ Lead", "text", row => STATUS_CONFIG[row.status]?.label || safeText(row.status), undefined, 20),
  column("ข้อมูล Lead", "customer_type", "ประเภทลูกค้า", "text", row => safeText(row.customer_type), undefined, 16),
  column("ข้อมูล Lead", "customer_group", "กลุ่มลูกค้า", "text", row => row.customer_group ? CUSTOMER_GROUP_LABELS[row.customer_group] || safeText(row.customer_group) : "", optionList(Object.entries(CUSTOMER_GROUP_LABELS).map(([value, label]) => ({ value, label }))), 16),
  column("ข้อมูล Lead", "customer_grade", "Sales Grade", "text", row => safeText(row.customer_grade), "A-F", 12),
  column("ข้อมูล Lead", "assigned_name", "ผู้รับผิดชอบ", "text", row => safeText(row.assigned_name), undefined, 22),
  column("ข้อมูล Lead", "created_at", "วันที่สร้าง Lead", "datetime", row => row.created_at, undefined, 20),
  column("ข้อมูล Lead", "lead_updated_at", "วันที่อัปเดต Lead", "datetime", row => row.lead_updated_at, undefined, 20),
  column("ข้อมูล Lead", "questionnaire_updated_at", "วันที่อัปเดตแบบสอบถาม", "datetime", row => row.questionnaire_updated_at, undefined, 22),
];

const QUESTIONNAIRE_COLUMNS: ExportColumn[] = [
  column("1. Customer Profile", "residence_type", "ประเภทที่อยู่อาศัย", "choice", row => optionText(RESIDENCE_TYPES, row.residence_type), optionList(RESIDENCE_TYPES), 22),
  column("1. Customer Profile", "house_age", "อายุบ้าน", "choice", row => optionText(HOUSE_AGES, row.house_age), optionList(HOUSE_AGES), 18),
  column("1. Customer Profile", "roof_shape", "ประเภทหลังคา", "choice", row => optionText(ROOF_SHAPES, row.roof_shape), optionList(ROOF_SHAPES), 28),
  column("1. Customer Profile", "occupant_total", "จำนวนผู้อยู่อาศัย", "number", row => row.occupant_total, undefined, 16),
  column("1. Customer Profile", "occupant_elderly", "จำนวนผู้สูงอายุ", "number", row => row.occupant_elderly, undefined, 16),
  column("1. Customer Profile", "occupant_kids", "จำนวนเด็ก", "number", row => row.occupant_kids, undefined, 14),
  column("1. Customer Profile", "occupant_pets", "จำนวนสัตว์เลี้ยง", "number", row => row.occupant_pets, undefined, 16),

  column("2. Energy Profile", "monthly_bill", "ค่าไฟเฉลี่ยต่อเดือน", "currency", row => row.monthly_bill, undefined, 18),
  column("2. Energy Profile", "monthly_bill_max", "ค่าไฟสูงสุดต่อเดือน", "currency", row => row.monthly_bill_max, undefined, 18),
  column("2. Energy Profile", "electrical_phase", "ระบบไฟปัจจุบัน", "choice", row => optionText(ELECTRICAL_PHASES, row.electrical_phase), optionList(ELECTRICAL_PHASES), 18),
  column("2. Energy Profile", "meter_size", "ขนาดมิเตอร์", "choice", row => optionText(METER_SIZES, row.meter_size), optionList(METER_SIZES), 18),
  column("2. Energy Profile", "peak_usage", "ช่วงเวลาที่ใช้ไฟสูงสุด", "choice", row => optionText(PEAK_USAGE, row.peak_usage), optionList(PEAK_USAGE), 22),

  column("3. Lifestyle Assessment", "home_at_daytime", "อยู่บ้านช่วงกลางวัน", "choice", row => optionText(YES_NO, row.home_at_daytime), optionList(YES_NO), 20),
  column("3. Lifestyle Assessment", "daytime_occupants", "ผู้อยู่บ้านช่วงกลางวัน", "multi-choice", row => multiText(DAYTIME_OCCUPANTS, row.daytime_occupants), optionList(DAYTIME_OCCUPANTS), 30),
  column("3. Lifestyle Assessment", "work_at_home", "ทำงาน/ทำธุรกิจที่บ้าน", "choice", row => optionText(YES_NO, row.work_at_home), optionList(YES_NO), 22),
  column("3. Lifestyle Assessment", "business_type", "ประเภทธุรกิจที่บ้าน", "choice", row => optionText(BUSINESS_TYPES, row.business_type), optionList(BUSINESS_TYPES), 28),
  column("3. Lifestyle Assessment", "work_days_per_week", "จำนวนวันทำงานที่บ้าน", "choice", row => optionText(WORK_DAYS_PER_WEEK, row.work_days_per_week), optionList(WORK_DAYS_PER_WEEK), 22),
  column("3. Lifestyle Assessment", "ac_split_day", "แอร์ช่วงกลางวัน", "structured text", row => acPeriodText(row.ac_split, "day"), "จำนวนเครื่อง แยกตาม BTU", 34),
  column("3. Lifestyle Assessment", "ac_split_night", "แอร์ช่วงกลางคืน", "structured text", row => acPeriodText(row.ac_split, "night"), "จำนวนเครื่อง แยกตาม BTU", 34),
  column("3. Lifestyle Assessment", "appliances", "อุปกรณ์/ที่ชาร์จ EV", "multi-choice", row => multiText(APPLIANCE_OPTIONS, row.appliances), optionList(APPLIANCE_OPTIONS), 22),
  column("3. Lifestyle Assessment", "ev_charge_period", "ช่วงเวลาชาร์จ EV", "choice", row => optionText(EV_CHARGE_PERIODS, row.ev_charge_period), optionList(EV_CHARGE_PERIODS), 20),

  column("4. Future Home Assessment", "future_ev", "แผนซื้อรถยนต์ EV", "choice", row => optionText(YES_NO_CONSIDERING, row.future_ev), optionList(YES_NO_CONSIDERING), 22),
  column("4. Future Home Assessment", "future_ev_charger", "แผนติดตั้ง EV Charger", "choice", row => optionText(YES_NO_BIN, row.future_ev_charger), optionList(YES_NO_BIN), 22),
  column("4. Future Home Assessment", "future_extend_home", "แผนต่อเติมบ้าน", "choice", row => optionText(YES_NO_BIN, row.future_extend_home), optionList(YES_NO_BIN), 20),
  column("4. Future Home Assessment", "future_more_members", "แผนเพิ่มสมาชิกในบ้าน", "choice", row => optionText(YES_NO_BIN, row.future_more_members), optionList(YES_NO_BIN), 22),
  column("4. Future Home Assessment", "future_smart_home", "แผนติดตั้ง Smart Home", "choice", row => optionText(YES_NO_BIN, row.future_smart_home), optionList(YES_NO_BIN), 22),
  column("4. Future Home Assessment", "future_battery", "แผนติดตั้ง Battery", "choice", row => optionText(YES_NO_MAYBE, row.future_battery), optionList(YES_NO_MAYBE), 22),

  column("5. Energy Security Assessment", "outage_priorities", "อุปกรณ์สำคัญเมื่อไฟดับ", "multi-choice", row => multiText(OUTAGE_PRIORITIES, row.outage_priorities), optionList(OUTAGE_PRIORITIES), 38),
  column("5. Energy Security Assessment", "bill_rise_action", "การรับมือเมื่อค่าไฟเพิ่ม 30%", "choice", row => optionText(BILL_RISE_ACTIONS, row.bill_rise_action), optionList(BILL_RISE_ACTIONS), 34),

  column("6. Home Health Check", "had_roof_leak", "เคยมีหลังคารั่ว", "choice", row => optionText(EVER_NEVER, row.had_roof_leak), optionList(EVER_NEVER), 20),
  column("6. Home Health Check", "did_roof_repair", "เคยซ่อมหลังคา", "choice", row => optionText(EVER_NEVER, row.did_roof_repair), optionList(EVER_NEVER), 20),
  column("6. Home Health Check", "had_electrical_issue", "เคยมีปัญหาระบบไฟ", "choice", row => optionText(EVER_NEVER, row.had_electrical_issue), optionList(EVER_NEVER), 22),
  column("6. Home Health Check", "did_panel_replacement", "เคยเปลี่ยนตู้ควบคุมไฟ", "choice", row => optionText(EVER_NEVER, row.did_panel_replacement), optionList(EVER_NEVER), 24),

  column("7. Beyond Question", "self_generates", "บ้านผลิตไฟใช้เองได้", "choice", row => optionText(ABLE_OR_NOT, row.self_generates), optionList(ABLE_OR_NOT), 22),
  column("7. Beyond Question", "ev_ready", "ความพร้อมรองรับ EV", "choice", row => optionText(EV_READY_OPTIONS, row.ev_ready), optionList(EV_READY_OPTIONS), 22),
  column("7. Beyond Question", "blackout_resilient", "ใช้ชีวิตได้ตามปกติเมื่อไฟดับ", "choice", row => optionText(ABLE_OR_NOT, row.blackout_resilient), optionList(ABLE_OR_NOT), 26),
  column("7. Beyond Question", "future_usage_trend", "แนวโน้มใช้ไฟใน 10 ปี", "choice", row => optionText(USAGE_TREND_OPTIONS, row.future_usage_trend), optionList(USAGE_TREND_OPTIONS), 22),

  column("8. Decision Making Factor", "decision_timeline", "ระยะเวลาตัดสินใจ", "choice", row => optionText(DECISION_TIMELINES, row.decision_timeline), optionList(DECISION_TIMELINES), 22),
  ...DECISION_FACTORS.map(factor => column("8. Decision Making Factor", `decision_${factor.key}`, factor.label, "score 1-5", row => factorScore(row, factor.key), "1 = สำคัญน้อยที่สุด; 5 = สำคัญมากที่สุด", 38)),
  column("8. Decision Making Factor", "decision_other_text", "ปัจจัยอื่นๆ", "text", row => otherFactor(row).text, undefined, 32),
  column("8. Decision Making Factor", "decision_other_score", "คะแนนปัจจัยอื่นๆ", "score 1-5", row => otherFactor(row).score, "1-5", 18),
];

const RESPONSE_COLUMNS: ExportColumn[] = [
  column("สถานะคำตอบ", "response_status", "สถานะการตอบแบบสอบถาม", "text", row => responseStatus(row), "ยังไม่ตอบ; ตอบบางส่วน; ตอบครบ 8 หัวข้อ", 24),
  column("สถานะคำตอบ", "answered_sections", "จำนวนหัวข้อที่ตอบ", "number", row => answeredSectionCount(row), "0-8", 18),
  column("สถานะคำตอบ", "coverage_pct", "Coverage", "percentage", row => answeredSectionCount(row) / QUESTIONNAIRE_SECTIONS.length, "0-100%", 14),
];

export const CUSTOMER_EXPORT_COLUMNS = [...LEAD_COLUMNS, ...QUESTIONNAIRE_COLUMNS, ...RESPONSE_COLUMNS];

export async function getCustomerExportRows(filters: CustomerDashboardFilters): Promise<CustomerExportRow[]> {
  const db = await getDb();
  const request = db.request();
  const clauses: string[] = [];
  const from = toSqlDate(filters.from);
  const to = toSqlDate(filters.to);
  if (from) { request.input("from", sql.Date, from); clauses.push("CAST(l.created_at AS DATE) >= @from"); }
  if (to) { request.input("to", sql.Date, to); clauses.push("CAST(l.created_at AS DATE) <= @to"); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await request.query(`
    SELECT l.id, l.full_name, l.installation_address,
      l.house_number, l.meter_number,
      l.project_id, COALESCE(NULLIF(l.project_alias, N''), NULLIF(l.project_name, N''), p.name) AS project_name,
      p.district AS project_district, p.province AS project_province,
      l.zone, l.status, l.source, l.customer_type, l.customer_group,
      l.customer_grade, u.full_name AS assigned_name, l.created_at,
      l.updated_at AS lead_updated_at, d.updated_at AS questionnaire_updated_at,
      d.residence_type, d.house_age, d.roof_shape,
      d.occupant_total, d.occupant_elderly, d.occupant_kids, d.occupant_pets,
      d.monthly_bill, d.monthly_bill_max, d.electrical_phase, d.meter_size, d.peak_usage,
      d.home_at_daytime, d.daytime_occupants, d.work_at_home, d.business_type,
      d.work_days_per_week, d.ac_split, d.appliances, d.ev_charge_period,
      d.future_ev, d.future_ev_charger, d.future_extend_home, d.future_more_members,
      d.future_smart_home, d.future_battery, d.outage_priorities, d.bill_rise_action,
      d.had_roof_leak, d.did_roof_repair, d.had_electrical_issue, d.did_panel_replacement,
      d.self_generates, d.ev_ready, d.blackout_resilient, d.future_usage_trend,
      d.decision_factors, d.decision_timeline
    FROM leads l
    LEFT JOIN projects p ON p.id = l.project_id
    LEFT JOIN users u ON u.id = l.assigned_user_id
    LEFT JOIN lead_data d ON d.lead_id = l.id
    ${where}
    ORDER BY l.created_at DESC, l.id DESC
  `);
  return (result.recordset as CustomerExportRow[]).filter(row => {
    if (filters.projectId && row.project_id !== filters.projectId) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.source && normalizeSourceKey(row.source) !== filters.source) return false;
    return true;
  });
}

const GROUP_COLORS = ["00A67A", "F59E0B", "0EA5E9", "8B5CF6", "10B981", "EAB308", "F43F5E", "14B8A6", "6366F1", "64748B"];

function styleMainSheet(ws: XLSX.WorkSheet, columns: ExportColumn[], rowCount: number) {
  const thin = { style: "thin", color: { rgb: "D8DEE8" } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const groupNames = [...new Set(columns.map(item => item.group))];
  for (let c = 0; c < columns.length; c++) {
    const color = GROUP_COLORS[groupNames.indexOf(columns[c].group) % GROUP_COLORS.length];
    const groupRef = XLSX.utils.encode_cell({ r: 0, c });
    const headerRef = XLSX.utils.encode_cell({ r: 1, c });
    if (ws[groupRef]) ws[groupRef].s = { fill: { fgColor: { rgb: color } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border };
    if (ws[headerRef]) ws[headerRef].s = { fill: { fgColor: { rgb: "EAF7F4" } }, font: { color: { rgb: "183B35" }, bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border };
  }
  for (let r = 2; r < rowCount + 2; r++) {
    for (let c = 0; c < columns.length; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      const isDate = columns[c].dataType === "datetime";
      const isMoney = columns[c].dataType === "currency";
      const isPct = columns[c].dataType === "percentage";
      cell.s = {
        alignment: { vertical: "top", wrapText: true }, border,
        ...(isDate ? { numFmt: "dd/mm/yyyy hh:mm" } : {}),
        ...(isMoney ? { numFmt: "#,##0" } : {}),
        ...(isPct ? { numFmt: "0%" } : {}),
      };
      if (isDate) cell.z = "dd/mm/yyyy hh:mm";
      if (isMoney) cell.z = "#,##0";
      if (isPct) cell.z = "0%";
    }
  }
  ws["!cols"] = columns.map(item => ({ wch: item.width || 18 }));
  ws["!rows"] = [{ hpt: 24 }, { hpt: 36 }];
  ws["!autofilter"] = { ref: `A2:${XLSX.utils.encode_col(columns.length - 1)}${rowCount + 2}` };
}

function buildMainSheet(rows: CustomerExportRow[]): XLSX.WorkSheet {
  const columns = CUSTOMER_EXPORT_COLUMNS;
  const groupRow = columns.map(item => item.group);
  const headerRow = columns.map(item => item.label);
  const dataRows = rows.map(row => columns.map(item => item.value(row) ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([groupRow, headerRow, ...dataRows], { cellDates: true });
  const merges: XLSX.Range[] = [];
  let start = 0;
  for (let c = 1; c <= columns.length; c++) {
    if (c === columns.length || columns[c].group !== columns[start].group) {
      if (c - start > 1) merges.push({ s: { r: 0, c: start }, e: { r: 0, c: c - 1 } });
      start = c;
    }
  }
  ws["!merges"] = merges;
  styleMainSheet(ws, columns, rows.length);
  return ws;
}

export function buildCustomerExportWorkbook(rows: CustomerExportRow[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildMainSheet(rows), "Customer Info");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}
