import assert from "node:assert/strict";
import {
  balanceFinalQuotationPaymentTerm,
  getQuotationLegalContent,
  getQuotationPaymentTermsTotal,
  getQuotationTermsProfile,
  getStandardQuotationOmSettings,
  isStandardQuotationOmSettings,
  parseQuotationOmSettings,
  getStandardQuotationPaymentTerms,
  parseQuotationPaymentTerms,
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

assert.deepEqual(parseQuotationOmSettings(undefined), getStandardQuotationOmSettings());
assert.equal(isStandardQuotationOmSettings(undefined), true);
const customizedOm = parseQuotationOmSettings({
  coverage_years: 3,
  cleaning: { enabled: true, visits_per_year: 1, years: 3 },
  thermoscan: { enabled: true, visits_per_year: 2, years: 2 },
  visual_inspection: { enabled: false, visits_per_year: 2, years: 2 },
});
assert.equal(isStandardQuotationOmSettings(customizedOm), false);
assert.equal(customizedOm.coverage_years, 3);
assert.equal(customizedOm.cleaning.visits_per_year, 1);
assert.equal(parseQuotationOmSettings({ coverage_years: 0 }).coverage_years, 0);
assert.equal(parseQuotationOmSettings({ cleaning: { visits_per_year: 9 } }).cleaning.visits_per_year, 4);
const customizedLegal = getQuotationLegalContent(onGrid, 7, "", customizedOm);
assert.ok(customizedLegal.page2LeadingParagraphs[1].includes("O&M เป็นเวลา 3 ปี"));
assert.ok(customizedLegal.page2Sections[0].paragraphs[0].includes("1 ครั้งต่อปี"));
assert.ok(customizedLegal.page2Sections[0].paragraphs[1].includes("ปีละ 2 ครั้ง"));
assert.equal(customizedLegal.page2Sections[0].paragraphs.length, 2);

const withoutOm = getQuotationLegalContent(onGrid, 7, "ข้อความเพิ่มเติม", {
  ...getStandardQuotationOmSettings(),
  enabled: false,
});
assert.equal(withoutOm.page2LeadingParagraphs.some((text) => text.includes("O&M")), false);
assert.deepEqual(withoutOm.page2Sections.map((section) => section.title), ["3. เงื่อนไขเพิ่มเติม"]);
assert.ok(withoutOm.page2Sections[0].paragraphs.includes("3.4) ข้อความเพิ่มเติม"));

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

const customPaymentTerms = parseQuotationPaymentTerms([
  { label: "งวดที่ 1 ชำระ", percent: 20, due: "วันทำสัญญา" },
  { label: "งวดที่ 2 ชำระ", percent: 30, due: "ก่อนติดตั้ง" },
  { label: "งวดที่ 3 ชำระ", percent: 50, due: "หลังติดตั้ง" },
]);
assert.equal(customPaymentTerms.length, 3);
assert.equal(getQuotationPaymentTermsTotal(customPaymentTerms), 100);
assert.equal(
  getQuotationPaymentTermsTotal([
    ...customPaymentTerms,
    { label: "กำลังแก้ไข", percent: Number.NaN, due: "" },
  ]),
  100,
);
assert.deepEqual(
  parseQuotationPaymentTerms(JSON.stringify(customPaymentTerms)),
  customPaymentTerms,
);

assert.deepEqual(
  balanceFinalQuotationPaymentTerm([
    { label: "งวดที่ 1", percent: 35, due: "" },
    { label: "งวดที่ 2", percent: 80, due: "" },
    { label: "งวดที่ 3", percent: 0, due: "" },
  ]).map((term) => term.percent),
  [35, 65, 0],
);
assert.deepEqual(
  balanceFinalQuotationPaymentTerm([
    { label: "งวดที่ 1", percent: 25, due: "" },
    { label: "งวดที่ 2", percent: 0, due: "" },
  ]).map((term) => term.percent),
  [25, 75],
);

console.log("quotation terms/payment tests passed");
