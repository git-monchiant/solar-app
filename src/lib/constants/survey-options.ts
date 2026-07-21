// Display-side label maps for survey/install fields.
// Used by step "Done" views and the public survey link to render
// stored values back to Thai labels. Keep in sync with the form
// option lists in SurveyForm.tsx (where users pick the value).

export const ROOF_MATERIAL_LABEL: Record<string, string> = {
  cpac_tile: "CPAC",
  "cpac_tile:corrugated": "CPAC ลอน",
  "cpac_tile:smooth": "CPAC เรียบ",
  old_tile: "ลอนคู่",
  "metal_sheet:bolt": "เมทัลชีท ยึดน็อต",
  "metal_sheet:clip": "เมทัลชีท คลิปล็อก",
  concrete: "ดาดฟ้าคอนกรีต",
};

export const ORIENTATION_LABEL: Record<string, string> = {
  north: "เหนือ",
  south: "ใต้",
  east: "ตะวันออก",
  west: "ตะวันตก",
};

export const SHADING_LABEL: Record<string, string> = {
  none: "ไม่มี",
  partial: "บางช่วง",
  heavy: "ตลอดวัน",
};

export const METER_SIZE_LABEL: Record<string, string> = {
  "5_15": "5(15) A",
  "15_45": "15(45) A",
  "30_100": "30(100) A",
};

export const MDB_SLOTS_LABEL: Record<string, string> = {
  has_slot: "มีช่องว่าง 1 ช่อง",
  full: "เต็ม",
};

export const BREAKER_LABEL: Record<string, string> = {
  plug_on: "Plug On",
  screw: "ขันยึดสกรู",
};

export const MAIN_BREAKER_AMPS = ["40", "50", "80", "100"] as const;
export const MAIN_CABLE_SQMM = ["16", "25", "35", "50"] as const;

export const ROOF_STRUCTURE_LABEL: Record<string, string> = {
  steel: "เหล็ก",
  wood: "ไม้",
  aluminum: "อลูมิเนียม",
};

export const INVERTER_LOCATION_LABEL: Record<string, string> = {
  indoor: "ในร่ม",
  outdoor: "นอกอาคาร",
};

// ยี่ห้ออินเวอร์เตอร์ที่บริษัทใช้ติดตั้ง — เก็บเป็นชื่อยี่ห้อตรงๆ ใน DB
// (ไม่ใช้ short code) ใช้สำหรับ dropdown ใน Warranty / Package
export const INVERTER_BRANDS = ["DEYE", "Huawei"] as const;
export type InverterBrand = (typeof INVERTER_BRANDS)[number];

// ขนาดอินเวอร์เตอร์ (kW) ที่บริษัทมีให้เลือก
export const INVERTER_KW_SIZES = [3, 5, 6, 10] as const;
export type InverterKwSize = (typeof INVERTER_KW_SIZES)[number];

// Battery brand/spec catalogue — only what we actually install. Single source
// of truth so WarrantyStep, SerialsUploader, and any future picker stay in
// sync; bumping the list = one edit here, not three.
export const BATTERY_BRANDS = ["HUAWEI", "ZTT"] as const;
export type BatteryBrand = (typeof BATTERY_BRANDS)[number];
export const BATTERY_KWH_SIZES = [4.8, 7, 9.6, 14] as const;
export type BatteryKwhSize = (typeof BATTERY_KWH_SIZES)[number];

// Panel brand catalogue — same convention. Today we only stock JINKO but
// keeping it in a list lets callers render <option> arrays uniformly.
export const PANEL_BRANDS = ["JINKO"] as const;
export type PanelBrand = (typeof PANEL_BRANDS)[number];

export const WIFI_LABEL: Record<string, string> = {
  good: "ดีมาก",
  fair: "พอใช้",
  none: "ยังไม่มี",
};

export const ACCESS_LABEL: Record<string, string> = {
  ladder: "บันไดพาด",
  scaffold: "นั่งร้าน",
  crane: "รถกระเช้า",
};

export const APPLIANCE_LABEL: Record<string, string> = {
  water_heater: "เครื่องทำน้ำอุ่น",
  ev: "ที่ชาร์จรถ EV",
};

export const BATTERY_LABEL: Record<string, string> = {
  yes: "Solar + Battery",
  no: "On Grid",
  upgrade: "Upgrade",
  maybe: "ยังไม่แน่ใจ",
};

export const PHASE_LABEL: Record<string, string> = {
  "1_phase": "1 เฟส",
  "3_phase": "3 เฟส",
};

// Resolve a stored value back to its display label. Handles the
// "other:<freetext>" convention used by chip-with-other inputs.
export function labelFor(raw: string | null | undefined, map: Record<string, string>): string {
  if (!raw) return "—";
  if (raw.startsWith("other:")) return raw.slice(6) || "อื่นๆ";
  return map[raw] || raw;
}
