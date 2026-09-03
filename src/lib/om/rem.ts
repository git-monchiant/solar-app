// ตัวเชื่อม REM (itf) — ทะเบียนโครงการ/unit/สัญญาโอนของบริษัท
// วัดเวลาจริง 1 ก.ย.: ดึง 1 หลัง 2.3-2.5 วิ · ดึงทั้งโครงการ 311 หลัง 2.7-3.0 วิ
// ⇒ ต้นทุนอยู่ที่การเชื่อมต่อ ไม่ใช่ขนาดข้อมูล — ดึงทั้งโครงการทีเดียวเสมอ อย่ายิงรายหลัง

const BASE = process.env.REM_API_URL || "https://rem-web.sena-it.com/sena/itf";
const KEY = process.env.REM_API_KEY || "";

export type RemUnit = {
  projectID: string; projectName?: string; projectNameEN?: string; projectType?: string;
  unitID: string; unitNumber?: string; houseNumber?: string;
  phaseName?: string; modelName?: string; modelTypeName?: string; titledeedArea?: number;
};

export type RemOwner = {
  contractID: string; customerItemID?: string;
  firstName?: string; lastName?: string; isMainCustomer?: boolean;
  citizenID?: string; passportID?: string; phoneNo1?: string; email?: string;
  nationalityName?: string;
};

export type RemPromotion = {
  contractID?: string; pDetailID?: number; promotionID?: string; mPromotionID?: string;
  promotionType?: string; promotionName?: string; description1?: string; description2?: string;
  isStandard?: boolean;
  // ★ REM ส่ง price / percentFrom มาด้วย แต่เราไม่รับเข้าระบบ (ผู้ใช้เคาะ 2 ก.ย.)
  //   ราคาของแถมเป็นข้อมูลฝั่งขาย งาน O&M ไม่มีเหตุต้องรู้ — ไม่เก็บดีกว่าเก็บแล้วต้องระวัง
};

// ★ ที่เดียวที่ REM บอกว่า "แถมโซลาร์ตอนขายไหม" — ชื่อโปรฯ ว่างได้บ่อย ต้องดู description ด้วย
//   ตัวอย่างที่เจอจริง: "Solar Roof 3.0 kw." · "ระบบบ้าน ZEH และ Solar Rooftop 3 kw.+O&M 2 ปี" · "ฟรี Solar Roof 1.28 kw."
const SOLAR_RE = /solar|โซลาร|โซล่า|โซลา|พลังงานแสง|photovolt/i;
export function isSolarPromo(p: RemPromotion): boolean {
  return SOLAR_RE.test(promoText(p));
}

const promoText = (p: RemPromotion) =>
  `${p.promotionName ?? ""} ${p.description1 ?? ""} ${p.description2 ?? ""}`;

// ★ ชื่อโปรฯ มีตัวเลขที่ใช้ได้จริงอยู่ 2 ตัว — ขนาดระบบ (kw) กับอายุสัญญา O&M (ปี)
//   "ระบบบ้าน ZEH และ Solar Rooftop 3 kw.+O&M 2 ปี" → 3 kW · 2 ปี
//   ระวัง "ปั๊มน้ำ 200 W" — เป็น W ไม่ใช่ kw และไม่ใช่โปรฯ โซลาร์อยู่แล้ว
export function promoSolarKw(p: RemPromotion): number | null {
  const m = promoText(p).match(/(\d+(?:\.\d+)?)\s*k\.?\s?w\.?p?\b/i);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > 0 && v < 100 ? v : null;
}

export function promoOmYears(p: RemPromotion): number | null {
  const m = promoText(p).match(/O\s*&\s*M\s*(\d+)\s*ปี/i);
  const v = m ? Number(m[1]) : NaN;
  return Number.isInteger(v) && v > 0 && v <= 20 ? v : null;
}

// REM เก็บโปรฯ ที่ยกเลิกไว้ในชื่อเลย ("… -ยกเลิก" / "(ยกเลิก)") — ต้องไม่นับเป็นของแถมที่ได้จริง
export function isCancelledPromo(p: RemPromotion): boolean {
  return /ยกเลิก/.test(promoText(p));
}

