import type { Lead } from "@/components/lead-detail/steps/types";

export type ValidationResult = { valid: boolean; missing: { field: string; label: string }[] };

function check(lead: Partial<Lead>, rules: { field: keyof Lead | string; label: string; test?: (v: unknown) => boolean }[]): ValidationResult {
  const missing: { field: string; label: string }[] = [];
  for (const r of rules) {
    const v = (lead as Record<string, unknown>)[r.field as string];
    const ok = r.test ? r.test(v) : v !== null && v !== undefined && v !== "" && !(typeof v === "number" && v <= 0);
    if (!ok) missing.push({ field: r.field as string, label: r.label });
  }
  return { valid: missing.length === 0, missing };
}

export function validatePreSurvey(lead: Partial<Lead>): ValidationResult {
  return check(lead, [
    { field: "full_name", label: "ชื่อลูกค้า" },
    { field: "phone", label: "เบอร์โทร" },
    { field: "installation_address", label: "ที่อยู่ติดตั้ง" },
    { field: "pre_residence_type", label: "ประเภทบ้าน" },
    { field: "pre_monthly_bill", label: "ค่าไฟ/เดือน" },
    { field: "pre_peak_usage", label: "ช่วงเวลาที่ใช้ไฟสูงสุด" },
    { field: "pre_electrical_phase", label: "ระบบไฟ (เฟส)" },
    { field: "pre_wants_battery", label: "แบตเตอรี่/Upgrade" },
    { field: "interested_package_ids", label: "แพ็กเกจที่สนใจ", test: v => !!v || !!(lead as Lead).interested_package_id },
    { field: "survey_date", label: "วันนัดสำรวจ" },
    { field: "survey_time_slot", label: "ช่วงเวลา" },
  ]);
}

export function validateSurvey(lead: Partial<Lead>): ValidationResult {
  return check(lead, [
    { field: "survey_confirmed", label: "ยืนยันนัดสำรวจ", test: v => v === true },
    { field: "survey_residence_type", label: "ประเภทบ้าน" },
    { field: "survey_floors", label: "จำนวนชั้น" },
    { field: "survey_roof_material", label: "วัสดุหลังคา" },
    { field: "survey_roof_orientation", label: "ทิศหลังคา" },
    { field: "survey_roof_area_m2", label: "พื้นที่หลังคา" },
    { field: "survey_roof_tilt", label: "ความชันหลังคา" },
    { field: "survey_shading", label: "ร่มเงา" },
    { field: "survey_roof_age", label: "อายุหลังคา" },
    { field: "survey_electrical_phase", label: "ระบบไฟ" },
    { field: "survey_monthly_bill", label: "ค่าไฟ/เดือน" },
    { field: "survey_peak_usage", label: "ช่วงใช้ไฟสูงสุด" },
    { field: "survey_grid_type", label: "ประเภทเชื่อมต่อ" },
    { field: "survey_utility", label: "การไฟฟ้า" },
    { field: "survey_meter_size", label: "ขนาดมิเตอร์" },
    { field: "survey_ca_number", label: "เลข CA" },
    { field: "survey_db_distance_m", label: "ระยะ MDB" },
    { field: "survey_wants_battery", label: "แบตเตอรี่/Upgrade" },
    { field: "interested_package_id", label: "แพ็กเกจที่เลือก" },
    { field: "survey_note", label: "บันทึกสำรวจ" },
    { field: "survey_photos", label: "รูปถ่ายหน้างาน", test: v => typeof v === "string" && v.split(",").filter(Boolean).length > 0 },
  ]);
}

export function validateQuotation(lead: Partial<Lead>): ValidationResult {
  return check(lead, [
    { field: "quotation_amount", label: "ยอดใบเสนอราคา" },
    { field: "quotation_files", label: "ไฟล์ใบเสนอราคา" },
  ]);
}

export function validateOrder(lead: Partial<Lead>): ValidationResult {
  return check(lead, [
    { field: "order_total", label: "ยอดรวม" },
    { field: "order_pct_before", label: "% ชำระก่อนติดตั้ง" },
    { field: "install_date", label: "วันนัดติดตั้ง" },
    { field: "order_before_paid", label: "ชำระมัดจำ/งวดแรก", test: v => v === true },
    { field: "order_before_slip", label: "กรุณาอัปโหลดสลิปโอนงวดแรก" },
    { field: "id_card_number", label: "เลขบัตรประชาชน" },
    { field: "id_card_address", label: "ที่อยู่ตามบัตร" },
  ]);
}

export function validateInstall(lead: Partial<Lead>): ValidationResult {
  const needAfterPayment = (lead.order_total || 0) - Math.round((lead.order_total || 0) * (lead.order_pct_before || 100) / 100) > 0;
  return check(lead, [
    { field: "install_photos", label: "ภาพส่งมอบ", test: v => typeof v === "string" && v.split(",").filter(Boolean).length > 0 },
    { field: "install_note", label: "บันทึกการส่งมอบ" },
    ...(needAfterPayment ? [
      { field: "order_after_paid", label: "รับชำระงวดหลัง", test: (v: unknown) => v === true },
      { field: "order_after_slip", label: "กรุณาอัปโหลดสลิปโอนงวดหลัง" },
    ] : []),
  ]);
}
