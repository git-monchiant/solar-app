import assert from "node:assert/strict";
import {
  GRID_TIE_MILESTONES,
  getGridTieChecklistItems,
  getGridTieFinalMissing,
  getGridTieOutOfOrderMilestones,
  getGridTieProgress,
  parseGridTieChecklist,
} from "../../src/lib/gridTie.ts";

const ids = items => items.map(item => item.id);
const json = state => JSON.stringify(state);

// ── รายการ — ไม่มีเงื่อนไขซ่อน/แสดง โผล่ทุกแถวเสมอ ──────────────────────────

{
  const individual = getGridTieChecklistItems("individual");
  assert.equal(individual.filter(i => i.section === "doc").length, 14, "ชุดบุคคลธรรมดา = 14 แถวตามฟอร์มกระดาษ");
  assert.equal(individual.filter(i => i.section === "equipment").length, 5, "อุปกรณ์ 5 กลุ่ม");
  assert.equal(individual.length, 19);

  // ใบ กว. (MEA) กับ ใบ กส. (PEA) ต้องโผล่พร้อมกัน — คนกรอกเลือกเองว่าใช้อันไหน
  const list = ids(individual);
  assert.ok(list.includes("engineer_cert") && list.includes("architect_cert"),
    "ทั้งใบ กว. และใบ กส. ต้องแสดงพร้อมกัน");
  assert.ok(list.includes("bank_account_notice") && list.includes("bank_book_copy"),
    "แถวบัญชีธนาคารแสดงเสมอ ไม่ผูกกับโหมดขายไฟแล้ว");
  assert.ok(list.includes("premise_consent"), "หนังสือยินยอมแสดงเสมอ ไม่ผูกกับ MEA แล้ว");

  // เจตนา (ขายไฟ/ขนานไฟ/COD) เก็บเป็นช่องกรอกในแถวหนังสือแสดงเจตนาที่เดียว ไม่มีคอลัมน์แยก
  const intent = individual.find(i => i.id === "intent_letter");
  const intentField = intent.fields.find(f => f.key === "intent");
  assert.deepEqual(intentField.options.map(o => o.value), ["parallel", "sell", "cod"],
    "ตัวเลือกเจตนาต้องครบ 3 แบบ");
}

{
  // นิติบุคคลคงรายการเดิมของแอปไว้ทั้งหมด — เอกสารฝั่งลูกค้าล้วน ไม่มีอุปกรณ์/งานหน้างาน
  const juristic = getGridTieChecklistItems("juristic");
  assert.deepEqual(ids(juristic), [
    "power_of_attorney", "tax_measure_consent", "latest_electricity_bill",
    "company_certificate", "director_id_card", "director_house_registration",
    "post_solar_house_registration",
  ], "ต้องตรงกับรายการเดิมของแอปทั้ง id และลำดับ");
  assert.equal(juristic.filter(i => i.section === "equipment").length, 0, "นิติบุคคลไม่มีส่วนอุปกรณ์");
  assert.ok(juristic.every(i => i.owner === "sale"), "ทุกแถวเป็นเอกสารฝั่งลูกค้า");
  assert.ok(!ids(juristic).includes("id_card"), "บัตร ปชช. ของบุคคลธรรมดาไม่โผล่ในชุดนิติบุคคล");
  assert.ok(!ids(juristic).includes("site_coordinates"), "งานหน้างานไม่อยู่ในชุดนิติบุคคล");

  // ทะเบียนบ้านหลังติดตั้ง Solar ยังเป็นแถวที่ต้องติ๊กว่าจำเป็นก่อน (กติกาเดิมของแอป)
  const conditional = juristic.filter(i => i.conditional);
  assert.deepEqual(ids(conditional), ["post_solar_house_registration"],
    "มีแถว conditional แถวเดียว และเป็นแถวเดิม");
  assert.ok(getGridTieChecklistItems("individual").every(i => !i.conditional),
    "ชุดบุคคลธรรมดาไม่มีแถว conditional แล้ว");
}

