import assert from "node:assert/strict";
import {
  getGridTieChecklistItems,
  getGridTieFinalMissing,
  getGridTieProgress,
  matchesGridTieUtility,
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
  assert.ok(list.includes("engineer_cert") && list.includes("council_engineer_cert"),
    "หนังสือรับรองไฟฟ้า (MEA) และหนังสือสภาวิศวกร (PEA) ต้องแสดงพร้อมกัน");
  assert.ok(list.includes("bank_account_notice") && list.includes("bank_book_copy"),
    "แถวบัญชีธนาคารแสดงเสมอ ไม่ผูกกับโหมดขายไฟแล้ว");

  // id ของ 8 แถวแรกต้องตรงกับที่แอปเคยใช้ ไม่งั้นติ๊กของ Lead เก่าจะจับคู่ไม่ติด
  assert.deepEqual(list.slice(0, 14), [
    "latest_electricity_bill", "tax_measure_consent", "bank_account_notice", "bank_book_copy",
    "power_of_attorney", "id_card", "house_registration", "post_solar_house_registration",
    "site_coordinates", "site_photo_timestamp", "single_line_diagram",
    "engineer_cert", "council_engineer_cert", "boq_quotation",
  ], "id และลำดับ 14 แถวต้องตรงตามฟอร์ม และ 4 ตัวแรกใช้ id เดิมของแอป");

  // ชื่อเอกสารต้องตรงฟอร์มกระดาษ รวมวงเล็บกำกับ
  const label = id => individual.find(i => i.id === id).label;
  assert.equal(label("tax_measure_consent"), "หนังสือยินยอมการเข้าร่วมโครงการภาษี (เฉพาะ MEA)");
  assert.equal(label("power_of_attorney"), "หนังสือมอบอำนาจ (ขายไฟ/ขนานไฟ/ภาษี)");
  assert.equal(label("bank_book_copy"), "สำเนาบัญชีธนาคารโอนค่าขายไฟ (เฉพาะ MEA-ขายไฟ)");
  assert.equal(label("site_photo_timestamp"), "รูปถ่ายติดตั้งหน้างาน (มี Time stamp ระบุวันที่ + สถานที่ติดตั้ง)");
  assert.equal(label("single_line_diagram"), "แบบผังวงจรไฟฟ้า Single Line + ลงนามวิศวกรไฟฟ้า");
  assert.equal(label("engineer_cert"), "หนังสือรับรองไฟฟ้า + ใบ กว. (เฉพาะ MEA)");
  assert.equal(label("council_engineer_cert"), "หนังสือสภาวิศวกร + ใบ กว. (เฉพาะ PEA)");
  assert.equal(label("boq_quotation"), "ใบเสนอราคา / BOQ (ฝ่ายบัญชี)");
  assert.equal(label("house_registration"), "สำเนาทะเบียนบ้าน (ชื่อผู้มอบ / ผู้รับมอบ)");
  assert.equal(label("post_solar_house_registration"), "สำเนาทะเบียนบ้าน (บ้านติดตั้ง Solar)");

  // คอลัมน์ติ๊กในฟอร์ม: แถว 1-8 เป็นของ Sale/ลูกค้า · แถว 9-14 เป็นของทีมติดตั้ง
  const docs = individual.filter(i => i.section === "doc");
  assert.ok(docs.slice(0, 8).every(i => i.owner === "sale"), "แถว 1-8 เป็นงานเซลล์/ลูกค้า");
  assert.ok(docs.slice(8, 14).every(i => i.owner === "install"), "แถว 9-14 เป็นงานทีมติดตั้ง");
  assert.ok(individual.filter(i => i.section === "equipment").every(i => i.owner === "install"),
    "กลุ่มอุปกรณ์เป็นงานทีมติดตั้งทั้งหมด");

  // ช่องของกลุ่มอุปกรณ์ต้องครบตามฟอร์ม
  const fieldsOf = id => individual.find(i => i.id === id).fields.map(f => f.key);
  assert.deepEqual(fieldsOf("panel"), ["brand", "model", "watt", "count", "nameplate_photo"]);
  assert.deepEqual(fieldsOf("inverter"), ["brand", "model", "kw", "count", "sn_photo"]);
  assert.deepEqual(fieldsOf("zero_export"), ["brand", "model"]);
  assert.deepEqual(fieldsOf("ct"), ["brand", "model", "rating_a", "rating_ma", "class", "iec"]);
  assert.deepEqual(fieldsOf("battery"), ["brand", "model", "count", "capacity_ma", "capacity_kwh", "capacity_kw"]);
  assert.ok(individual.filter(i => i.section === "equipment").every(i => i.datasheet),
    "อุปกรณ์ทุกกลุ่มต้องมีธง Datasheet");
  // เอกสารทั้ง 14 แถวยกจากฟอร์มโดยตรง คำกำกับอยู่ในวงเล็บท้ายชื่อ ไม่แยกเป็นบรรทัด detail
  // (กลุ่มอุปกรณ์ยังใช้ detail อยู่ เพราะยังไม่ได้เทียบกับฟอร์ม)
  assert.ok(individual.filter(i => i.section === "doc").every(i => !i.detail),
    "แถวเอกสารทั้งหมดต้องไม่มีบรรทัด detail แยก");

  // แถว 1 ต้องมีช่องครบตามฟอร์มกระดาษ — 2 ช่องแรกอยู่ใต้ชื่อเอกสาร ที่เหลืออยู่คอลัมน์หมายเหตุ
  const bill = individual.find(i => i.id === "latest_electricity_bill");
  assert.deepEqual(bill.fields.map(f => f.key),
    ["ca_no", "meter_code", "customer_type", "meter_size", "voltage", "phase", "wire"],
    "ช่องของแถวสำเนาใบแจ้งค่าไฟต้องครบและเรียงตามฟอร์ม");
  assert.ok(bill.fields.find(f => f.key === "ca_no").wide, "ช่องเลขผู้ใช้ไฟกรอกเลขยาว ต้องกว้างพิเศษ");

  // เจตนา (ขายไฟ/ขนานไฟ/COD) เก็บเป็นช่องกรอกในแถวหนังสือแสดงเจตนาที่เดียว ไม่มีคอลัมน์แยก
  const intent = individual.find(i => i.id === "power_of_attorney");
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
  const without = getGridTieProgress("juristic", "MEA", json(state));
  assert.equal(without.total, 6, "7 แถว แต่นับ 6 เพราะยังไม่ติ๊กว่าแถวสุดท้ายจำเป็น");
  // นิติบุคคลบน PEA ตัดหนังสือยินยอมภาษี (เฉพาะ MEA) ออกอีกใบ
  assert.equal(getGridTieProgress("juristic", "PEA", json(state)).total, 5,
    "PEA ไม่นับหนังสือยินยอมภาษีที่เป็นของ MEA");

  state.post_solar_house_registration.required = true;
  const withIt = getGridTieProgress("juristic", "MEA", json(state));
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
  assert.ok(ids(getGridTieChecklistItems("individual")).includes("tax_measure_consent"),
    "หนังสือยินยอมภาษีอยู่ในทั้งสองชุด — เป็นเอกสารใบเดียวกัน id เดียวกัน");
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

  const full = getGridTieProgress("individual", "MEA", json(state));
  // MEA → แถวของ PEA (ใบสภาวิศวกร) ไม่ถูกนับ
  assert.equal(full.total, items.length - 1, "MEA ไม่นับแถวที่ระบุว่าเฉพาะ PEA");
  assert.equal(full.received, full.total, "ติ๊กครบทุกแถวที่นับ");
  assert.equal(full.permit, full.total);
  assert.equal(full.complete, true);

  const partial = { ...state, [items[0].id]: { received: true, permit: null } };
  const half = getGridTieProgress("individual", "MEA", json(partial));
  assert.equal(half.received, half.total, "ตรวจรับยังครบ");
  assert.equal(half.permit, half.total - 1, "Permit ขาดไปหนึ่ง");
  assert.equal(half.complete, false);
}

