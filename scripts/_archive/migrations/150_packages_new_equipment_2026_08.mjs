// ชุดอุปกรณ์ใหม่ ส.ค. 2569 — TRINA SOLAR 730W / DEYE hybrid / แบต EHB,LUNA2000
//
// ทำอะไร (23 package):
//   1. สร้าง package ใหม่จากการ duplicate ตัวเดิม แล้วแก้สเปก+รายการตามไฟล์ Excel
//      "ใบเสนอราคาติดตั้ง Solar Cell_ตัวอย่าง.xlsx" (ชื่อ package = ชื่อ tab)
//   2. ราคาเท่าเดิมทุกตัว — ไม่มีการขึ้น/ลดราคา
//   3. ช่วงราคาใหม่ 25-31 ส.ค. 2569 (active) · ของเดิมดึงวันหมดอายุมาจบ 24 ส.ค. 2569 + ปิด
//   4. ปิด is_active ของ package เดิม
//
// ไม่แตะ: id 33 งานเพิ่มตู้คอนซูมเมอร์ยูนิต (ไม่มีในไฟล์ Excel)
//
// ข้อมูลทั้งหมดฝังในไฟล์นี้ (ดึงจาก solardb_dev ที่ทดสอบแล้ว) ไม่ต้องมีไฟล์ Excel ตอนรัน
// รันซ้ำได้ — ถ้ามี package ชื่อเดียวกันที่ active อยู่แล้วจะข้าม
//
// ใช้: node scripts/migrations/150_packages_new_equipment_2026_08.mjs --db=solardb

import sql from 'mssql';
import fs from 'node:fs';
import path from 'node:path';

const START = '2026-08-25';   // ช่วงราคาใหม่เริ่ม
const EXPIRE = '2026-08-31';  // สิ้นเดือน
const CUTOFF = '2026-08-24';  // ของเดิมหมดอายุ

