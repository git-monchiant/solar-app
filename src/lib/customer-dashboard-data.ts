import { getDb, sql, toSqlDate } from "@/lib/db";
import { getSourceStyle, normalizeSourceKey } from "@/lib/source-tag";
import {
  ABLE_OR_NOT, BILL_RISE_ACTIONS, BUSINESS_TYPES, DAYTIME_OCCUPANTS,
  DECISION_FACTORS, DECISION_TIMELINES, ELECTRICAL_PHASES, EV_CHARGE_PERIODS,
  EV_READY_OPTIONS, HOUSE_AGES, METER_SIZES, MONTHLY_BILL_BUCKETS,
  OUTAGE_PRIORITIES, PEAK_USAGE, QUESTIONNAIRE_SECTIONS, RESIDENCE_TYPES,
  ROOF_SHAPES, USAGE_TREND_OPTIONS, WORK_DAYS_PER_WEEK, YES_NO, YES_NO_BIN,
  YES_NO_CONSIDERING, YES_NO_MAYBE, monthlyBillBucket, optionLabel,
} from "@/lib/customer-questionnaire";
import type {
  CountItem, CountSeries, CustomerDashboardData, CustomerDashboardFilters,
  CustomerDrilldownRow,
} from "@/lib/customer-dashboard-types";

type QuestionnaireRow = {
  id: number;
  full_name: string;
  house_number: string | null;
  status: string;
  source: string | null;
  customer_group: string | null;
  customer_grade: string | null;
  created_at: Date;
  project_id: number | null;
  project_name: string | null;
  updated_at: Date | null;
  residence_type: string | null;
  monthly_bill: number | null;
  peak_usage: string | null;
  electrical_phase: string | null;
  wants_battery: string | null;
  appliances: string | null;
  roof_shape: string | null;
  house_age: string | null;
  occupant_total: number | null;
  occupant_elderly: number | null;
  occupant_kids: number | null;
  occupant_pets: number | null;
  monthly_bill_max: number | null;
  meter_size: string | null;
  home_at_daytime: string | null;
  daytime_occupants: string | null;
  work_at_home: string | null;
  business_type: string | null;
  work_days_per_week: string | null;
  ac_split: string | null;
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

type Option = { value: string; label: string };

const LEGACY_PEAK_USAGE: Option[] = [
  { value: "day", label: "กลางวัน (ข้อมูลเดิม)" },
  { value: "night", label: "กลางคืน (ข้อมูลเดิม)" },
  { value: "both", label: "กลางวันและกลางคืน (ข้อมูลเดิม)" },
];

const LEGACY_ROOF_SHAPES: Option[] = [
  { value: "gable", label: "หน้าจั่ว (ข้อมูลเดิม)" },
  { value: "hip", label: "ปั้นหยา (ข้อมูลเดิม)" },
  { value: "shed", label: "เพิงหมาแหงน (ข้อมูลเดิม)" },
  { value: "flat", label: "ทรงแบน (ข้อมูลเดิม)" },
];

const CUSTOMER_GROUPS: Option[] = [
  { value: "general", label: "ลูกค้าทั่วไป" },
  { value: "sena", label: "ลูกค้าเสนา" },
  { value: "sme", label: "SME" },
];

const SALES_GRADES: Option[] = [
  { value: "A", label: "พร้อมซื้อ" },
  { value: "B", label: "เปรียบเทียบ" },
  { value: "C", label: "พิจารณา" },
  { value: "D", label: "ยังไม่พร้อม" },
  { value: "E", label: "หาข้อมูล" },
  { value: "F", label: "ไม่สนใจ" },
];

const isAnswered = (value: unknown): boolean =>
  value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");

function normalizedValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("other:") ? "other" : value;
}

function csvValues(value: string | null | undefined): string[] {
  return value ? value.split(",").map(v => v.trim()).filter(Boolean) : [];
}

function singleSeries(rows: QuestionnaireRow[], field: string, options: readonly Option[], includeUnknown = true): CountSeries {
  const values = rows.map(r => normalizedValue(r[field] as string | null)).filter((v): v is string => !!v);
  const counts = new Map<string, number>();
  values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  const items: CountItem[] = options.map(o => ({ value: o.value, label: o.label, count: counts.get(o.value) || 0 }));
  if (includeUnknown) {
    for (const [value, count] of counts) {
      if (!options.some(o => o.value === value)) items.push({ value, label: `ข้อมูลเดิม: ${value}`, count });
    }
  }
  return { answered: values.length, items };
}

