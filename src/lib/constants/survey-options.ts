// Display-side label maps for survey/install fields.
// Used by step "Done" views and the public survey link to render
// stored values back to Thai labels. Keep in sync with the form
// option lists in SurveyForm.tsx (where users pick the value).

export const ROOF_MATERIAL_LABEL: Record<string, string> = {
  cpac_tile: "CPAC",
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
  has_slot: "ยังมีช่องว่าง",
  full: "เต็ม",
};

export const BREAKER_LABEL: Record<string, string> = {
  plug_on: "Plug On",
  screw: "ขันยึดสกรู",
};

export const ROOF_STRUCTURE_LABEL: Record<string, string> = {
  steel: "เหล็ก",
  wood: "ไม้",
  aluminum: "อลูมิเนียม",
};

export const INVERTER_LOCATION_LABEL: Record<string, string> = {
  indoor: "ในร่ม",
  outdoor: "นอกอาคาร",
};

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
