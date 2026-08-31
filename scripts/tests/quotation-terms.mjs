import assert from "node:assert/strict";
import {
  countQuotationRowLines,
  getQuotationRowCapacity,
  measureQuotationPageFit,
} from "../../src/lib/quotation-page-fit.ts";
import {
  balanceFinalQuotationPaymentTerm,
  fillQuotationTermText,
  isQuotationTermVisible,
  renderQuotationTermTree,
  getQuotationLegalContent,
  getQuotationTermNumbering,
  getQuotationPaymentTermsTotal,
  getQuotationTermsProfile,
  getStandardQuotationOmSettings,
  seedQuotationTermTree,
  isStandardQuotationOmSettings,
  parseQuotationOmSettings,
  parseQuotationTermTree,
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


// ── ตัวแก้ไขโชว์ข้อความสุดท้าย ไม่โชว์ {{...}} ──
// เป็นสัญญาระหว่าง lib กับหน้าจอ: หน้าจอโชว์ผลของ fillQuotationTermText
// แล้วเก็บกลับเป็นข้อความดิบเมื่อค่าที่พิมพ์ต่างจากผลนั้น
{
  const om = getStandardQuotationOmSettings();
  const tree = seedQuotationTermTree("full_install");
  const validityLine = tree.sections
    .flatMap((section) => section.lines)
    .find((line) => line.body.includes("{{valid_days}}"));
  assert.ok(validityLine, "ต้องยังมีบรรทัดที่ใช้ {{valid_days}}");

  assert.equal(
    fillQuotationTermText(validityLine.body, { validDays: 15, om }),
    "ยืนยันราคาภายใน 15 วัน นับจากวันที่ออกเอกสารใบเสนอราคา",
  );
  // เปลี่ยนจำนวนวัน แล้วข้อความที่โชว์ต้องเปลี่ยนตาม (บรรทัดที่ยังไม่ถูกแก้)
  assert.notEqual(
    fillQuotationTermText(validityLine.body, { validDays: 7, om }),
    fillQuotationTermText(validityLine.body, { validDays: 30, om }),
  );

  // ค่าเฉพาะบริการ O&M ต้องแทนได้เฉพาะในหัวข้อ om_services เท่านั้น
  const omSection = tree.sections.find((section) => section.kind === "om_services");
  const cleaning = omSection.lines.find((line) => line.key === "om-cleaning");
  const inOm = fillQuotationTermText(cleaning.body, {
    validDays: 7, om, lineKey: cleaning.key, sectionKind: "om_services",
  });
  assert.ok(/ปีละ [0-9]+ ครั้ง/.test(inOm), inOm);
  assert.ok(!inOm.includes("{{"), inOm);
  // นอกหัวข้อ O&M ค่าพวกนี้ไม่มีให้แทน ต้องกลายเป็นค่าว่าง ไม่ใช่ปล่อย {{...}} หลุด
  const outsideOm = fillQuotationTermText(cleaning.body, { validDays: 7, om });
  assert.ok(!outsideOm.includes("{{"), outsideOm);

  // ไม่มีตัวไหนหลุดออกหน้าจอเป็น {{...}} ทั้งชื่อหัวข้อและทุกบรรทัด
  for (const section of tree.sections) {
    assert.ok(!fillQuotationTermText(section.title, { validDays: 7, om }).includes("{{"), section.title);
    for (const line of section.lines) {
      const shown = fillQuotationTermText(line.body, {
        validDays: 7, om, lineKey: line.key, sectionKind: section.kind,
      });
      assert.ok(!shown.includes("{{"), line.body);
    }
  }
}

// ── ตัดสายผูก O&M ตอนผู้ใช้เริ่มแก้ (materialize ในตัวแก้ไข) ──
// หน้าจอไม่มีที่ตั้งค่า O&M แล้ว บรรทัดที่ค่า O&M ซ่อนอยู่จึงต้องถูกย้ายไปกอง
// "ลบแล้ว" แทนที่จะหายไปเฉย ๆ — เอกสารต้องออกมาเหมือนเดิมทุกตัวอักษร
{
  const cloneTree = (v) => JSON.parse(JSON.stringify(v));
  const materialize = (source, om, validDays) => {
    const draft = cloneTree(source);
    const removed = [...(draft.removed ?? [])];
    for (const section of draft.sections) {
      const sectionHidden = !isQuotationTermVisible(section.showWhen, om);
      const keep = [];
      for (const line of section.lines) {
        const next = { ...line, body: fillQuotationTermText(line.body, {
          validDays, om, lineKey: line.key, sectionKind: section.kind, keep: ["valid_days"] }) };
        delete next.showWhen;
        if (sectionHidden || !isQuotationTermVisible(line.showWhen, om)) removed.push(next);
        else keep.push(next);
      }
      section.lines = keep;
      section.title = fillQuotationTermText(section.title, { validDays, om, keep: ["valid_days"] });
      delete section.showWhen;
    }
    if (removed.length) draft.removed = removed;
    else delete draft.removed;
    return draft;
  };

  const omShapes = [
    getStandardQuotationOmSettings(),
    { ...getStandardQuotationOmSettings(), enabled: false },
    customizedOm,
    parseQuotationOmSettings({ coverage_years: 0 }),
    parseQuotationOmSettings({ cleaning: { enabled: false }, thermoscan: { enabled: false }, visual_inspection: { enabled: false } }),
  ];
  let compared = 0;
  for (const profile of ["full_install", "additional_install"]) {
    for (const om of omShapes) {
      for (const validDays of [0, 7, 30]) {
        for (const extra of ["", "ข้อความเพิ่มเติมของใบนี้"]) {
          const seeded = seedQuotationTermTree(profile, extra);
          assert.equal(
            JSON.stringify(renderQuotationTermTree(materialize(seeded, om, validDays), { validDays, om })),
            JSON.stringify(renderQuotationTermTree(seeded, { validDays, om })),
            `แปลงต้นไม้แล้วเอกสารต้องเหมือนเดิม: ${profile} · validDays=${validDays}`,
          );
          compared++;
        }
      }
      // แปลงซ้ำต้องได้ผลเดิม ผู้ใช้แก้หลายรอบจะได้ไม่เพี้ยนสะสม
      const once = materialize(seedQuotationTermTree(profile), om, 7);
      assert.equal(JSON.stringify(materialize(once, om, 7)), JSON.stringify(once));
      // ไม่เหลือสายผูก O&M และไม่เหลือตัวแทนค่าอื่นนอกจาก valid_days
      const dump = JSON.stringify(once);
      assert.ok(!dump.includes("showWhen"), "ต้องไม่เหลือ showWhen");
      for (const found of dump.match(/{{s*([a-z_]+)s*}}/gi) ?? []) {
        assert.ok(found.includes("valid_days"), `ไม่ควรเหลือตัวแทนค่า ${found}`);
      }
    }
  }
  assert.ok(compared >= 60, `เทียบน้อยไป: ${compared}`);

  // ปิด O&M ทั้งหมดแล้ว บรรทัดต้องไม่หาย ต้องไปอยู่ในกอง "ลบแล้ว" ให้กดคืนได้
  const offOm = { ...getStandardQuotationOmSettings(), enabled: false };
  const seeded = seedQuotationTermTree("full_install");
  const materialized = materialize(seeded, offOm, 7);
  const before = seeded.sections.reduce((total, section) => total + section.lines.length, 0);
  const after =
    materialized.sections.reduce((total, section) => total + section.lines.length, 0) +
    (materialized.removed?.length ?? 0);
  assert.equal(after, before, "ปิด O&M แล้วบรรทัดต้องไม่หายไปไหน");
  assert.ok((materialized.removed?.length ?? 0) > 0, "บรรทัด O&M ต้องไปอยู่ในกองลบ");
}

// ── ลบเงื่อนไขออกหมด = ต้องไม่มีอะไรโผล่กลับมา ──
// เดิม parseQuotationTermTree คืน null เมื่อไม่เหลือหัวข้อ ผู้เรียกเลย fallback
// ไปชุด Master ทำให้ผู้ใช้ลบทิ้งหมดแล้วเงื่อนไขทั้งชุดยังขึ้นบน PDF
{
  const om = getStandardQuotationOmSettings();
  const pkg = { name: "10 kWp+Hybrid_1 เฟส", has_panel: true, has_inverter: true, has_battery: true };
  const emptyTree = { profile: "full_install", sections: [] };

  const parsed = parseQuotationTermTree(emptyTree, "full_install");
  assert.ok(parsed, "ต้นไม้ว่างต้องไม่ถูกตีเป็น null");
  assert.equal(parsed.sections.length, 0, "ต้องยังว่างอยู่");

  const legal = getQuotationLegalContent(pkg, 7, "ข้อความเพิ่มเติมเดิม", om, emptyTree);
  assert.equal(legal.page1Sections.length, 0);
  assert.equal(legal.page2Sections.length, 0);
  assert.equal(legal.page2LeadingParagraphs.length, 0);
  assert.ok(!JSON.stringify(legal).includes("PRODUCTION WARRANTY"), "ต้องไม่มีข้อความ Master หลงเหลือ");

  // เหลือหัวข้อเดียวก็ต้องได้หัวข้อเดียว ไม่ใช่ทั้งชุด
  const one = {
    profile: "full_install",
    sections: [{ key: "k1", title: "หัวข้อเดียว", page: 1, lines: [{ key: "l1", body: "ข้อความเดียว", page: 1 }] }],
  };
  const legalOne = getQuotationLegalContent(pkg, 7, "", om, one);
  assert.equal(legalOne.page1Sections.length, 1);
  assert.equal(legalOne.page1Sections[0].title, "1. หัวข้อเดียว");

  // ส่งหัวข้อมาแต่ใช้ไม่ได้สักอัน = ข้อมูลพัง ต้องถอยไปชุด Master เหมือนเดิม
  const broken = { profile: "full_install", sections: [{ title: "" }, null, 5] };
  assert.equal(parseQuotationTermTree(broken, "full_install"), null);
  assert.ok(getQuotationLegalContent(pkg, 7, "", om, broken).page1Sections.length > 0);
  // ไม่ส่ง terms มาเลยก็ยังได้ชุด Master
  assert.ok(getQuotationLegalContent(pkg, 7, "", om, null).page1Sections.length > 0);
}

// ── ลำดับในรายการ = ลำดับบนเอกสาร = เลขข้อ ──
// เอกสารมี 2 หน้า หัวข้อจึงมี page กำกับ แต่ "หน้า" ต้องไม่ทำให้ลำดับสลับ
// เดิมหัวข้อของหน้า 1 ที่อยู่ล่าง ๆ กระโดดขึ้นไปพิมพ์ก่อน เลขเลยอ่านได้เป็น 2,3,1,4,5
{
  const om = getStandardQuotationOmSettings();
  const cloneTree = (v) => JSON.parse(JSON.stringify(v));
  const newSection = (key, title) => ({
    key, title, page: 1, kind: "normal",
    lines: [{ key: `${key}-l`, body: `ข้อความ ${title}`, page: 1, origin: "custom" }],
  });
  const printed = (tree, omValue = om) => {
    const r = renderQuotationTermTree(tree, { validDays: 7, om: omValue });
    return {
      p1: r.page1Sections.map((s) => s.title),
      p2: r.page2Sections.map((s) => s.title),
      seq: [...r.page1Sections, ...r.page2Sections].map((s) => Number(s.title.split(".")[0])),
    };
  };

  // ชุด Master ต้องไม่เปลี่ยน
  const base = printed(seedQuotationTermTree("full_install"));
  assert.equal(base.p1.length, 2);
  assert.equal(base.p2.length, 2);
  assert.deepEqual(base.seq, [1, 2, 3, 4]);

  // เพิ่มท้ายสุด → เลขท้ายสุด และตกไปหน้า 2 เอง
  const atEnd = cloneTree(seedQuotationTermTree("full_install"));
  atEnd.sections.push(newSection("s-new", "หัวข้อใหม่"));
  const rEnd = printed(atEnd);
  assert.deepEqual(rEnd.seq, [1, 2, 3, 4, 5]);
  assert.ok(rEnd.p2[rEnd.p2.length - 1].startsWith("5."), rEnd.p2.join(" | "));

  // เลื่อนขึ้นบนสุด → เป็นข้อ 1 และขึ้นหน้า 1
  const atTop = cloneTree(seedQuotationTermTree("full_install"));
  atTop.sections.unshift(newSection("s-hi", "สวัสดี"));
  const rTop = printed(atTop);
  assert.deepEqual(rTop.seq, [1, 2, 3, 4, 5]);
  assert.equal(rTop.p1[0], "1. สวัสดี");

  // แทรกกลางระหว่างหัวข้อของหน้า 1 → ยังอยู่หน้า 1
  const mid = cloneTree(seedQuotationTermTree("full_install"));
  mid.sections.splice(2, 0, newSection("s-mid", "แทรกกลาง"));
  const rMid = printed(mid);
  assert.deepEqual(rMid.seq, [1, 2, 3, 4, 5]);
  assert.equal(rMid.p1[2], "3. แทรกกลาง");

  // วางหลังหัวข้อของหน้า 2 → ตกไปหน้า 2 เอง (ขึ้นหน้าใหม่แล้วไม่ย้อนกลับ)
  const after = cloneTree(seedQuotationTermTree("full_install"));
  after.sections.splice(3, 0, newSection("s-after", "หลัง O&M"));
  const rAfter = printed(after);
  assert.deepEqual(rAfter.seq, [1, 2, 3, 4, 5]);
  assert.ok(rAfter.p2.includes("4. หลัง O&M"), rAfter.p2.join(" | "));

  // เลขบนหน้าจอต้องเป็นชุดเดียวกับที่พิมพ์ออก
  for (const tree of [seedQuotationTermTree("full_install"), atEnd, atTop, mid, after]) {
    const map = getQuotationTermNumbering(tree, { validDays: 7, om });
    const r = renderQuotationTermTree(tree, { validDays: 7, om });
    const everyParagraph = [
      ...r.page2LeadingParagraphs,
      ...r.page1Sections.flatMap((s) => s.paragraphs),
      ...r.page2Sections.flatMap((s) => s.paragraphs),
    ];
    for (const paragraph of everyParagraph) {
      const no = paragraph.split(")")[0];
      assert.ok([...map.values()].includes(no), `หน้าจอไม่มีเลขบรรทัด ${no}`);
    }
  }

  // หัวข้อที่ผู้ใช้เพิ่มเองไม่มี "หน้า" เป็นของตัวเอง — ใช้หน้าเดียวกับหัวข้อเหนือมัน
  // ใบเก่าที่บันทึกหัวข้อพวกนี้ไว้เป็น page:2 ต้องไม่ลากทุกอย่างตกไปหน้า 2 จนหน้า 1 ว่าง
  const legacySection = (key, title) => ({
    key, title, page: 2, kind: "normal",
    lines: [{ key: `${key}-l`, body: `ข้อความ ${title}`, page: 2, origin: "custom" }],
  });
  const legacyTop = cloneTree(seedQuotationTermTree("full_install"));
  legacyTop.sections.unshift(legacySection("s-legacy", "สวัสดี"));
  const rLegacy = printed(legacyTop);
  assert.deepEqual(rLegacy.seq, [1, 2, 3, 4, 5]);
  assert.equal(rLegacy.p1.length, 3, `หน้า 1 ต้องไม่ว่าง: ${rLegacy.p1.join(" | ")}`);
  assert.equal(rLegacy.p1[0], "1. สวัสดี");
  // วางท้ายสุดก็ยังอยู่หน้า 2 ตามหัวข้อเหนือมัน
  const legacyEnd = cloneTree(seedQuotationTermTree("full_install"));
  legacyEnd.sections.push(legacySection("s-legacy2", "ท้ายสุด"));
  assert.ok(printed(legacyEnd).p2.includes("5. ท้ายสุด"));

  // สลับลำดับมั่ว ๆ เลขก็ต้องเรียง 1..N เสมอ
  for (let i = 0; i < 200; i++) {
    const tree = cloneTree(seedQuotationTermTree(i % 2 ? "full_install" : "additional_install"));
    if (i % 3 === 0) tree.sections.push(newSection("s-a", "A"));
    if (i % 5 === 0) tree.sections.unshift(newSection("s-b", "B"));
    if (i % 2 === 0) tree.sections.unshift(legacySection("s-c", "C"));
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(Math.random() * tree.sections.length);
      const y = Math.floor(Math.random() * tree.sections.length);
      [tree.sections[x], tree.sections[y]] = [tree.sections[y], tree.sections[x]];
    }
    const seq = printed(tree, [om, { ...om, enabled: false }][i % 2]).seq;
    assert.deepEqual(seq, seq.map((_, index) => index + 1), `เลขไม่เรียง: ${JSON.stringify(seq)}`);
  }
}