function multiSeries(rows: QuestionnaireRow[], field: string, options: readonly Option[]): CountSeries {
  const answeredRows = rows.filter(r => csvValues(r[field] as string | null).length > 0);
  const counts = new Map<string, number>();
  answeredRows.forEach(row => {
    const unique = new Set(csvValues(row[field] as string | null).map(normalizedValue).filter((v): v is string => !!v));
    unique.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  });
  const items: CountItem[] = options.map(o => ({ value: o.value, label: o.label, count: counts.get(o.value) || 0 }));
  for (const [value, count] of counts) {
    if (!options.some(o => o.value === value)) items.push({ value, label: `ข้อมูลเดิม: ${value}`, count });
  }
  return { answered: answeredRows.length, items };
}

function classificationSeries(rows: QuestionnaireRow[], field: "customer_group" | "customer_grade", options: readonly Option[], missingValue: string, missingLabel: string): CountSeries {
  const answeredRows = rows.filter(row => isAnswered(row[field]));
  const counts = new Map<string, number>();
  answeredRows.forEach(row => {
    const value = String(row[field]).trim();
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const items: CountItem[] = options.map(option => ({ value: option.value, label: option.label, count: counts.get(option.value) || 0 }));
  for (const [value, count] of counts) {
    if (!options.some(option => option.value === value)) items.push({ value, label: `ข้อมูลเดิม: ${value}`, count });
  }
  items.push({ value: missingValue, label: missingLabel, count: rows.length - answeredRows.length });
  return { answered: answeredRows.length, items };
}

function positiveAverage(values: Array<number | null | undefined>): number | null {
  const nums = values.map(Number).filter(v => Number.isFinite(v) && v > 0);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

function median(values: Array<number | null | undefined>): number | null {
  const nums = values.map(Number).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return Math.round(nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2);
}

function parseAcSplit(raw: string | null): { day: number; night: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { day?: Record<string, unknown>; night?: Record<string, unknown> };
    const sum = (part?: Record<string, unknown>) => Object.values(part || {}).reduce<number>((total, value) => total + (Number(value) || 0), 0);
    return { day: sum(parsed.day), night: sum(parsed.night) };
  } catch { return null; }
}

function parseFactors(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const factor of DECISION_FACTORS) {
      const n = Number(parsed[factor.key]);
      if (Number.isInteger(n) && n >= 1 && n <= 5) out[factor.key] = n;
    }
    return out;
  } catch { return {}; }
}

function sectionAnswered(row: QuestionnaireRow, sectionIndex: number): boolean {
  return QUESTIONNAIRE_SECTIONS[sectionIndex].fields.some(field => isAnswered(row[field]));
}

function respondent(row: QuestionnaireRow): boolean {
  return QUESTIONNAIRE_SECTIONS.some((_, index) => sectionAnswered(row, index));
}

function completeEight(row: QuestionnaireRow): boolean {
  return QUESTIONNAIRE_SECTIONS.every((_, index) => sectionAnswered(row, index));
}

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseCustomerDashboardFilters(params: URLSearchParams): CustomerDashboardFilters {
  const projectRaw = Number(params.get("project_id") || 0);
  return {
    from: params.get("from") || "",
    to: params.get("to") || "",
    projectId: Number.isInteger(projectRaw) && projectRaw > 0 ? projectRaw : null,
    source: params.get("source") || "",
    status: params.get("status") || "",
  };
}

