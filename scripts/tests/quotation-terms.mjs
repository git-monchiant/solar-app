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

// ── packages.term_set_profile ชนะกติกาเดา ──
// ค่าที่แอดมินตั้งไว้ต้องมาก่อน ทั้งสองทิศทาง
assert.equal(
  getQuotationTermsProfile({ ...onGrid, term_set_profile: "additional_install" }),
  "additional_install",
);
assert.equal(
  getQuotationTermsProfile({ ...scaleUp, term_set_profile: "full_install" }),
  "full_install",
);
// ยังไม่ได้ตั้งค่า / ค่าพัง → ถอยไปใช้กติกาเดาแบบเดิม ไม่ใช่ throw และไม่ใช่ default ตายตัว
for (const unset of [null, undefined, "", "  ", "FULL_INSTALL", "อะไรก็ไม่รู้", 1, true, {}]) {
  assert.equal(
    getQuotationTermsProfile({ ...scaleUp, term_set_profile: unset }),
    "additional_install",
    `term_set_profile=${JSON.stringify(unset)} ต้องถอยไปใช้กติกาเดา`,
  );
  assert.equal(getQuotationTermsProfile({ ...onGrid, term_set_profile: unset }), "full_install");
}
// snapshot ของใบเก่าที่แช่แข็งไว้ก่อนมีคอลัมน์นี้ต้องได้ผลเท่าเดิม
assert.equal(getQuotationTermsProfile({ name: "10 kWp+Hybrid_1 เฟส" }), "full_install");

// ข้อความจริงต้องสลับตามค่าที่ตั้ง ไม่ใช่แค่ค่า profile
const forcedAdditional = getQuotationLegalContent(
  { ...onGrid, term_set_profile: "additional_install" }, 7, "",
);
assert.ok(
  !forcedAdditional.page2Sections.some((section) => section.title.includes("การดำเนินงาน")),
  "ตั้งเป็นชุดติดตั้งเพิ่มแล้วต้องไม่มีหัวข้อ O&M",
);

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
assert.ok(customizedLegal.page2Sections[0].paragraphs[0].includes("ล้างแผงโซลาร์เซลล์ ปีละ 1 ครั้ง"));
assert.ok(customizedLegal.page2Sections[0].paragraphs[1].includes("ปีละ 2 ครั้ง"));
assert.equal(customizedLegal.page2Sections[0].paragraphs.length, 2);

const withoutOm = getQuotationLegalContent(onGrid, 7, "ข้อความเพิ่มเติม", {
  ...getStandardQuotationOmSettings(),
  enabled: false,
});
assert.equal(withoutOm.page2LeadingParagraphs.some((text) => text.includes("O&M")), false);
assert.deepEqual(withoutOm.page2Sections.map((section) => section.title), ["3. เงื่อนไขเพิ่มเติม"]);
assert.ok(withoutOm.page2Sections[0].paragraphs.includes("3.4) ข้อความเพิ่มเติม"));

// ── เฟส 0: ถ้อยคำที่แช่แข็งลง snapshot ต้องเท่ากับที่ PDF route เคยคำนวณสด ──
// buildQuotationDocumentSnapshot ส่ง `inputs.om` ตรง ๆ ส่วน quotation-pdf route
// เดิมส่ง `parseDocumentInputs(snapshot.financial.inputs).om` คือ om ที่ถูก parse
// ซ้ำอีกรอบ สองทางจะให้ผลเท่ากันก็ต่อเมื่อ parseQuotationOmSettings เป็น idempotent
const omShapes = [
  undefined,
  getStandardQuotationOmSettings(),
  customizedOm,
  { ...getStandardQuotationOmSettings(), enabled: false },
  { coverage_years: 2, cleaning: { visits_per_year: 9, years: 9 } },
];
for (const om of omShapes) {
  const once = parseQuotationOmSettings(om);
  assert.deepEqual(parseQuotationOmSettings(once), once, "parseQuotationOmSettings ต้อง idempotent");
}
for (const pkg of [onGrid, hybrid, scaleUp, batteryOnly]) {
  for (const om of omShapes) {
    assert.equal(
      JSON.stringify(getQuotationLegalContent(pkg, 7, "ข้อความเพิ่มเติม", om)),
      JSON.stringify(
        getQuotationLegalContent(pkg, 7, "ข้อความเพิ่มเติม", parseQuotationOmSettings(om)),
      ),
      `ถ้อยคำต้องตรงกันทุกตัวอักษร: ${pkg.name}`,
    );
  }
}

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