// ── ความจุตารางรายการบนหน้า 1 ──
// .page สูงตายตัว + overflow:hidden ถ้ารายการยาวเกิน ยอดเงินจะถูกตัดหายเงียบ ๆ
// ตัวเลขได้จากการวัดหน้าจริงด้วย headless Chrome — เทสนี้ล็อกไว้ไม่ให้เพี้ยน
{
  // ความจุลดลง 1 บรรทัดต่องวดชำระที่เพิ่มมา 1 งวด (วัดจริง 2→24, 3→23, 4→22, 5→21)
  assert.equal(getQuotationRowCapacity(2), 24);
  assert.equal(getQuotationRowCapacity(3), 23);
  assert.equal(getQuotationRowCapacity(4), 22);
  assert.equal(getQuotationRowCapacity(5), 21);
  assert.ok(getQuotationRowCapacity(0) >= 8, "งวดผิดรูปต้องไม่ทำให้ความจุติดลบ");
  assert.ok(getQuotationRowCapacity(99) >= 8);

  // ชื่อยาวเกิน 75 ตัวอักษรถูกตัดขึ้นบรรทัดใหม่ กินที่เพิ่ม
  assert.equal(countQuotationRowLines("รายการสั้น"), 1);
  assert.equal(countQuotationRowLines(""), 1, "แถวว่างก็ยังกิน 1 บรรทัด");
  assert.equal(countQuotationRowLines("ก".repeat(75)), 1);
  assert.equal(countQuotationRowLines("ก".repeat(76)), 2);
  assert.equal(countQuotationRowLines("ก".repeat(150)), 2);
  assert.equal(countQuotationRowLines("ก".repeat(200)), 3);

  const shortRows = (n) => Array.from({ length: n }, () => "รายการ");
  assert.deepEqual(measureQuotationPageFit(shortRows(23), 2),
    { used: 23, capacity: 24, over: false, tight: false });
  assert.deepEqual(measureQuotationPageFit(shortRows(24), 2),
    { used: 24, capacity: 24, over: false, tight: true });
  assert.deepEqual(measureQuotationPageFit(shortRows(25), 2),
    { used: 25, capacity: 24, over: true, tight: false });
  // งวดเยอะขึ้น ความจุน้อยลง จำนวนแถวเท่าเดิมก็ล้นได้
  assert.equal(measureQuotationPageFit(shortRows(24), 3).over, true);
  // ชื่อยาวกินสองบรรทัด ทำให้ล้นเร็วขึ้นเป็นเท่าตัว
  const longRows = Array.from({ length: 13 }, () => "ก".repeat(80));
  assert.equal(measureQuotationPageFit(longRows, 2).used, 26);
  assert.equal(measureQuotationPageFit(longRows, 2).over, true);
}

console.log("quotation terms/payment tests passed");