async function queryRows(filters: CustomerDashboardFilters): Promise<QuestionnaireRow[]> {
  const db = await getDb();
  const request = db.request();
  const clauses: string[] = [];
  const from = toSqlDate(filters.from);
  const to = toSqlDate(filters.to);
  if (from) { request.input("from", sql.Date, from); clauses.push("CAST(l.created_at AS DATE) >= @from"); }
  if (to) { request.input("to", sql.Date, to); clauses.push("CAST(l.created_at AS DATE) <= @to"); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await request.query(`
    SELECT l.id, l.full_name, l.house_number, l.status, l.source,
      l.customer_group, l.customer_grade, l.created_at,
      l.project_id, p.name AS project_name,
      d.updated_at, d.residence_type, d.monthly_bill, d.peak_usage,
      d.electrical_phase, d.wants_battery, d.appliances, d.roof_shape,
      d.house_age, d.occupant_total, d.occupant_elderly, d.occupant_kids,
      d.occupant_pets, d.monthly_bill_max, d.meter_size, d.home_at_daytime,
      d.daytime_occupants, d.work_at_home, d.business_type,
      d.work_days_per_week, d.ac_split, d.ev_charge_period, d.future_ev,
      d.future_ev_charger, d.future_extend_home, d.future_more_members,
      d.future_smart_home, d.future_battery, d.outage_priorities,
      d.bill_rise_action, d.had_roof_leak, d.did_roof_repair,
      d.had_electrical_issue, d.did_panel_replacement, d.self_generates,
      d.ev_ready, d.blackout_resilient, d.future_usage_trend,
      d.decision_factors, d.decision_timeline
    FROM leads l
    LEFT JOIN projects p ON p.id = l.project_id
    LEFT JOIN lead_data d ON d.lead_id = l.id
    ${where}
    ORDER BY l.created_at DESC
  `);
  return result.recordset as QuestionnaireRow[];
}

function applyDimensionFilters(rows: QuestionnaireRow[], filters: CustomerDashboardFilters): QuestionnaireRow[] {
  return rows.filter(row => {
    if (filters.projectId && row.project_id !== filters.projectId) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.source && normalizeSourceKey(row.source) !== filters.source) return false;
    return true;
  });
}