const DATA =
[
 {
  "old_id": 1,
  "old_name": "Solar Rooftop ขนาด 3 kWp 1 เฟส",
  "old_price": 114000,
  "pkg": {
   "name": "3 kWp_On",
   "kwp": 3,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": 3,
   "inverter_brand": "HUAWEI",
   "price": 114000,
   "monthly_installment": "1,2xx",
   "monthly_saving": 1800,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 2.92,
   "panel_count": 4,
   "panel_watt": 730,
   "inverter_model": "SUN2000-3KTL-L1",
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 2.92 kWp",
    "q": 1,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 4,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ HUAWEI ( MODEL : SUN2000-3KTL-L1 ) หรือ เทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   }
  ]
 },
 {
  "old_id": 2,
  "old_name": "Solar Rooftop ขนาด 5 kWp 1 เฟส",
  "old_price": 142000,
  "pkg": {
   "name": "5 kWp_On",
   "kwp": 5,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": 5,
   "inverter_brand": "HUAWEI",
   "price": 142000,
   "monthly_installment": "1,5xx",
   "monthly_saving": 3000,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 5.11,
   "panel_count": 7,
   "panel_watt": 730,
   "inverter_model": "SUN2000-5KTL-L1",
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 5.11 kWp",
    "q": 1,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 7,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ HUAWEI ( MODEL : SUN2000-5KTL-L1 ) หรือ เทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   }
  ]
 },
 {
  "old_id": 3,
  "old_name": "Solar Rooftop ขนาด 10 kWp 1 เฟส",
  "old_price": 229000,
  "pkg": {
   "name": "10 kWp_On 1 เฟส",
   "kwp": 10,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": 10,
   "inverter_brand": "HUAWEI",
   "price": 229000,
   "monthly_installment": "2,6xx",
   "monthly_saving": 6000,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 9.49,
   "panel_count": 13,
   "panel_watt": 730,
   "inverter_model": "SUN2000-10K-LC0",
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 9.49 kWp",
    "q": 1,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 13,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ HUAWEI Solar Inverters ( Model: SUN2000-10K-LC0 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   }
  ]
 },
 {
  "old_id": 32,
  "old_name": "Solar Rooftop ขนาด 10 kWp 3 Phase",
  "old_price": 238000,
  "pkg": {
   "name": "10 kWp_On 3 เฟส",
   "kwp": 10,
   "phase": 3,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": 10,
   "inverter_brand": "HUAWEI",
   "price": 238000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 9.49,
   "panel_count": 13,
   "panel_watt": 730,
   "inverter_model": "SUN2000-10K-MAP0",
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 9.49 kWp",
    "q": 3,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 13,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ HUAWEI Solar Inverters ( Model: SUN2000-10K-MAP0 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   }
  ]
 },
 {
  "old_id": 25,
  "old_name": "Solar Rooftop ขนาด 20 kWp 3 เฟส",
  "old_price": 434000,
  "pkg": {
   "name": "20 kWp_On 3 เฟส",
   "kwp": 20,
   "phase": 3,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": 20,
   "inverter_brand": "HUAWEI",
   "price": 434000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 20.44,
   "panel_count": 28,
   "panel_watt": 730,
   "inverter_model": "SUN2000-20K-MB0",
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 20.44 kWp",
    "q": 3,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 28,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ HUAWEI Solar Inverters ( Model: SUN2000-20K-MB0 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   }
  ]
 },
 {
  "old_id": 17,
  "old_name": "Solar Rooftop ขนาด 5 kWp + แบตเตอรี่ 9.6 kWh (15/45A)",
  "old_price": 280000,
  "pkg": {
   "name": "5 kWp+Hybrid_1 เฟส",
   "kwp": 5,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 10.4,
   "battery_brand": "ZTT",
   "inverter_kw": 5,
   "inverter_brand": "DEYE",
   "price": 280000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 5.11,
   "panel_count": 7,
   "panel_watt": 730,
   "inverter_model": "SUN-5K-SG04LP1-EU-SM2",
   "battery_model": "EHB48100R16S1P05K02",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 5.11 kWp",
    "q": 1,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 7,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ DEYE ( MODEL : SUN-5K-SG04LP1-EU-SM2 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "ตู้แร็ค 15U ขนาด 600x550x770 พร้อมอุปกรณ์ จำนวน",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "BATTERY MODULE - EHB48100R16S1P05K02,51.2VDC,102AH (Lithium-ion battery pack, IP21) ขนาด 10.44 kWh จำนวน",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 10
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 11
   }
  ]
 },
 {
  "old_id": 4,
  "old_name": "Solar Rooftop ขนาด 7 kWp + แบตเตอรี่ 9.6 kWh (30/100A) 1 เฟส",
  "old_price": 306000,
  "pkg": {
   "name": "7 kWp+Hybrid_1 เฟส",
   "kwp": 7,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 10.4,
   "battery_brand": "ZTT",
   "inverter_kw": 6,
   "inverter_brand": "DEYE",
   "price": 306000,
   "monthly_installment": "3,2xx",
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 7.3,
   "panel_count": 10,
   "panel_watt": 730,
   "inverter_model": "SUN-6K-SG04LP1-EU-SM2",
   "battery_model": "EHB48100R16S1P05K02",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 7.3 kWp",
    "q": 1,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 10,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ DEYE ( MODEL : SUN-6K-SG04LP1-EU-SM2 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "ตู้แร็ค 15U ขนาด 600x550x770 พร้อมอุปกรณ์ จำนวน",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "BATTERY MODULE - EHB48100R16S1P05K02,51.2VDC,102AH (Lithium-ion battery pack, IP21) ขนาด 10.44 kWh จำนวน",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 11
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 12
   }
  ]
 },
 {
  "old_id": 5,
  "old_name": "Solar Rooftop ขนาด 7 kWp + แบตเตอรี่ 9.6 kWh (30/100A) 3 เฟส",
  "old_price": 331000,
  "pkg": {
   "name": "7 kWp+Hybrid_3 เฟส",
   "kwp": 7,
   "phase": 3,
   "has_battery": 1,
   "battery_kwh": 10.4,
   "battery_brand": "ZTT",
   "inverter_kw": 8,
   "inverter_brand": "DEYE",
   "price": 331000,
   "monthly_installment": "3,5xx",
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 7.3,
   "panel_count": 10,
   "panel_watt": 730,
   "inverter_model": "SUN-8K-SG05LP3-EU-SM2",
   "battery_model": "EHB48100R16S1P05K02",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 7.3 kWp",
    "q": 3,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 10,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ DEYE ( MODEL : SUN-8K-SG05LP3-EU-SM2 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "ตู้แร็ค 15U ขนาด 600x550x770 พร้อมอุปกรณ์ จำนวน",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "BATTERY MODULE - EHB48100R16S1P05K02,51.2VDC,102AH (Lithium-ion battery pack, IP21) ขนาด 10.44 kWh จำนวน",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 11
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 12
   }
  ]
 },
 {
  "old_id": 6,
  "old_name": "Solar Rooftop ขนาด 10 kWp + แบตเตอรี่ 9.6 kWh (30/100A) 1 เฟส",
  "old_price": 393000,
  "pkg": {
   "name": "10 kWp+Hybrid_1 เฟส",
   "kwp": 10,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 10.4,
   "battery_brand": "ZTT",
   "inverter_kw": 10,
   "inverter_brand": "DEYE",
   "price": 393000,
   "monthly_installment": "4,2xx",
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 9.49,
   "panel_count": 13,
   "panel_watt": 730,
   "inverter_model": "SUN-10K-SG02LP1-EU-AM3",
   "battery_model": "EHB48100R16S1P05K02",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 9.49 kWp",
    "q": 1,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 13,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ DEYE ( MODEL : SUN-10K-SG02LP1-EU-AM3 ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "ตู้แร็ค 15U ขนาด 600x550x770 พร้อมอุปกรณ์ จำนวน",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "BATTERY MODULE - EHB48100R16S1P05K02,51.2VDC,102AH (Lithium-ion battery pack, IP21) ขนาด 10.44 kWh จำนวน",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 11
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 12
   }
  ]
 },
 {
  "old_id": 7,
  "old_name": "Solar Rooftop ขนาด 10 kWp + แบตเตอรี่ 9.6 kWh (30/100A) 3 เฟส",
  "old_price": 407000,
  "pkg": {
   "name": "10 kWp+Hybrid_3 เฟส",
   "kwp": 10,
   "phase": 3,
   "has_battery": 1,
   "battery_kwh": 10.4,
   "battery_brand": "ZTT",
   "inverter_kw": 10,
   "inverter_brand": "DEYE",
   "price": 407000,
   "monthly_installment": "4,4xx",
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": 9.49,
   "panel_count": 13,
   "panel_watt": 730,
   "inverter_model": "SUN-10K-SG04LP3-EU",
   "battery_model": "EHB48100R16S1P05K02",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดติดตั้งรวม 9.49 kWp",
    "q": 3,
    "u": "เฟส",
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 13,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "INVERTER ยี่ห้อ DEYE ( MODEL : SUN-10K-SG04LP3-EU ) หรือเทียบเท่า จำนวน",
    "q": 1,
    "u": "เครื่อง",
    "s": 2
   },
   {
    "n": "ตู้แร็ค 15U ขนาด 600x550x770 พร้อมอุปกรณ์ จำนวน",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "BATTERY MODULE - EHB48100R16S1P05K02,51.2VDC,102AH (Lithium-ion battery pack, IP21) ขนาด 10.44 kWh จำนวน",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONTROLLER BOX ( AC/DC BOX )",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   },
   {
    "n": "GROUNDING SYSTEM AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 10
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 11
   },
   {
    "n": "OPERATION AND MAINTENANCE AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 12
   }
  ]
 },
 {
  "old_id": 26,
  "old_name": "เพิ่ม แบตเตอรี่ 4.8 kWh",
  "old_price": 43000,
  "pkg": {
   "name": "เพิ่มแบต 5.22 kWh",
   "kwp": 0,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 5.2,
   "battery_brand": "Bat 4.8 kWh ZTT",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 43000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 0,
   "has_panel": 0,
   "has_inverter": 0,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": null,
   "panel_cost_per_unit": null,
   "remark": "Not present in approved Excel quotation V0",
   "installed_kwp": null,
   "panel_count": null,
   "panel_watt": null,
   "inverter_model": null,
   "battery_model": "EHB48100R16S1P05K02",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 5.22 kWh",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "BATTERY MODULE - EHB48100R16S1P05K02,51.2VDC,102AH (Lithium-ion battery pack, IP21) ขนาด 5.22 kWh จำนวน",
    "q": 1,
    "u": "ลูก",
    "s": 1
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   }
  ]
 },
 {
  "old_id": 18,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 7 kWh (ระบบ On-Grid เดิม 3 kWp)",
  "old_price": 148000,
  "pkg": {
   "name": "เพิ่มแบต 7 kWh เดิม 3kW",
   "kwp": 3,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 7,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 148000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 0,
   "has_inverter": 0,
   "existing_kw": 3,
   "additional_kwp": null,
   "battery_count": 1,
   "battery_cost": 65000,
   "bms_count": 1,
   "bms_cost": 29900,
   "panel_brand": null,
   "panel_cost_per_unit": null,
   "remark": "สำหรับลูกค้าเดิมที่ติด HUAWEI inverter",
   "installed_kwp": null,
   "panel_count": null,
   "panel_watt": null,
   "inverter_model": null,
   "battery_model": "LUNA2000-7-E1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 7 kWh (ระบบเดิม 3 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-7-E1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   }
  ]
 },
 {
  "old_id": 19,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 7 kWh (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 148000,
  "pkg": {
   "name": "เพิ่มแบต 7 kWh เดิม 5kW",
   "kwp": 5,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 7,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 148000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 0,
   "has_inverter": 0,
   "existing_kw": 5,
   "additional_kwp": null,
   "battery_count": 1,
   "battery_cost": 65000,
   "bms_count": 1,
   "bms_cost": 29900,
   "panel_brand": null,
   "panel_cost_per_unit": null,
   "remark": "สำหรับลูกค้าเดิมที่ติด HUAWEI inverter",
   "installed_kwp": null,
   "panel_count": null,
   "panel_watt": null,
   "inverter_model": null,
   "battery_model": "LUNA2000-7-E1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 7 kWh (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-7-E1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   }
  ]
 },
 {
  "old_id": 20,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 14 kWh (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 240000,
  "pkg": {
   "name": "เพิ่มแบต 14 kWh เดิม 5kW",
   "kwp": 5,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 14,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 240000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 0,
   "has_inverter": 0,
   "existing_kw": 5,
   "additional_kwp": null,
   "battery_count": 2,
   "battery_cost": 130000,
   "bms_count": 1,
   "bms_cost": 29900,
   "panel_brand": null,
   "panel_cost_per_unit": null,
   "remark": "สำหรับลูกค้าเดิมที่ติด HUAWEI inverter",
   "installed_kwp": null,
   "panel_count": null,
   "panel_watt": null,
   "inverter_model": null,
   "battery_model": "LUNA2000-14-S1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 14 kWh (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-14-S1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 8
   }
  ]
 },
 {
  "old_id": 24,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 7 kWh + PV Module 2 แผง (ระบบ On-Grid เดิม 3 kWp)",
  "old_price": 157000,
  "pkg": {
   "name": "เพิ่มแบต 7 kWh + 2 แผง(เดิม 3k)",
   "kwp": 3,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 7,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 157000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": null,
   "panel_count": 2,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": "LUNA2000-7-E1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 7 kWh (ระบบเดิม 3 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-7-E1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 2,
    "u": "แผง",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   }
  ]
 },
 {
  "old_id": 27,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 7 kWh + PV Module 2 แผง (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 157000,
  "pkg": {
   "name": "เพิ่มแบต 7 kWh + 2 แผง(เดิม 5k)",
   "kwp": 5,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 7,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 157000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 1,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": null,
   "panel_count": 2,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": "LUNA2000-7-E1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 7 kWh (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-7-E1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 2,
    "u": "แผง",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   }
  ]
 },
 {
  "old_id": 23,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 14 kWh + PV Module 3 แผง (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 255000,
  "pkg": {
   "name": "เพิ่มแบต 14 kWh+3 แผง(เดิม 5k)",
   "kwp": 7,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 14,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 255000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": 5,
   "additional_kwp": 1.9,
   "battery_count": 2,
   "battery_cost": 130000,
   "bms_count": 1,
   "bms_cost": 29900,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": 2880,
   "remark": "เพิ่ม 3 แผง 1.9 kWp + Batt 14 kWh · ลูกค้า HUAWEI เท่านั้น",
   "installed_kwp": null,
   "panel_count": 3,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": "LUNA2000-14-S1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 14 kWh (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-14-S1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 3,
    "u": "แผง",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   }
  ]
 },
 {
  "old_id": 28,
  "old_name": "เพิ่ม PV Module 2 แผง เป็น Scale 4.4 kWp (ระบบ On-Grid เดิม 3 kWp)",
  "old_price": 14000,
  "pkg": {
   "name": "3 kWp(เดิม)+2 แผง",
   "kwp": 3,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 14000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": null,
   "panel_count": 2,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งเพิ่มแผงโซลาร์เซลล์ (ระบบเดิม 3 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 2,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   }
  ]
 },
 {
  "old_id": 29,
  "old_name": "เพิ่ม PV Module 3 แผง เป็น Scale 5 kWp (ระบบ On-Grid เดิม 3 kWp)",
  "old_price": 21000,
  "pkg": {
   "name": "3 kWp(เดิม)+3 แผง",
   "kwp": 3,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 21000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": null,
   "panel_count": 3,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งเพิ่มแผงโซลาร์เซลล์ (ระบบเดิม 3 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 3,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   }
  ]
 },
 {
  "old_id": 30,
  "old_name": "เพิ่ม PV Module 2 แผง เป็น Scale 6.4 kWp (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 14000,
  "pkg": {
   "name": "5 kWp(เดิม)+2 แผง",
   "kwp": 5,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 14000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": null,
   "panel_count": 2,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งเพิ่มแผงโซลาร์เซลล์ (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 2,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   }
  ]
 },
 {
  "old_id": 31,
  "old_name": "เพิ่ม PV Module 3 แผง เป็น Scale 7 kWp (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 21000,
  "pkg": {
   "name": "5 kWp(เดิม)+3 แผง",
   "kwp": 5,
   "phase": 1,
   "has_battery": 0,
   "battery_kwh": null,
   "battery_brand": null,
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 21000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": null,
   "additional_kwp": null,
   "battery_count": null,
   "battery_cost": null,
   "bms_count": null,
   "bms_cost": null,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": null,
   "remark": null,
   "installed_kwp": null,
   "panel_count": 3,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": null,
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งเพิ่มแผงโซลาร์เซลล์ (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 3,
    "u": "แผง",
    "s": 1
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 3
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   }
  ]
 },
 {
  "old_id": 22,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 7 kWh + PV Module 3 แผง (ระบบ On-Grid เดิม 5 kWp)",
  "old_price": 163000,
  "pkg": {
   "name": "เพิ่มแบต 7 kWh + 3 แผง(เดิม 5k)",
   "kwp": 7,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 7,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 163000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": 5,
   "additional_kwp": 1.9,
   "battery_count": 1,
   "battery_cost": 65000,
   "bms_count": 1,
   "bms_cost": 29900,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": 2880,
   "remark": "เพิ่ม 3 แผง 1.9 kWp + Batt 7 kWh · ลูกค้า HUAWEI เท่านั้น",
   "installed_kwp": null,
   "panel_count": 3,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": "LUNA2000-7-E1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 7 kWh (ระบบเดิม 5 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-7-E1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 3,
    "u": "แผง",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   }
  ]
 },
 {
  "old_id": 21,
  "old_name": "เพิ่มแบตเตอรี่ ความจุ 7 kWh + PV Module 3 แผง (ระบบ On-Grid เดิม 3 kWp)",
  "old_price": 163000,
  "pkg": {
   "name": "เพิ่มแบต 7 kWh + 3 แผง(เดิม 3k)",
   "kwp": 5,
   "phase": 1,
   "has_battery": 1,
   "battery_kwh": 7,
   "battery_brand": "HUAWEI",
   "inverter_kw": null,
   "inverter_brand": null,
   "price": 163000,
   "monthly_installment": null,
   "monthly_saving": null,
   "warranty_years": 10,
   "is_upgrade": 1,
   "has_panel": 1,
   "has_inverter": 0,
   "existing_kw": 3,
   "additional_kwp": 1.9,
   "battery_count": 1,
   "battery_cost": 65000,
   "bms_count": 1,
   "bms_cost": 29900,
   "panel_brand": "TRINA SOLAR รุ่น Vertex N",
   "panel_cost_per_unit": 2880,
   "remark": "เพิ่ม 3 แผง 1.9 kWp + Batt 7 kWh · ลูกค้า HUAWEI เท่านั้น",
   "installed_kwp": null,
   "panel_count": 3,
   "panel_watt": 730,
   "inverter_model": null,
   "battery_model": "LUNA2000-7-E1",
   "is_other": 0
  },
  "items": [
   {
    "n": "งานจ้างเหมาติดตั้งระบบแบตเตอรี่ ขนาดติดตั้ง แบตเตอรี่ 7 kWh (ระบบเดิม 3 kWp)",
    "q": 1,
    "u": null,
    "s": 0
   },
   {
    "n": "HUAWEI POWER MODULE, LUNA2000-10KW-C1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 1
   },
   {
    "n": "HUAWEI BATTERY MODULE, LUNA2000-7-E1 (10 YEARS WARRANTY)",
    "q": 1,
    "u": "SET",
    "s": 2
   },
   {
    "n": "PV MODULE ยี่ห้อ TRINA SOLAR รุ่น Vertex N หรือ เทียบเท่า ขนาด 730 W จำนวน",
    "q": 3,
    "u": "แผง",
    "s": 3
   },
   {
    "n": "MOUNTING AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 4
   },
   {
    "n": "CONDUIT AND WIREWAY AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 5
   },
   {
    "n": "DC SOLAR CABEL AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 6
   },
   {
    "n": "AC CABLE 1 SET AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 7
   },
   {
    "n": "INSTALL",
    "q": 1,
    "u": "SET",
    "s": 8
   },
   {
    "n": "OPERATION AND ACCESSORIES",
    "q": 1,
    "u": "SET",
    "s": 9
   }
  ]
 }
];

// ── connection ────────────────────────────────────────────────────────────
const dbArg = process.argv.find(a => a.startsWith('--db='));
if (!dbArg) { console.error('ต้องระบุ --db=<database>'); process.exit(1); }
const database = dbArg.split('=')[1];
if (!database) { console.error('--db ว่าง'); process.exit(1); }

const envPath = path.join(process.cwd(), '.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const PKG_COLS = Object.keys(DATA[0].pkg);
const typeOf = (col, v) =>
  v === null ? sql.NVarChar(sql.MAX)
  : col === 'name' ? sql.NVarChar(100)
  : typeof v === 'number' ? sql.Decimal(18, 2)
  : sql.NVarChar(500);

let pool;
try {
  pool = await new sql.ConnectionPool({
    server: env.DB_SERVER, port: Number(env.DB_PORT || 1433),
    user: env.DB_USER, password: env.DB_PASSWORD, database,
    options: { encrypt: false, trustServerCertificate: true, useUTC: false },
  }).connect();

  console.log(`ฐานข้อมูล: ${database} · จะสร้าง package ใหม่ ${DATA.length} ตัว (ราคาเท่าเดิม)`);

  // ── ตรวจก่อนแตะ: package เดิมต้องมีจริงและชื่อ/ราคาตรงกับที่ทดสอบไว้ ──
  const problems = [];
  for (const d of DATA) {
    const r = (await pool.request().input('i', sql.Int, d.old_id)
      .query('SELECT name, price FROM packages WHERE id=@i')).recordset[0];
    if (!r) { problems.push(`id=${d.old_id} ไม่มีในฐานข้อมูล`); continue; }
    if (r.name !== d.old_name) problems.push(`id=${d.old_id} ชื่อไม่ตรง: มี "${r.name}" คาดว่า "${d.old_name}"`);
    if (Number(r.price) !== d.old_price) problems.push(`id=${d.old_id} ราคาไม่ตรง: มี ${r.price} คาดว่า ${d.old_price}`);
  }
  if (problems.length) {
    console.error('❌ ข้อมูลต้นทางไม่ตรงกับที่ทดสอบไว้ — ยกเลิกทั้งหมด');
    problems.forEach(p => console.error('   ' + p));
    process.exit(1);
  }
  console.log('✓ ตรวจ package ต้นทางครบ 23 ตัว ชื่อและราคาตรงทั้งหมด');

  // ── ลงมือ ────────────────────────────────────────────────────────────────
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    let created = 0, skipped = 0;
    for (const d of DATA) {
      const dup = (await new sql.Request(tx).input('n', sql.NVarChar(100), d.pkg.name)
        .query('SELECT id FROM packages WHERE name=@n')).recordset;
      if (dup.length) { console.log(`  – ข้าม "${d.pkg.name}" (มีอยู่แล้ว id=${dup.map(x => x.id).join(',')})`); skipped++; continue; }

      const rq = new sql.Request(tx);
      PKG_COLS.forEach((c, i) => rq.input('p' + i, typeOf(c, d.pkg[c]), d.pkg[c]));
      rq.input('sd', sql.Date, START).input('ed', sql.Date, EXPIRE);
      const ins = await rq.query(`
        INSERT INTO packages (${PKG_COLS.map(c => `[${c}]`).join(',')}, created_at, start_date, expire_date, is_active)
        OUTPUT INSERTED.id
        VALUES (${PKG_COLS.map((_, i) => '@p' + i).join(',')}, GETDATE(), @sd, @ed, 1)`);
      const nid = ins.recordset[0].id;

      for (const it of d.items)
        await new sql.Request(tx)
          .input('p', sql.Int, nid).input('n', sql.NVarChar(500), it.n)
          .input('q', sql.Decimal(10, 2), it.q).input('u', sql.NVarChar(50), it.u)
          .input('s', sql.Int, it.s)
          .query('INSERT package_items(package_id,item_name,quantity,unit,sort_order) VALUES(@p,@n,@q,@u,@s)');

      await new sql.Request(tx)
        .input('p', sql.Int, nid).input('pr', sql.Decimal(12, 2), d.old_price)
        .input('mi', sql.NVarChar(20), d.pkg.monthly_installment)
        .input('ms', sql.Decimal(10, 2), d.pkg.monthly_saving)
        .input('sd', sql.Date, START).input('ed', sql.Date, EXPIRE)
        .input('note', sql.NVarChar(200), 'ชุดอุปกรณ์ใหม่ ส.ค. 2569 (ราคาเท่าเดิม)')
        .query(`INSERT package_price_periods(package_id,price,monthly_installment,monthly_saving,
                  start_date,expire_date,is_active,note,created_by)
                VALUES(@p,@pr,@mi,@ms,@sd,@ed,1,@note,1)`);

      await new sql.Request(tx).input('i', sql.Int, d.old_id).input('c', sql.Date, CUTOFF)
        .query('UPDATE packages SET is_active=0, expire_date=@c WHERE id=@i');
      await new sql.Request(tx).input('i', sql.Int, d.old_id).input('c', sql.Date, CUTOFF)
        .query('UPDATE package_price_periods SET expire_date=@c, is_active=0 WHERE package_id=@i AND is_active=1');

      console.log(`  ✓ ${String(d.pkg.name).padEnd(32)} ใหม่ id=${String(nid).padStart(3)} · ราคา ${d.old_price} · รายการ ${d.items.length} · ปิด id=${d.old_id}`);
      created++;
    }
    await tx.commit();
    console.log(`\nสำเร็จ — สร้าง ${created} · ข้าม ${skipped}`);
  } catch (e) { await tx.rollback(); throw e; }

  // ── ตรวจหลังทำ ───────────────────────────────────────────────────────────
  const q = async (s) => (await pool.request().query(s)).recordset[0].n;
  const bad1 = await q('SELECT COUNT(*) n FROM packages WHERE is_active=1 AND id NOT IN (SELECT package_id FROM package_price_periods WHERE is_active=1)');
  const bad2 = await q('SELECT COUNT(*) n FROM packages WHERE is_active=0 AND id IN (SELECT package_id FROM package_price_periods WHERE is_active=1)');
  const bad3 = await q('SELECT COUNT(*) n FROM packages p WHERE is_active=1 AND NOT EXISTS(SELECT 1 FROM package_items i WHERE i.package_id=p.id AND i.is_active=1)');
  const act = await q('SELECT COUNT(*) n FROM packages WHERE is_active=1');
  console.log(`ตรวจ: active=${act} · active ไม่มีช่วงราคา=${bad1} · ปิดแล้วช่วงราคายังเปิด=${bad2} · active ไม่มีรายการ=${bad3}`);
  if (bad1 || bad2 || bad3) { console.error('❌ ตรวจไม่ผ่าน'); process.exit(1); }
} catch (e) {
  console.error('❌ ล้มเหลว:', e.message);
  process.exit(1);
} finally {
  if (pool) await pool.close();
}