{
  // นิติบุคคล: ตัวนับต้องไม่รวมแถว conditional จนกว่าจะติ๊กว่าจำเป็น (เดิมขึ้น 0/6 จาก 7 แถว)
  const juristic = getGridTieChecklistItems("juristic");
  const state = {};
  for (const item of juristic) state[item.id] = { received: true, permit: "has" };
  const without = getGridTieProgress("juristic", json(state));
  assert.equal(without.total, 6, "7 แถว แต่นับ 6 เพราะยังไม่ติ๊กว่าแถวสุดท้ายจำเป็น");

  state.post_solar_house_registration.required = true;
  const withIt = getGridTieProgress("juristic", json(state));
  assert.equal(withIt.total, 7, "ติ๊กว่าจำเป็นแล้วนับครบ 7");
}

// ประเภทผู้ยื่นเป็นตัวเดียวที่เลือกชุดเอกสาร — การไฟฟ้า/โหมด ไม่เกี่ยวกับรายการแล้ว
assert.equal(getGridTieChecklistItems("").length, 0, "ยังไม่เลือกประเภทผู้ยื่น = ไม่แสดงรายการ");
assert.notDeepEqual(
  ids(getGridTieChecklistItems("individual")),
  ids(getGridTieChecklistItems("juristic")),
  "สองชุดต้องต่างกันจริง",
);

// ── แปลงข้อมูลเก่า — ห้ามให้ติ๊กที่เคยทำไว้หาย ───────────────────────────────

{
  const legacy = json({
    "MEA:individual:id_card": { status: "received", note: "เซ็นรับรองแล้ว" },
    "MEA:individual:house_registration": { status: "missing", note: "" },
    "MEA:individual:tax_measure_consent": { status: "received", note: "ของเดิมที่ตัดทิ้ง" },
  });
  const parsed = parseGridTieChecklist(legacy);

  assert.equal(parsed.id_card.received, true, "status received → received: true");
  assert.equal(parsed.id_card.permit, "has", "ของเดิมมีชั้นเดียว ยกขึ้นเป็น Permit ยืนยันด้วย");
  assert.equal(parsed.id_card.note, "เซ็นรับรองแล้ว", "หมายเหตุเดิมต้องอยู่ครบ");
  assert.equal(parsed.house_registration.received, false, "status missing → received: false");
  assert.equal(parsed.house_registration.permit, null, "ยังไม่ได้รับ → Permit ยังว่าง");
  assert.ok(!("MEA:individual:id_card" in parsed), "prefix ต้องถูกตัดทิ้ง");
  assert.ok(!ids(getGridTieChecklistItems("individual")).includes("tax_measure_consent"),
    "หนังสือยินยอมภาษีอยู่เฉพาะชุดนิติบุคคล ไม่อยู่ในชุดบุคคลธรรมดา");
}

{
  // ข้อมูลเก่าที่มีทั้ง MEA และ PEA ของแถวเดียวกัน — ต้องเก็บอันที่ติ๊กแล้วไว้
  const parsed = parseGridTieChecklist(json({
    "PEA:individual:id_card": { status: "missing", note: "" },
    "MEA:individual:id_card": { status: "received", note: "ได้แล้ว" },
  }));
  assert.equal(parsed.id_card.received, true, "แถวที่ติ๊กแล้วต้องชนะแถวที่ยังไม่ติ๊ก");
}

{
  const parsed = parseGridTieChecklist(json({
    panel: {
      received: true, permit: "has", datasheet: "has",
      files: ["/api/files/a.pdf", 42],
      fields: { brand: "JINKO", watt: 640 },
    },
  }));
  assert.deepEqual(parsed.panel.files, ["/api/files/a.pdf"], "ค่าที่ไม่ใช่ string ในไฟล์ต้องถูกกรองทิ้ง");
  assert.deepEqual(parsed.panel.fields, { brand: "JINKO", watt: "640" }, "ค่าตัวเลขแปลงเป็น string");
  assert.equal(parsed.panel.datasheet, "has");
}

assert.deepEqual(parseGridTieChecklist(null), {}, "null → {}");
assert.deepEqual(parseGridTieChecklist("ไม่ใช่ JSON"), {}, "JSON พังต้องไม่ throw");
assert.deepEqual(parseGridTieChecklist("[1,2,3]"), {}, "array ไม่ใช่รูปแบบที่รับ");

// ── Progress — เป็นข้อมูลติดตามงาน ไม่ได้บล็อกอะไร ─────────────────────────