export async function getCustomerDashboard(filters: CustomerDashboardFilters): Promise<CustomerDashboardData> {
  const dateRows = await queryRows(filters);
  const rows = applyDimensionFilters(dateRows, filters);
  const respondents = rows.filter(respondent);
  const complete = respondents.filter(completeEight);
  const customerGroups = classificationSeries(rows, "customer_group", CUSTOMER_GROUPS, "unclassified", "ยังไม่ระบุ");
  const salesGrades = classificationSeries(rows, "customer_grade", SALES_GRADES, "ungraded", "ยังไม่จัด");
  const answeredSlots = respondents.reduce((total, row) => total + QUESTIONNAIRE_SECTIONS.filter((_, index) => sectionAnswered(row, index)).length, 0);
  const monthlyBills = respondents.map(r => r.monthly_bill).filter((v): v is number => Number(v) > 0);
  const billCounts = new Map<string, number>(MONTHLY_BILL_BUCKETS.map(bucket => [bucket.value, 0]));
  monthlyBills.forEach(value => { const key = monthlyBillBucket(Number(value)); if (key) billCounts.set(key, (billCounts.get(key) || 0) + 1); });
  const acRows = respondents.map(r => parseAcSplit(r.ac_split)).filter((v): v is { day: number; night: number } => !!v);

  const futureFields = [
    { key: "future_ev", label: "แผนซื้อรถยนต์ EV", options: YES_NO_CONSIDERING },
    { key: "future_ev_charger", label: "แผนติดตั้ง EV Charger", options: YES_NO_BIN },
    { key: "future_extend_home", label: "แผนต่อเติมบ้าน", options: YES_NO_BIN },
    { key: "future_more_members", label: "แผนเพิ่มจำนวนสมาชิกในบ้าน", options: YES_NO_BIN },
    { key: "future_smart_home", label: "แผนติดตั้งระบบ Smart Home", options: YES_NO_BIN },
    { key: "future_battery", label: "แผนติด Battery เก็บไฟจาก Solar", options: YES_NO_MAYBE },
  ];
  const healthFields = [
    { key: "had_roof_leak", label: "เคยมีปัญหาหลังคารั่ว" },
    { key: "did_roof_repair", label: "เคยปรับปรุง / ซ่อมแซมหลังคา" },
    { key: "had_electrical_issue", label: "เคยมีปัญหาระบบไฟฟ้า" },
    { key: "did_panel_replacement", label: "เคยเปลี่ยนตู้ควบคุมไฟฟ้าในบ้าน" },
  ];
  const beyondFields = [
    { key: "self_generates", label: "บ้านผลิตพลังงานไฟฟ้าเองได้ในวันนี้", options: ABLE_OR_NOT },
    { key: "ev_ready", label: "บ้านพร้อมสำหรับรถยนต์ EV", options: EV_READY_OPTIONS },
    { key: "blackout_resilient", label: "ไฟดับแล้วยังใช้ชีวิตได้ตามปกติ", options: ABLE_OR_NOT },
    { key: "future_usage_trend", label: "แนวโน้มการใช้ไฟในอีก 10 ปี", options: USAGE_TREND_OPTIONS },
  ];

  const factors = DECISION_FACTORS.map(factor => {
    const values = respondents.map(r => parseFactors(r.decision_factors)[factor.key]).filter((v): v is number => !!v);
    return {
      key: factor.key,
      label: factor.label,
      answered: values.length,
      average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
      scores: [1, 2, 3, 4, 5].map(score => values.filter(v => v === score).length),
    };
  });

  const projectMap = new Map<number, string>();
  dateRows.forEach(r => { if (r.project_id && r.project_name) projectMap.set(r.project_id, r.project_name); });
  const sourceKeys = Array.from(new Set(dateRows.map(r => normalizeSourceKey(r.source))));
  const latest = respondents.map(r => r.updated_at).filter((v): v is Date => !!v).sort((a, b) => b.getTime() - a.getTime())[0] || null;

  return {
    filters: {
      projects: Array.from(projectMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "th")),
      sources: sourceKeys.map(value => ({ value, label: getSourceStyle(value).label })).sort((a, b) => a.label.localeCompare(b.label, "th")),
      statuses: Array.from(new Set(dateRows.map(r => r.status).filter(Boolean))).sort(),
    },
    meta: {
      cohortLeads: rows.length,
      respondents: respondents.length,
      completeEight: complete.length,
      coveragePct: respondents.length ? Math.round((answeredSlots / (respondents.length * 8)) * 100) : 0,
      latestUpdatedAt: iso(latest),
      averageMonthlyBill: positiveAverage(monthlyBills),
      medianMonthlyBill: median(monthlyBills),
      monthlyBillAnswered: monthlyBills.length,
      decisionSoon: respondents.filter(r => r.decision_timeline === "1-3m").length,
    },
    summary: { customerGroups, salesGrades },
    sections: {
      customerProfile: {
        residenceType: singleSeries(respondents, "residence_type", RESIDENCE_TYPES),
        houseAge: singleSeries(respondents, "house_age", HOUSE_AGES),
        roofShape: singleSeries(respondents, "roof_shape", [...ROOF_SHAPES, ...LEGACY_ROOF_SHAPES]),
        averageOccupants: positiveAverage(respondents.map(r => r.occupant_total)),
        occupantAnswered: respondents.filter(r => Number(r.occupant_total) > 0).length,
        withElderly: respondents.filter(r => Number(r.occupant_elderly) > 0).length,
        withKids: respondents.filter(r => Number(r.occupant_kids) > 0).length,
        withPets: respondents.filter(r => Number(r.occupant_pets) > 0).length,
      },
      energyProfile: {
        monthlyBill: {
          answered: monthlyBills.length,
          average: positiveAverage(monthlyBills),
          median: median(monthlyBills),
          items: MONTHLY_BILL_BUCKETS.map(bucket => ({ value: bucket.value, label: bucket.label, count: billCounts.get(bucket.value) || 0 })),
        },
        monthlyBillMaxAverage: positiveAverage(respondents.map(r => r.monthly_bill_max)),
        electricalPhase: singleSeries(respondents, "electrical_phase", ELECTRICAL_PHASES),
        meterSize: singleSeries(respondents, "meter_size", METER_SIZES),
        peakUsage: singleSeries(respondents, "peak_usage", [...PEAK_USAGE, ...LEGACY_PEAK_USAGE]),
      },
      lifestyle: {
        homeAtDaytime: singleSeries(respondents, "home_at_daytime", YES_NO),
        daytimeOccupants: multiSeries(respondents, "daytime_occupants", DAYTIME_OCCUPANTS),
        workAtHome: singleSeries(respondents, "work_at_home", YES_NO),
        businessType: singleSeries(respondents, "business_type", BUSINESS_TYPES),
        workDaysPerWeek: singleSeries(respondents, "work_days_per_week", WORK_DAYS_PER_WEEK),
        acAnswered: acRows.length,
        acDayTotal: acRows.reduce((sum, r) => sum + r.day, 0),
        acNightTotal: acRows.reduce((sum, r) => sum + r.night, 0),
        evCharger: {
          answered: respondents.filter(r => isAnswered(r.appliances)).length,
          items: [
            { value: "yes", label: "มี", count: respondents.filter(r => csvValues(r.appliances).includes("ev")).length },
            { value: "no", label: "ไม่มี", count: respondents.filter(r => isAnswered(r.appliances) && !csvValues(r.appliances).includes("ev")).length },
          ],
        },
        evChargePeriod: singleSeries(respondents, "ev_charge_period", EV_CHARGE_PERIODS),
      },
      futureHome: { fields: futureFields.map(f => ({ key: f.key, label: f.label, series: singleSeries(respondents, f.key, f.options) })) },
      energySecurity: {
        outagePriorities: multiSeries(respondents, "outage_priorities", OUTAGE_PRIORITIES),
        billRiseAction: singleSeries(respondents, "bill_rise_action", BILL_RISE_ACTIONS),
      },
      homeHealth: {
        fields: healthFields.map(f => ({ key: f.key, label: f.label, series: singleSeries(respondents, f.key, [
          { value: "yes", label: "เคย" }, { value: "no", label: "ไม่เคย" },
        ]) })),
        anyRisk: respondents.filter(r => healthFields.some(f => r[f.key] === "yes")).length,
      },
      beyond: { fields: beyondFields.map(f => ({ key: f.key, label: f.label, series: singleSeries(respondents, f.key, f.options) })) },
      decision: {
        timeline: singleSeries(respondents, "decision_timeline", DECISION_TIMELINES),
        factors,
      },
    },
  };
}

