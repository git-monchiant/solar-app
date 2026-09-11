import { apiFetch } from "@/lib/api";
import { BATTERY_BRANDS, BATTERY_KWH_SIZES, INVERTER_BRANDS, INVERTER_KW_SIZES, PANEL_BRANDS } from "@/lib/constants/survey-options";

// ตัวเลือกอุปกรณ์ที่ป้อนให้ dropdown ของหน้า Warranty / Install Checklist
// แหล่งหลักคือตาราง `packages` (ดู /api/equipment-options) ส่วนค่าใน
// survey-options.ts เหลือบทบาทเป็นแค่ตาข่ายรองรับของเก่า — ขนาดบางค่าอย่าง
// 4.8 / 9.6 kWh ไม่มีในแพ็กเกจแล้วแต่เคยติดตั้งไปจริง ถ้าตัดทิ้งงานเก่าจะแก้ไม่ได้

export interface EquipmentOption {
  brand: string;
  model: string | null;
  /** kWh สำหรับแบตเตอรี่ · kW สำหรับอินเวอร์เตอร์ */
  spec: number | null;
}

export interface LeadPackageEquipment {
  id: number;
  name: string;
  battery_brand: string | null;
  battery_model: string | null;
  battery_kwh: number | null;
  inverter_brand: string | null;
  inverter_model: string | null;
  inverter_kw: number | null;
  panel_brand: string | null;
  panel_model: string | null;
  panel_watt: number | null;
  has_battery: boolean;
  has_inverter: boolean;
  has_panel: boolean;
}

export interface EquipmentOptions {
  batteries: EquipmentOption[];
  inverters: EquipmentOption[];
  panels: EquipmentOption[];
  leadPackage: LeadPackageEquipment | null;
}

export const EMPTY_EQUIPMENT_OPTIONS: EquipmentOptions = {
  batteries: [],
  inverters: [],
  panels: [],
  leadPackage: null,
};

/**
 * ยิงครั้งเดียวได้ทั้งตัวเลือกและแพ็กเกจของ lead — พังเมื่อไหร่คืนค่าว่างให้ฟอร์มยังกรอกมือได้
 * ไม่ส่ง leadId มาก็ได้ถ้าต้องการแค่รายการตัวเลือก (จะได้ไม่ query แพ็กเกจทิ้งเปล่า)
 */
export async function fetchEquipmentOptions(leadId?: number): Promise<EquipmentOptions> {
  try {
    const d = await apiFetch(`/api/equipment-options${leadId ? `?lead_id=${leadId}` : ""}`);
    if (!d || d.error) return EMPTY_EQUIPMENT_OPTIONS;
    return {
      batteries: Array.isArray(d.batteries) ? d.batteries : [],
      inverters: Array.isArray(d.inverters) ? d.inverters : [],
      panels: Array.isArray(d.panels) ? d.panels : [],
      leadPackage: d.leadPackage ?? null,
    };
  } catch {
    return EMPTY_EQUIPMENT_OPTIONS;
  }
}

/** เทียบชื่อแบบไม่สนตัวพิมพ์/เว้นวรรค — "LUNA2000-7-E1 " กับ "luna2000-7-e1" คือตัวเดียวกัน */
const loose = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * ถ้าค่าที่เก็บไว้ต่างจากตัวเลือกแค่ตัวพิมพ์หรือเว้นวรรค ให้ยึดตัวสะกดของ catalogue
 * (ข้อมูลเก่ามีทั้ง " LUNA2000-7-E1" และ "LUNA2000-7-E1 " ปนกัน) ถ้าไม่ตรงใครเลย
 * คืนค่าเดิมไป — Dropdown แสดงค่านอกลิสต์ได้อยู่แล้ว จะได้ไม่กลืนของที่พิมพ์เอง
 */
export function snapToCatalog(value: string, catalog: string[]): string {
  if (!value.trim()) return value;
  return catalog.find(c => loose(c) === loose(value)) ?? value;
}

/**
 * ค่านี้ยังอยู่ในลิสต์ที่เลือกได้ไหม (ไม่สนตัวพิมพ์/เว้นวรรค) — ใช้ตอนเปลี่ยนยี่ห้อ
 * เพื่อดูว่ารุ่น/ขนาดที่ค้างอยู่ยังใช้กับยี่ห้อใหม่ได้หรือเปล่า
 */
export function existsInCatalog(value: string, catalog: string[]): boolean {
  if (!value.trim()) return true;
  return catalog.some(c => loose(c) === loose(value));
}

/** ยี่ห้อที่เลือกได้ — จากแพ็กเกจก่อน แล้วต่อท้ายด้วยค่าคงที่เดิมที่แพ็กเกจไม่มี */
export function brandOptions(items: EquipmentOption[], fallback: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of [...items.map(i => i.brand), ...fallback]) {
    const key = loose(b);
    if (!b.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(b.trim());
  }
  return out;
}

/** รุ่นของยี่ห้อที่เลือก · ยังไม่เลือกยี่ห้อก็โชว์ทุกรุ่น (catalogue มีรุ่นจากแพ็กเกจเท่านั้น) */
export function modelOptions(items: EquipmentOption[], brand: string): string[] {
  const want = loose(brand);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    if (want && loose(i.brand) !== want) continue;
    const m = i.model?.trim();
    if (!m || seen.has(loose(m))) continue;
    seen.add(loose(m));
    out.push(m);
  }
  return out;
}

/** ขนาด (kWh/kW) ที่เลือกได้ · กรองตามยี่ห้อ+รุ่นเมื่อระบุมา แล้วรวมค่าคงที่เดิมเข้าไป */
export function specOptions(
  items: EquipmentOption[],
  fallback: readonly number[],
  filter?: { brand?: string; model?: string }
): number[] {
  const wantBrand = loose(filter?.brand ?? "");
  const wantModel = loose(filter?.model ?? "");
  const matched = items.filter(i =>
    (!wantBrand || loose(i.brand) === wantBrand) &&
    (!wantModel || loose(i.model ?? "") === wantModel)
  );
  // ยี่ห้อ/รุ่นนั้นไม่มีขนาดในแพ็กเกจเลย (เช่นเพิ่งพิมพ์ยี่ห้อใหม่เอง) ก็ถอยไปใช้ทั้งชุด
  const pool = matched.length > 0 ? matched : items;
  const nums = [...pool.map(i => i.spec).filter((n): n is number => typeof n === "number"), ...fallback];
  return [...new Set(nums)].sort((a, b) => a - b);
}

export const batteryBrandOptions = (o: EquipmentOptions) => brandOptions(o.batteries, BATTERY_BRANDS);
export const batteryKwhOptions = (o: EquipmentOptions, brand: string, model: string) =>
  specOptions(o.batteries, BATTERY_KWH_SIZES, { brand, model });
export const inverterBrandOptions = (o: EquipmentOptions) => brandOptions(o.inverters, INVERTER_BRANDS);
export const inverterKwOptions = (o: EquipmentOptions, brand: string) =>
  specOptions(o.inverters, INVERTER_KW_SIZES, { brand });
export const panelBrandOptions = (o: EquipmentOptions) => brandOptions(o.panels, PANEL_BRANDS);
