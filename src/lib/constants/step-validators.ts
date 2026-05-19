import type { Lead } from "@/components/lead/detail/steps/types";

export type ValidationResult = { valid: boolean; missing: { field: string; label: string }[] };

function check(lead: Partial<Lead>, rules: { field: keyof Lead | string; label: string; test?: (v: unknown) => boolean }[]): ValidationResult {
  const missing: { field: string; label: string }[] = [];
  for (const r of rules) {
    const v = (lead as Record<string, unknown>)[r.field as string];
    // Reject "other:" prefix without content — chip selections like roof/meter/etc.
    // store "other:<text>" when user picks "อื่นๆ"; bare "other:" means they
    // opened the slot but typed nothing.
    const isEmptyOther = typeof v === "string" && /^other:?\s*$/.test(v);
    const ok = r.test
      ? r.test(v)
      : v !== null && v !== undefined && v !== "" && !isEmptyOther && !(typeof v === "number" && v <= 0);
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
  // "Customize" system bypasses the standard panel + package picker: surveyor
  // describes the build in package_note instead. Skip panel_count + package
  // requirements, but enforce package_note as the substitute.
  const isCustomize = String((lead as Lead).survey_wants_battery || "").startsWith("customize");
  return check(lead, [
    { field: "survey_confirmed", label: "ยืนยันนัดสำรวจ", test: v => v === true },
    // Actual visit
    { field: "survey_actual_date", label: "วันที่เข้าสำรวจจริง" },
    { field: "survey_actual_by", label: "ผู้เข้าสำรวจ" },
    // Electrical
    { field: "survey_meter_size", label: "ขนาดมิเตอร์" },
    { field: "survey_electrical_phase", label: "ระบบไฟ" },
    // Voltage requirement follows the phase: 1-phase needs L-N (220V), 3-phase
    // needs L-L (380V). The other one is intentionally not collected so the
    // form stays focused on the value the surveyor actually measured.
    { field: "survey_voltage_ln", label: "แรงดัน L-N", test: v => (lead as Lead).survey_electrical_phase !== "1_phase" || v != null },
    { field: "survey_voltage_ll", label: "แรงดัน L-L", test: v => (lead as Lead).survey_electrical_phase !== "3_phase" || v != null },
    { field: "survey_monthly_bill", label: "ค่าไฟ/เดือน" },
    { field: "survey_mdb_brand", label: "ยี่ห้อ MDB" },
    { field: "survey_mdb_model", label: "รุ่น MDB" },
    { field: "survey_mdb_slots", label: "ช่องว่างใน MDB" },
    { field: "survey_breaker_type", label: "ชนิดเบรกเกอร์" },
    { field: "survey_panel_to_inverter_m", label: "Cable PV→Inverter" },
    { field: "survey_db_distance_m", label: "Cable Inverter→MDB" },
    // Roof / house
    { field: "survey_floors", label: "จำนวนชั้น" },
    { field: "survey_roof_material", label: "วัสดุหลังคา" },
    { field: "survey_roof_orientation", label: "ทิศหลังคา" },
    { field: "survey_roof_tilt", label: "ความชันหลังคา" },
    { field: "survey_roof_area_m2", label: "พื้นที่หลังคา" },
    { field: "survey_roof_width_m", label: "ความกว้างหลังคา" },
    { field: "survey_roof_length_m", label: "ความยาวหลังคา" },
    { field: "survey_roof_structure", label: "โครงสร้างหลังคา" },
    { field: "survey_shading", label: "เงาบัง" },
    // Installation planning
    { field: "survey_inverter_location", label: "ตำแหน่ง Inverter" },
    { field: "survey_wifi_signal", label: "สัญญาณ Wi-Fi" },
    { field: "survey_access_method", label: "วิธีขึ้นหลังคา" },
    // Photos are all optional — surveyor may skip if site conditions don't
    // require them. Re-add to this list if/when a slot becomes mandatory.
    // Recommendation + signature (final tab)
    { field: "survey_recommended_kw", label: "ขนาดที่แนะนำ (kWp)" },
    { field: "survey_panel_count", label: "จำนวน Panel", test: v => isCustomize || (v != null && Number(v) > 0) },
    { field: "survey_wants_battery", label: "ระบบ (On Grid / Battery / Upgrade)" },
    { field: "interested_package_id", label: "แพ็คเกจที่เสนอ", test: v => isCustomize || (v != null && v !== "") },
    { field: "package_note", label: "หมายเหตุแพ็คเกจ (อื่นๆ)", test: v => !isCustomize || (typeof v === "string" && v.trim() !== "") },
    { field: "survey_note", label: "บันทึก Survey" },
    { field: "survey_customer_signature_url", label: "ลายเซ็นลูกค้า" },
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
    { field: "order_before_paid", label: "ชำระงวดแรก", test: v => v === true },
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