const HOME_HEALTH_KEYS = ["had_roof_leak", "did_roof_repair", "had_electrical_issue", "did_panel_replacement"] as const;

function matches(row: QuestionnaireRow, dimension: string, value: string, score: number | null): boolean {
  if (dimension === "questionnaire_status") {
    if (value === "unanswered") return !respondent(row);
    if (value === "partial") return respondent(row) && !completeEight(row);
    return value === "complete" && completeEight(row);
  }
  if (dimension === "customer_group") return value === "unclassified" ? !isAnswered(row.customer_group) : row.customer_group === value;
  if (dimension === "sales_grade") return value === "ungraded" ? !isAnswered(row.customer_grade) : row.customer_grade === value;
  if (dimension === "respondent") return respondent(row);
  if (dimension === "complete") return completeEight(row);
  if (dimension === "monthly_bill") return monthlyBillBucket(Number(row.monthly_bill)) === value;
  if (dimension === "occupant_elderly" || dimension === "occupant_kids" || dimension === "occupant_pets") return Number(row[dimension]) > 0;
  if (dimension === "daytime_occupants" || dimension === "outage_priorities") return csvValues(row[dimension] as string | null).some(v => normalizedValue(v) === value);
  if (dimension === "ev_charger") return value === "yes" ? csvValues(row.appliances).includes("ev") : isAnswered(row.appliances) && !csvValues(row.appliances).includes("ev");
  if (dimension === "ac_period") { const ac = parseAcSplit(row.ac_split); return !!ac && (value === "day" ? ac.day : ac.night) > 0; }
  if (dimension === "home_health_risk") return HOME_HEALTH_KEYS.some(key => row[key] === "yes");
  if (dimension === "decision_timeline" && value === "unanswered") return !isAnswered(row.decision_timeline);
  if (dimension === "decision_factor") {
    const factorScore = parseFactors(row.decision_factors)[value];
    return score ? factorScore === score : !!factorScore;
  }
  const allowed = new Set([
    "residence_type", "house_age", "roof_shape", "electrical_phase", "meter_size", "peak_usage",
    "home_at_daytime", "work_at_home", "business_type", "work_days_per_week", "ev_charge_period",
    "future_ev", "future_ev_charger", "future_extend_home", "future_more_members", "future_smart_home", "future_battery",
    "bill_rise_action", "had_roof_leak", "did_roof_repair", "had_electrical_issue", "did_panel_replacement",
    "self_generates", "ev_ready", "blackout_resilient", "future_usage_trend", "decision_timeline",
  ]);
  return allowed.has(dimension) && normalizedValue(row[dimension] as string | null) === value;
}