assert.equal(getGridTieProgress("individual", "MEA", null).complete, false, "ยังไม่กรอกอะไร = ยังไม่ครบ");
assert.equal(getGridTieProgress("", "MEA", null).total, 0, "ไม่มีประเภทผู้ยื่น = ไม่มีอะไรให้นับ");

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

// ── เงื่อนไขการไฟฟ้า — จางและไม่นับ แต่ไม่ซ่อน ─────────────────────────────

{
  const items = getGridTieChecklistItems("individual");
  assert.equal(items.length, 19, "ยังไม่เลือกการไฟฟ้า = แสดงครบทุกแถว");

  // เลือกการไฟฟ้าแล้ว แถวของอีกเจ้าต้องหายไปเลย ไม่ใช่แค่จาง
  const mea = ids(getGridTieChecklistItems("individual", "MEA"));
  const pea = ids(getGridTieChecklistItems("individual", "PEA"));
  assert.equal(mea.length, 18, "MEA ตัดแถวของ PEA ออก 1 แถว");
  assert.equal(pea.length, 15, "PEA ตัดแถวของ MEA ออก 4 แถว");
  assert.ok(mea.includes("engineer_cert") && !mea.includes("council_engineer_cert"));
  assert.ok(pea.includes("council_engineer_cert") && !pea.includes("engineer_cert"));
  assert.ok(!pea.includes("tax_measure_consent") && !pea.includes("bank_account_notice"));
  assert.ok(pea.includes("id_card"), "แถวที่ไม่มีเงื่อนไขต้องอยู่ครบทั้งสองเจ้า");
  assert.equal(getGridTieChecklistItems("juristic", "PEA").length, 6,
    "นิติบุคคลบน PEA ตัดหนังสือยินยอมภาษีออก เหลือ 6");

  const meaOnly = items.filter(i => i.cond === "MEA").map(i => i.id);
  const peaOnly = items.filter(i => i.cond === "PEA").map(i => i.id);
  assert.deepEqual(meaOnly,
    ["tax_measure_consent", "bank_account_notice", "bank_book_copy", "engineer_cert"],
    "แถวที่ฟอร์มระบุว่าเฉพาะ MEA");
  assert.deepEqual(peaOnly, ["council_engineer_cert"], "แถวที่ฟอร์มระบุว่าเฉพาะ PEA");

  const cert = items.find(i => i.id === "engineer_cert");
  const council = items.find(i => i.id === "council_engineer_cert");
  const plain = items.find(i => i.id === "id_card");

  assert.equal(matchesGridTieUtility(cert, "MEA"), true);
  assert.equal(matchesGridTieUtility(cert, "PEA"), false, "ใบ กว. ของ MEA ไม่เข้าเงื่อนไขตอนเลือก PEA");
  assert.equal(matchesGridTieUtility(council, "PEA"), true);
  assert.equal(matchesGridTieUtility(council, "MEA"), false);
  assert.equal(matchesGridTieUtility(plain, "PEA"), true, "แถวที่ไม่มีเงื่อนไขใช้ได้ทุกการไฟฟ้า");
  assert.equal(matchesGridTieUtility(cert, ""), true, "ยังไม่เลือกการไฟฟ้า = ยังไม่ตัดอะไรออก");
}

{
  // ตัวนับต้องไปถึงเต็มได้จริงในแต่ละการไฟฟ้า
  const items = getGridTieChecklistItems("individual").filter(i => !i.conditional);
  const state = {};
  for (const item of items) state[item.id] = { received: true, permit: "has" };
  for (const utility of ["MEA", "PEA"]) {
    const p = getGridTieProgress("individual", utility, json(state));
    assert.equal(p.complete, true, `${utility}: ติ๊กครบแล้วต้องนับว่าครบ`);
    assert.ok(p.total < items.length, `${utility}: ต้องตัดแถวของอีกเจ้าออกจากตัวนับ`);
  }
  // ติ๊กของแถวที่ถูกซ่อนยังอยู่ใน JSON สลับการไฟฟ้ากลับมาก็เห็นเหมือนเดิม
  assert.equal(parseGridTieChecklist(json(state)).council_engineer_cert.received, true,
    "ข้อมูลของแถวที่ถูกซ่อนต้องไม่หาย");
}

console.log("grid-tie: ผ่านทั้งหมด");