{
  const items = getGridTieChecklistItems("individual");
  const state = {};
  for (const item of items) state[item.id] = { received: true, permit: "has" };

  const full = getGridTieProgress("individual", json(state));
  assert.equal(full.total, items.length, "ชุดบุคคลธรรมดานับทุกแถว ไม่มี conditional แล้ว");
  assert.equal(full.received, items.length);
  assert.equal(full.permit, items.length);
  assert.equal(full.complete, true);

  const partial = { ...state, [items[0].id]: { received: true, permit: null } };
  const half = getGridTieProgress("individual", json(partial));
  assert.equal(half.received, items.length, "ตรวจรับยังครบ");
  assert.equal(half.permit, items.length - 1, "Permit ขาดไปหนึ่ง");
  assert.equal(half.complete, false);
}

assert.equal(getGridTieProgress("individual", null).complete, false, "ยังไม่กรอกอะไร = ยังไม่ครบ");
assert.equal(getGridTieProgress("", null).total, 0, "ไม่มีประเภทผู้ยื่น = ไม่มีอะไรให้นับ");

// ── เกณฑ์ปิดงาน — ไม่บังคับ checklist ──────────────────────────────────────

{
  const missing = getGridTieFinalMissing({});
  assert.deepEqual(missing, ["การไฟฟ้า", "เลขที่คำขอ", "เอกสารยื่นขอขนานไฟ", "ใบอนุญาต/PPA"],
    "บังคับแค่ 4 อย่าง ไม่มี checklist / ประเภทผู้ยื่น");
}

{
  const base = {
    grid_utility: "MEA",
    grid_app_no: "MEA-2569-04182",
    grid_application_doc_url: "/api/files/app.pdf",
    grid_permit_doc_url: "/api/files/permit.pdf",
  };
  assert.deepEqual(getGridTieFinalMissing(base), [], "ครบ 4 อย่าง = ปิดงานได้ แม้ checklist ว่างเปล่า");

  // checklist ที่ยังไม่ได้ติ๊กอะไรเลย ต้องไม่บล็อก
  assert.deepEqual(
    getGridTieFinalMissing({ ...base, grid_applicant_type: "individual", grid_document_checklist: null }),
    [], "checklist ว่างไม่บล็อกการปิดงาน",
  );

  assert.deepEqual(getGridTieFinalMissing({ ...base, grid_permit_doc_url: null }), ["ใบอนุญาต/PPA"],
    "หลักฐานปลายทางยังบังคับอยู่");
}

// ── ขั้นตอนกับการไฟฟ้า 5 วันที่ ─────────────────────────────────────────────

assert.equal(GRID_TIE_MILESTONES.length, 5, "มี 5 ขั้นตามคอลัมน์ที่มีใน leads");
assert.deepEqual(
  GRID_TIE_MILESTONES.map(m => m.key),
  ["grid_erc_submitted_date", "grid_submitted_date", "grid_inspection_date",
   "grid_approved_date", "grid_meter_changed_date"],
  "ลำดับต้องตรงกับขั้นตอนจริงและชื่อคอลัมน์",
);

assert.deepEqual(getGridTieOutOfOrderMilestones({}), [], "ยังไม่กรอกอะไร = ไม่มีอะไรผิดลำดับ");

assert.deepEqual(
  getGridTieOutOfOrderMilestones({
    grid_erc_submitted_date: "2026-01-10",
    grid_submitted_date: "2026-02-01",
    grid_approved_date: "2026-03-01",
  }),
  [], "เรียงถูกและข้ามขั้นได้ = ไม่เตือน",
);

assert.deepEqual(
  getGridTieOutOfOrderMilestones({
    grid_submitted_date: "2026-02-01",
    grid_inspection_date: "2026-01-15",
  }),
  ["grid_inspection_date"], "ขั้นหลังมาก่อนขั้นหน้า = เตือนที่ขั้นหลัง",
);

assert.deepEqual(
  getGridTieOutOfOrderMilestones({
    grid_erc_submitted_date: "2026-03-01",
    grid_submitted_date: "2026-02-01",
    grid_inspection_date: "2026-01-01",
  }),
  ["grid_submitted_date", "grid_inspection_date"], "ผิดลำดับต่อเนื่องต้องเตือนทุกขั้น",
);

assert.deepEqual(
  getGridTieOutOfOrderMilestones({
    grid_erc_submitted_date: "2026-02-01",
    grid_submitted_date: "2026-02-01",
  }),
  [], "วันเดียวกันไม่ถือว่าผิดลำดับ",
);

console.log("grid-tie: ผ่านทั้งหมด");