function answerLabel(row: QuestionnaireRow, dimension: string, value: string, score: number | null): string {
  if (dimension === "questionnaire_status") return value === "complete" ? "ตอบครบทั้ง 8 หัวข้อ" : value === "partial" ? "ตอบแบบสอบถามบางส่วน" : "ยังไม่ตอบแบบสอบถาม";
  if (dimension === "customer_group") return value === "unclassified" ? "ยังไม่ระบุกลุ่มลูกค้า" : optionLabel(CUSTOMER_GROUPS, row.customer_group);
  if (dimension === "sales_grade") return value === "ungraded" ? "ยังไม่จัด Sales Grade" : `Grade ${row.customer_grade || "—"} · ${optionLabel(SALES_GRADES, row.customer_grade)}`;
  if (dimension === "decision_timeline" && value === "unanswered") return "ยังไม่ตอบระยะเวลาในการตัดสินใจ";
  if (dimension === "monthly_bill") return row.monthly_bill ? `${Number(row.monthly_bill).toLocaleString("th-TH")} บาท` : "—";
  if (dimension === "decision_factor") {
    const factor = DECISION_FACTORS.find(f => f.key === value);
    return `${factor?.label || value}: ${score || parseFactors(row.decision_factors)[value] || "—"}/5`;
  }
  if (dimension === "occupant_elderly" || dimension === "occupant_kids" || dimension === "occupant_pets") return `${Number(row[dimension]) || 0} คน`;
  if (dimension === "ac_period") { const ac = parseAcSplit(row.ac_split); return `${value === "day" ? "กลางวัน" : "กลางคืน"} ${ac?.[value as "day" | "night"] || 0} เครื่อง`; }
  const optionsByField: Record<string, readonly Option[]> = {
    residence_type: RESIDENCE_TYPES, house_age: HOUSE_AGES, roof_shape: [...ROOF_SHAPES, ...LEGACY_ROOF_SHAPES],
    electrical_phase: ELECTRICAL_PHASES, meter_size: METER_SIZES, peak_usage: [...PEAK_USAGE, ...LEGACY_PEAK_USAGE],
    home_at_daytime: YES_NO, daytime_occupants: DAYTIME_OCCUPANTS, work_at_home: YES_NO,
    business_type: BUSINESS_TYPES, work_days_per_week: WORK_DAYS_PER_WEEK, ev_charge_period: EV_CHARGE_PERIODS,
    future_ev: YES_NO_CONSIDERING, future_ev_charger: YES_NO_BIN, future_extend_home: YES_NO_BIN,
    future_more_members: YES_NO_BIN, future_smart_home: YES_NO_BIN, future_battery: YES_NO_MAYBE,
    outage_priorities: OUTAGE_PRIORITIES, bill_rise_action: BILL_RISE_ACTIONS,
    had_roof_leak: [{ value: "yes", label: "เคย" }, { value: "no", label: "ไม่เคย" }],
    did_roof_repair: [{ value: "yes", label: "เคย" }, { value: "no", label: "ไม่เคย" }],
    had_electrical_issue: [{ value: "yes", label: "เคย" }, { value: "no", label: "ไม่เคย" }],
    did_panel_replacement: [{ value: "yes", label: "เคย" }, { value: "no", label: "ไม่เคย" }],
    self_generates: ABLE_OR_NOT, ev_ready: EV_READY_OPTIONS, blackout_resilient: ABLE_OR_NOT,
    future_usage_trend: USAGE_TREND_OPTIONS, decision_timeline: DECISION_TIMELINES,
  };
  if (dimension === "respondent") return "มีคำตอบอย่างน้อย 1 หัวข้อ";
  if (dimension === "complete") return "ตอบครบทั้ง 8 หัวข้อ";
  if (dimension === "ev_charger") return value === "yes" ? "มีที่ชาร์จรถ EV" : "ไม่มีที่ชาร์จรถ EV";
  if (dimension === "home_health_risk") return "พบประวัติความเสี่ยงด้านหลังคาหรือระบบไฟฟ้า";
  return optionLabel(optionsByField[dimension] || [], row[dimension] as string | null);
}

export async function getCustomerDrilldown(filters: CustomerDashboardFilters, dimension: string, value: string, score: number | null): Promise<CustomerDrilldownRow[]> {
  const rows = applyDimensionFilters(await queryRows(filters), filters).filter(row => matches(row, dimension, value, score));
  return rows.map(row => ({
    id: row.id,
    full_name: row.full_name,
    house_number: row.house_number,
    status: row.status,
    created_at: iso(row.created_at) || "",
    project_name: row.project_name,
    source: row.source,
    answer: answerLabel(row, dimension, value, score),
  }));
}
