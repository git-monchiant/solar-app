import assert from "node:assert/strict";
import {
  getQuotationLegalContent,
  getQuotationTermsProfile,
  getStandardQuotationPaymentTerms,
} from "../../src/lib/quotation-terms.ts";

const onGrid = {
  name: "5 kWp",
  is_upgrade: false,
  has_panel: true,
  has_inverter: true,
  has_battery: false,
};
const hybrid = {
  name: "7 kWp 1 เฟส + Battery",
  is_upgrade: false,
  has_panel: true,
  has_inverter: true,
  has_battery: true,
};
const scaleUp = {
  name: "Scale Up: เดิม 3 kW + Batt 7 kWh",
  is_upgrade: true,
  has_panel: false,
  has_inverter: false,
  has_battery: true,
};
const batteryOnly = {
  name: "Battery 4.8 kWh ZTT",
  is_upgrade: false,
  has_panel: false,
  has_inverter: false,
  has_battery: true,
};

assert.equal(getQuotationTermsProfile(onGrid), "full_install");
assert.equal(getQuotationTermsProfile(hybrid), "full_install");
assert.equal(getQuotationTermsProfile(scaleUp), "additional_install");
assert.equal(getQuotationTermsProfile(batteryOnly), "additional_install");

const fullInstall = getQuotationLegalContent(onGrid, 7, "ข้อความเพิ่มเติม");
assert.equal(fullInstall.page1Sections[1].title, "2. หมายเหตุ (กรณีติดตั้งใหม่ทั้งระบบ)");
assert.ok(fullInstall.page2Sections.some((section) => section.title.startsWith("3. การดำเนินงาน")));
assert.ok(fullInstall.page2Sections.flatMap((section) => section.paragraphs).includes("4.4) ข้อความเพิ่มเติม"));

const additionalInstall = getQuotationLegalContent(scaleUp, 7, "ข้อความเพิ่มเติม");
assert.equal(additionalInstall.page1Sections[1].title, "2. เงื่อนไขรับประกันงานติดตั้ง (กรณีเฉพาะติดตั้งเพิ่ม)");
assert.deepEqual(
  additionalInstall.page2Sections.map((section) => section.title),
  ["3. เงื่อนไขเพิ่มเติม"],
);
assert.ok(additionalInstall.page2LeadingParagraphs[0].includes("เฉพาะอุปกรณ์ที่ติดตั้งเพิ่มเท่านั้น"));
assert.ok(additionalInstall.page2Sections[0].paragraphs.includes("3.4) ข้อความเพิ่มเติม"));
assert.ok(!JSON.stringify(additionalInstall).includes("O&M"));

assert.deepEqual(getStandardQuotationPaymentTerms(), [
  {
    label: "งวดที่ 1 ชำระ",
    percent: 20,
    due: "ภายใน 7 วัน นับจากวันที่ในใบเสนอราคา",
  },
  {
    label: "งวดที่ 2 ชำระ",
    percent: 80,
    due: "ภายใน 3 วัน ก่อนวันติดตั้ง",
  },
]);

console.log("quotation terms/payment tests passed");