export type RemTransfer = {
  contractID: string; projectID: string; projectName?: string; projectType?: string;
  unitID?: string; unitNumber?: string; houseNumber?: string;
  transferDate?: string | null; condominiumRegisterDate?: string | null;
  latitude?: string; longitude?: string; owners?: RemOwner[]; promotions?: RemPromotion[];
};

export function remConfigured() { return Boolean(KEY); }

// บ้านเลขที่ที่ REM ส่งมามีเว้นวรรคปนบ้าง ("177 / 255") และศูนย์นำหน้าบ้าง — ทำคีย์ให้เทียบได้
export function houseKey(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s/g, "").replace(/^บ้านเลขที่/, "").replace(/^0+(?=\d)/, "");
}

// REM ส่งเบอร์มาแบบไม่มี 0 นำหน้า ("818551756") — เติมให้ตรงกับฝั่งเรา
// ★ บางรายยัดหลายเบอร์มาคั่นด้วย , — ใช้ตัวแรกเป็นคีย์ค้น (ตัวเต็มยังเก็บไว้ในคอลัมน์ phone)
export function phoneKey(s: string | null | undefined): string {
  let d = String(s ?? "").split(",")[0].replace(/\D/g, "");
  if (d.startsWith("66")) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d.length === 10 ? d : "";
}

// ★ prefix ของเลขสัญญาคือรหัสโครงการ — "00207-56110023-57100006" → 00207
//   ถ้าขึ้นต้น SO- หรือ S<เลข>- ให้เอาช่องที่ 2 ("SO-K9BK4-26060010" → K9BK4)
//   หมายเหตุ: เป็น "รหัสตอนขาย" อาจไม่เท่ากับ projectID ปัจจุบัน (F9/3,F9/4,F9/5 → ปัจจุบัน F9/2)
export function projectFromContract(contractId: string): string {
  const p = String(contractId).split("-");
  return /^S(O|\d)$/i.test(p[0]) ? (p[1] ?? "") : (p[0] ?? "");
}

async function post<T>(path: string, body: Record<string, string>): Promise<T[]> {
  if (!KEY) throw new Error("ยังไม่ได้ตั้ง REM_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${KEY}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`REM ${path} ตอบ ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  // REM ตอบเป็น array ตรง ๆ บ้าง ห่อ data/result บ้าง
  if (Array.isArray(j)) return j as T[];
  return (j?.data ?? j?.result ?? []) as T[];
}

// ★ projectID ว่าง = ได้ array เปล่า (ไม่ใช่ "ทั้งหมด") — ต้องวนทีละโครงการเสมอ
export function fetchUnits(projectId: string) {
  return post<RemUnit>("/api/master/units", { projectID: projectId, unitID: "", unitNumber: "", houseNumber: "" });
}

export function fetchTransfers(projectId: string) {
  return post<RemTransfer>("/api/saleorder/transfer", { projectID: projectId, unitID: "", unitNumber: "", houseNumber: "" });
}

// ★★ ต้องยิงรายหลังเท่านั้นถ้าจะเอา promotions ให้ครบ
//   ยิงทั้งโครงการ REM ส่ง promotions มาไม่ครบ (70503: 9 แถว vs 64 แถว = หาย 86%)
//   และโปรฯ โซลาร์หายไปด้วย ~36% ของที่สุ่มตรวจ — ทดสอบแล้ว 2 ก.ย.
//   ใช้ unitID เป็นตัวระบุ (primary key ของ REM) ไม่ใช้ houseNumber ที่มีเว้นวรรคปน เช่น "177 / 255"
//   หมายเหตุ: ยังมีโปรฯ ที่ API ไม่ส่งมาเลยไม่ว่ายิงแบบไหน (promotionType อื่นนอกจาก 'G') — ต้องขอทีม REM
export function fetchTransferByUnit(projectId: string, unitId: string) {
  return post<RemTransfer>("/api/saleorder/transfer", { projectID: projectId, unitID: unitId, unitNumber: "", houseNumber: "" });
}
