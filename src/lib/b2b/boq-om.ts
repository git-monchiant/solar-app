// BOQ หมวด 13 O&M — ช่องตั้งค่า + สูตรจำนวนแบบไฟล์ Excel (แผน docs/plan/20261016-03-b2b-boq-om-calculator.md)
// ใช้ทั้งหน้าทำ BOQ (คิดสดตอนแก้ช่อง) และ API บันทึก (คิดซ้ำ ไม่เชื่อจำนวนจากหน้าจอ) · ไม่มี mssql ⇒ client import ได้
// ราคาต่อหน่วยมาจาก Master (Purchase ดูแล) — ไฟล์นี้คิดแค่ "จำนวน" ของบรรทัดที่ Master ติด om_role
// (คนละเรื่องกับ om.ts = โมดูลงานบริการ O&M B2B หลังส่งมอบ)

export const OM_CATEGORY = 13;

export type OmRole =
  | "travel" | "lodging" | "allowance"
  | "contractor_km" | "contractor_lead" | "contractor_worker"
  | "buffer_km" | "buffer_staff" | "tools" | "report";

export const OM_ROLES: OmRole[] = ["travel", "lodging", "allowance", "contractor_km", "contractor_lead", "contractor_worker", "buffer_km", "buffer_staff", "tools", "report"];
export const isOmRole = (v: unknown): v is OmRole => typeof v === "string" && (OM_ROLES as string[]).includes(v);

export type OmParams = {
  years: number;          // รับประกัน O&M (ปี)
  visits: number;         // เข้า O&M ปีละ (ครั้ง)
  staff: number;          // พนักงานเข้าหน้างาน (คน)
  days: number;           // วันเข้าหน้างานต่อครั้ง
  nights: number;         // คืนพักแรมต่อครั้ง (คิดเฉพาะต่างพื้นที่)
  distance_km: number;    // ระยะทางไป-กลับ
  leads: number;          // หัวหน้าช่างผู้รับเหมา (คน)
  workers: number;        // ช่างผู้รับเหมา (คน)
  out_of_area: boolean;   // ต่างพื้นที่ = ค้างคืน + เบี้ยเลี้ยง
};

/** ค่าตั้งต้น = ไฟล์ต้นแบบ BOQ Solar rooftop · ระยะทางต่างกันทุกโครงการ เริ่มที่ 0 ให้กรอกเอง */
export const OM_DEFAULTS: OmParams = { years: 2, visits: 2, staff: 2, days: 2, nights: 1, distance_km: 0, leads: 1, workers: 5, out_of_area: false };

type NumKey = Exclude<keyof OmParams, "out_of_area">;
/** ช่องตั้งค่า — ลำดับ/ป้าย/ช่วงค่าที่รับ (ใช้ทั้งกล่องในหน้าจอและตัวตรวจ) */
export const OM_FIELDS: { key: NumKey; label: string; unit: string; max: number; decimal?: boolean }[] = [
  { key: "years", label: "รับประกัน O&M", unit: "ปี", max: 30 },
  { key: "visits", label: "เข้า O&M ปีละ", unit: "ครั้ง", max: 52 },
  { key: "staff", label: "พนักงานเข้าหน้างาน", unit: "คน", max: 100 },
  { key: "days", label: "วันเข้าหน้างานต่อครั้ง", unit: "วัน", max: 60 },
  { key: "nights", label: "คืนพักแรมต่อครั้ง", unit: "คืน", max: 60 },
  { key: "distance_km", label: "ระยะทางไป-กลับ", unit: "km", max: 5000, decimal: true },
  { key: "leads", label: "หัวหน้าช่างผู้รับเหมา", unit: "คน", max: 50 },
  { key: "workers", label: "ช่างผู้รับเหมา", unit: "คน", max: 200 },
];

/** จำนวนของบรรทัดสูตร + วิธีคิด (แสดงใต้ช่องจำนวน / comment ใน Excel)
 *  ค่าแรงผู้รับเหมาเดิม ((ระยะทาง×10)+(A×1500)+(B×800))×วัน ต่อครั้ง → แยก 3 บรรทัด · Buffer เดิม (ระยะทาง×6×วัน)+(คน×1000) ต่อปี → แยก 2 บรรทัด
 *  ยอดรวมเท่าไฟล์เดิม (ไฟล์ต้นแบบ ต้นทุนหมวด 13 = 71,688) */
export function omQty(role: OmRole, p: OmParams): { qty: number; how: string } {
  const trips = p.visits * p.years;
  const rooms = Math.ceil(p.staff / 2);
  const t = `${p.visits} ครั้ง × ${p.years} ปี`;
  switch (role) {
    case "travel":
    case "contractor_km":
      return { qty: p.distance_km * p.days * trips, how: `${p.distance_km} km × ${p.days} วัน × ${t}` };
    case "lodging":
      return p.out_of_area ? { qty: rooms * p.nights * trips, how: `${rooms} ห้อง × ${p.nights} คืน × ${t}` } : { qty: 0, how: "ในพื้นที่ ไม่ค้างคืน" };
    case "allowance":
      return p.out_of_area ? { qty: p.staff * p.days * trips, how: `${p.staff} คน × ${p.days} วัน × ${t}` } : { qty: 0, how: "ในพื้นที่ ไม่มีเบี้ยเลี้ยง" };
    case "contractor_lead":
      return { qty: p.leads * p.days * trips, how: `${p.leads} คน × ${p.days} วัน × ${t}` };
    case "contractor_worker":
      return { qty: p.workers * p.days * trips, how: `${p.workers} คน × ${p.days} วัน × ${t}` };
    case "buffer_km":
      return { qty: p.distance_km * p.days * p.years, how: `${p.distance_km} km × ${p.days} วัน × ${p.years} ปี` };
    case "buffer_staff":
      return { qty: p.staff * p.years, how: `${p.staff} คน × ${p.years} ปี` };
    case "tools":
    case "report":
      return { qty: p.years, how: `${p.years} ปี` };
  }
}

/** สรุปช่องตั้งค่าบรรทัดเดียว — Excel ใต้หัวหมวด 13 (แบบหัวข้อ "O&M - 2 Years & 4 Times" ของไฟล์เดิม) */
export const omSummary = (p: OmParams) =>
  `O&M ${p.years} ปี · ปีละ ${p.visits} ครั้ง · พนักงาน ${p.staff} คน × ${p.days} วัน · ระยะทางไป-กลับ ${p.distance_km} km · ` +
  `ผู้รับเหมา หัวหน้า ${p.leads} ช่าง ${p.workers} · ${p.out_of_area ? `ต่างพื้นที่ ค้าง ${p.nights} คืน` : "ในพื้นที่"}`;

/** อ่าน/ตรวจช่องตั้งค่า (JSON ในฐาน หรือ body จากหน้าจอ) — null = ใบที่ไม่ใช้สูตร · ค่าผิด = error */
export function parseOmParams(raw: unknown): { value: OmParams | null } | { error: string } {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { value: null };
    try { obj = JSON.parse(raw); } catch { return { error: "ช่องตั้งค่า O&M ไม่ถูกต้อง" }; }
  }
  if (obj == null) return { value: null };
  if (typeof obj !== "object" || Array.isArray(obj)) return { error: "ช่องตั้งค่า O&M ไม่ถูกต้อง" };
  const o = obj as Record<string, unknown>;
  const out: OmParams = { ...OM_DEFAULTS };
  for (const f of OM_FIELDS) {
    const raw = o[f.key];
    const v = raw === "" || raw == null ? OM_DEFAULTS[f.key] : Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > f.max) return { error: `O&M: ${f.label} ต้องอยู่ระหว่าง 0–${f.max.toLocaleString("en-US")} ${f.unit}` };
    out[f.key] = f.decimal ? Math.round(v * 10) / 10 : Math.round(v);
  }
  out.out_of_area = o.out_of_area === true;
  return { value: out };
}
