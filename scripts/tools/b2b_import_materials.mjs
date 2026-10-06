// นำเข้า Master Data วัสดุของโมดูล BOQ (B2B) จากไฟล์ Excel ที่ทีมใช้อยู่
// แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 2 — 2 แหล่ง
//   1. sheet "Unit price  Material"  = ราคาวัสดุ 13 กลุ่มวางเรียงข้างกัน
//   2. sheet "EPCL - BOQS" หมวด 1–18 = รายการที่ไฟล์เดิมพิมพ์ต้นทุนเอง (ค่าบริการ/ค่าธรรมเนียม/ตู้ไฟ ฯลฯ)
//      เพราะผู้ใช้เคาะว่าหมวด 1–18 ต้องเลือกจาก Master เท่านั้น — หมวดเสริม 19–25 Solar B2B ใส่ราคาเองในใบ BOQ
//
// ไม่เดาแทนทีม: จุดไหนระบบตัดสินใจเอง ติดหมายเหตุ "⚠ ตรวจ: …" · ราคาจากสูตรซับซ้อน → รอราคา + แนบสูตรเดิม
//
// ใช้งาน (ไฟล์ Excel อยู่นอก git — ส่ง path มา)
//   node scripts/tools/b2b_import_materials.mjs --db=solardb_v3 --file="BOQ/BOQ Solar rooftop.xlsx"          # dry-run + ไฟล์สรุปให้ตรวจ
//   node scripts/tools/b2b_import_materials.mjs --db=solardb_v3 --file="BOQ/BOQ Solar rooftop.xlsx" --yes    # นำเข้าจริง
//   node scripts/tools/b2b_import_materials.mjs --db=solardb_v3 --undo --yes                                  # ถอนเฉพาะที่นำเข้าจาก Excel

import sql from 'mssql';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const database = arg('db');
const file = arg('file');
const execute = args.includes('--yes');
const undo = args.includes('--undo');
if (!database || !/v3$/i.test(database)) { console.error('ต้องระบุ --db=<ฐานของ v3> (ตาราง b2b_* มีเฉพาะฐาน v3)'); process.exit(1); }
if (!undo && !file) { console.error('ต้องระบุ --file=<path ไฟล์ Excel>'); process.exit(1); }

const SOURCE_UPM = 'excel:Unit price Material';
const SOURCE_BOQS = 'excel:EPCL - BOQS';

// ───────────────────────── อ่านไฟล์ ─────────────────────────
const rows = [];   // แถวที่จะนำเข้า
const skipped = []; // แถวที่ข้าม + เหตุผล (ลงไฟล์สรุป)

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const flag = (r, msg) => { r.notes.push(`⚠ ตรวจ: ${msg}`); };
const add = (r) => { rows.push({ subgroup: null, brand: null, model: null, spec_watt: null, price_basis: 'unit', unit_price: null, notes: [], ...r }); return rows[rows.length - 1]; };

function readUnitPriceMaterial(ws) {
  const c = (col, r) => ws[`${col}${r}`];
  const v = (col, r) => norm(c(col, r)?.v);
  const num = (col, r) => { const x = c(col, r)?.v; return typeof x === 'number' && x > 0 ? x : null; };
  const last = XLSX.utils.decode_range(ws['!ref']).e.r + 1;
  const ref = (col, r) => `UPM!${col}${r}`;

  // 1 PV Module — ราคาในไฟล์ = วัตต์ × 4.5 ทุกยี่ห้อ ⇒ เก็บเป็นแบบ "ต่อวัตต์" (บาท/W)
  const brands = ['Jinko Solar', 'Sharp Solar', 'Trina Solar', 'JA Solar'];
  for (let r = 3; r <= last; r++) {
    const model = v('C', r); const w = num('D', r); const p = num('E', r);
    if (!model || model === '-' || !w) continue;
    const brand = brands.find((b) => model.replace(/\s+/g, '').toLowerCase().startsWith(b.replace(/\s+/g, '').toLowerCase())) ?? null;
    const row = add({ ref: ref('C', r), source: SOURCE_UPM, category_id: 1, name: 'PV Module', brand, model, spec_watt: w, unit: 'Module', price_basis: 'watt', unit_price: p ? Math.round((p / w) * 10000) / 10000 : null });
    if (!brand) flag(row, 'ไม่รู้ยี่ห้อจากชื่อรุ่น');
  }

  // 2 Inverter · 3 Optimizer — ยี่ห้อในไฟล์เป็นแค่รายชื่อ ไม่ผูกแถว ⇒ ดูจากรุ่นแทน
  const invBrand = (m) => (/^SUN\d/i.test(m) ? 'Huawei' : /^SE\d/i.test(m) ? 'SolarEdge' : null);
  for (let r = 3; r <= last; r++) {
    const model = v('H', r); if (!model || model === '-') continue;
    const row = add({ ref: ref('H', r), source: SOURCE_UPM, category_id: 2, name: 'Inverter', brand: invBrand(model), model, unit: 'Set.', unit_price: num('I', r) });
    if (model === 'SUN2000-15K-MB0') flag(row, 'ราคา 15K (85,400) สูงกว่ารุ่น 20K/25K');
  }
  for (let r = 3; r <= last; r++) {
    const model = v('M', r); if (!model || model === '-') continue;
    const brand = /^(SUN2000|MERC)/i.test(model) ? 'Huawei' : /^S\d{4}$/i.test(model) ? 'SolarEdge' : null;
    add({ ref: ref('M', r), source: SOURCE_UPM, category_id: 2, subgroup: 'Optimizer', name: 'Optimizer', brand, model, unit: 'Set.', unit_price: num('N', r) });
  }

  // 4 Mounting & Walkway → หมวด 3 · แถวไม่มีราคาบางแถวเป็นหัวข้อย่อย (ชุดเดียวกับหัวข้อใน sheet BOQS)
  const mountHeads = new Set(['End Clamp', 'Inter Clamp / Mid Clamp', 'Rail', 'L-Feet', 'Klip-lok', 'Ballast (Flat roof)', 'Tilt legs (Flat roof)', 'Roof Hook Group (ยึดหลังคาซีแพค)', 'Accessories for Mounting']);
  let sub = null;
  for (let r = 3; r <= last; r++) {
    const name = v('Q', r); if (!name || name === '-') continue;
    if (mountHeads.has(name)) { sub = name; continue; }
    if (/^(Walkway|RUNNUR)/i.test(name)) sub = 'Walkway';
    add({ ref: ref('Q', r), source: SOURCE_UPM, category_id: 3, subgroup: sub, name, unit: 'Pcs', unit_price: num('R', r) });
  }

  // 5 Solar Control box & MDB & Zero Export → หมวด 4
  //   คอลัมน์ชื่อ (S) ไม่ตรงแถวกับรุ่น (T) ช่วงมิเตอร์/CT ⇒ จัดชื่อตามรุ่นที่รู้จัก แล้วติดหมายเหตุ
  const panelBrands = new Set(['United', 'Q-Power', 'NBT', 'ABB', 'Schneider']);
  let label = null;
  for (let r = 3; r <= last; r++) {
    const s = v('S', r); const t = v('T', r); const p = num('U', r);
    if (s && s !== '-') label = s;
    if (!t || t === '-') {
      if (s && s !== '-') add({ ref: ref('S', r), source: SOURCE_UPM, category_id: 4, name: s, unit: 'Set.' });
      continue;
    }
    if (panelBrands.has(t)) { add({ ref: ref('T', r), source: SOURCE_UPM, category_id: 4, name: label, brand: t, unit: 'Set.', unit_price: p }); continue; }
    let name = label; let brand = null; let sg = null; let reclass = true;
    if (/SMW110|EDMI/i.test(t)) { name = 'Revenue Meter'; sg = 'Revenue Meter System'; }
    else if (/^Janitza/i.test(t)) { name = 'Digital Power Meter (PQM)'; brand = 'Janitza'; sg = 'Zero Export'; }
    else if (/^D[DT][SH]U666/i.test(t)) { name = 'Smart Power Meter'; brand = 'Huawei'; sg = 'Zero Export'; }
    else if (/^TP-\d+/i.test(t)) { name = 'CT (Split Core)'; sg = 'Zero Export'; reclass = label !== 'CT (Split Core)'; }
    else reclass = false;
    const row = add({ ref: ref('T', r), source: SOURCE_UPM, category_id: 4, subgroup: sg, name, brand, model: t, unit: /^TP-/.test(t) ? 'Ea.' : 'Set.', unit_price: p });
    if (reclass && name !== s) flag(row, `ชื่อในไฟล์ไม่ตรงแถวกับรุ่น — ระบบจัดเป็น "${name}" ตามรุ่น`);
    // ชื่อในแถวนี้ (เช่น AC SURGE) ถูกจับคู่กับรุ่นมิเตอร์ผิดแถว — ยังต้องมีเป็นรายการของตัวเอง
    if (reclass && s && s !== '-' && name !== s && !/CT|Meter|PQM/i.test(s)) add({ ref: ref('S', r), source: SOURCE_UPM, category_id: 4, name: s, unit: 'Set.' });
  }

  // 6 Monitoring → หมวด 5 · บางแถวสลับ ชื่อ↔รุ่น (V เป็นรหัสรุ่น) ⇒ สลับกลับ
  for (let r = 3; r <= last; r++) {
    let name = v('V', r); let model = v('W', r); const p = num('X', r);
    if (!name && !model) continue;
    if (/^Sdongle/i.test(name)) [name, model] = ['Smart Dongle', name];
    else if (/^(SE1000-CCG|ONE-CLC)/i.test(name)) [name, model] = [model, name];
    let brand = /^(SE1000|ONE-)/i.test(model) ? 'SolarEdge' : /Smart ?Logger|Sdongle|^0[56]-/i.test(`${name} ${model}`) ? 'Huawei' : null;
    if (/^(SENSOR|COMMUNICATION) Panel$/i.test(name)) { brand = model; model = null; }
    const row = add({ ref: ref('V', r), source: SOURCE_UPM, category_id: 5, name: name || model, brand, model: name ? model : null, unit: 'Set.', unit_price: p });
    if (/TMOD/.test(model ?? '') && /Ambient/i.test(name)) flag(row, 'ชื่อกับรุ่นน่าจะสลับ (TMOD = Module Temperature)');
    if (/TAMB/.test(model ?? '') && /Module/i.test(name)) flag(row, 'ชื่อกับรุ่นน่าจะสลับ (TAMB = Ambient Temperature)');
  }

  // 7 DC Cable → หมวด 6
  for (let r = 3; r <= last; r++) {
    const name = v('Y', r); const model = v('Z', r); if (!name && !model) continue;
    const isConn = /^MC\d/i.test(name);
    add({ ref: ref('Y', r), source: SOURCE_UPM, category_id: 6, subgroup: isConn ? 'PV Cable Connector' : 'DC Cable', name: isConn ? 'PV Cable Connector' : 'DC Cable', model: isConn ? name : `${name} ${model}`.trim(), unit: isConn ? 'Set.' : 'm.', unit_price: num('AA', r) });
  }

  // 8 AC Cable → หมวด 7 · ชื่อเส้นทาง (AB) ไม่ผูกกับขนาดสาย ⇒ ตั้งชื่อตามชนิดสาย
  let acLabel = null;
  for (let r = 3; r <= last; r++) {
    const ab = v('AB', r); const model = v('AC', r); if (ab) acLabel = ab; if (!model) continue;
    let name = acLabel; let sg = null;
    if (/^CV-FD/i.test(model)) { name = 'AC Cable (CV-FD)'; sg = 'AC Cable'; }
    else if (/SAC/i.test(model)) { name = 'สาย SAC 25 kV'; sg = 'High Voltage Cable'; }
    else if (/^\d+Cx1\.0/i.test(model)) { name = 'Communication RS485'; sg = 'Communication'; }
    else if (/Fiber|Single-Mode|Multi-mode/i.test(`${acLabel} ${model}`)) { name = 'Communication Fiber Optic'; sg = 'Communication'; }
    else if (/LAN/i.test(model)) { name = 'LAN Cable (Ethernet)'; sg = 'Communication'; }
    add({ ref: ref('AC', r), source: SOURCE_UPM, category_id: 7, subgroup: sg, name, model, unit: 'm.', unit_price: num('AD', r) });
  }

  // 9 Ground → หมวด 8
  let gLabel = null;
  for (let r = 3; r <= last; r++) {
    const ae = v('AE', r); const model = v('AF', r); const p = num('AG', r);
    if (ae) gLabel = ae;
    if (/^IEC01/i.test(model)) { add({ ref: ref('AF', r), source: SOURCE_UPM, category_id: 8, subgroup: 'Ground Cable', name: 'Ground Cable (IEC01)', model, unit: 'm.', unit_price: p }); continue; }
    if (!ae && !model) continue;
    const row = add({ ref: ref('AE', r), source: SOURCE_UPM, category_id: 8, name: gLabel, model: model || null, unit: 'Set.', unit_price: p });
    if (/^One Time$/i.test(model)) flag(row, 'ไม่ชัดว่า "One Time" คือรายการอะไร');
  }

  // 10 Conduit / Tray / Ladder → หมวด 9 · หน่วยราคาในไฟล์ไม่ชัด (ต่อท่อน/ต่อเมตร) ⇒ ติดหมายเหตุ
  for (let r = 3; r <= last; r++) {
    const model = v('AI', r); if (!model) continue;
    const name = /^IMC/i.test(model) ? 'IMC Conduit (HDG)' : /^Flexible/i.test(model) ? 'Flexible Conduit' : /^Perforated/i.test(model) ? 'Perforated Tray (HDG)' : /^Cable Ladder/i.test(model) ? 'Cable Ladder (HDG)' : model;
    const row = add({ ref: ref('AI', r), source: SOURCE_UPM, category_id: 9, subgroup: name, name, model, unit: /Tray|Ladder/i.test(model) ? 'ท่อน' : 'ท่อน', unit_price: num('AJ', r) });
    flag(row, 'หน่วยราคา (ต่อท่อน หรือ ต่อเมตร) — ไฟล์ BOQ เดิมคิดต่อเมตร');
  }

  // 11 PV Cleaning → หมวด 10
  let clLabel = null;
  for (let r = 3; r <= last; r++) {
    const ak = v('AK', r); const model = v('AL', r); const p = num('AM', r);
    if (ak) clLabel = ak;
    if (!model) continue;
    let name = clLabel; let unit = 'Set.';
    if (/^HDPE/i.test(model)) { name = 'ท่อ HDPE'; unit = 'm.'; }
    else if (/^PPR/i.test(model)) { name = 'ท่อ PPR'; unit = 'm.'; }
    else if (/^\d+\s*L$/i.test(model)) name = 'ถังเก็บน้ำ (Water Tank)';
    else if (/^(Ball Valve|Faucet)$/i.test(model)) { name = model; add({ ref: ref('AL', r), source: SOURCE_UPM, category_id: 10, name, unit, unit_price: p }); continue; }
    add({ ref: ref('AL', r), source: SOURCE_UPM, category_id: 10, name: name || model, model, unit, unit_price: p });
  }

  // 12 Structure & Consumable → หมวด 11 (ข้อเสนอ — ทีมยังไม่ยืนยัน)
  let stLabel = null;
  for (let r = 3; r <= last; r++) {
    const an = v('AN', r); const model = v('AO', r); if (an) stLabel = an; if (!model) continue;
    const row = add({ ref: ref('AO', r), source: SOURCE_UPM, category_id: 11, name: stLabel, model, unit: 'Set.', unit_price: num('AP', r) });
    flag(row, 'จับคู่กลุ่ม "Structure & Consumable" → หมวด 11 Inverter Station (รอทีมยืนยัน)');
  }

  // 13 Service & Safety → หมวด 12
  let ssLabel = null;
  for (let r = 3; r <= last; r++) {
    const aq = v('AQ', r); const model = v('AR', r); const p = num('AS', r);
    if (aq) ssLabel = aq.replace(/_/g, ' ');
    if (!model) { if (aq) add({ ref: ref('AQ', r), source: SOURCE_UPM, category_id: 12, name: ssLabel, unit: 'Set.', unit_price: p }); continue; }
    const row = add({ ref: ref('AR', r), source: SOURCE_UPM, category_id: 12, name: ssLabel, model, unit: /Ladder/i.test(ssLabel) ? 'Set.' : /Lifeline|Sling|fence/i.test(ssLabel) ? 'm.' : 'Set.', unit_price: p });
    if (/Service ladder HDG\. ?(10|12|3\.6) m/i.test(model)) flag(row, 'ราคาบันไดไม่เรียงตามความสูง (12 m ถูกกว่า 10 m · 3.6 m ถูกกว่า 4 m มาก)');
  }
}

function readBoqsTyped(ws) {
  const c = (a) => ws[a];
  const v = (a) => norm(c(a)?.w ?? c(a)?.v);
  const last = 523;   // แถว Total ของหมวด 18 — หมวดเสริม 19–25 ไม่นำเข้า (Solar B2B ใส่ราคาเองในใบ)
  let cat = null; let sub = null;
  for (let r = 43; r <= last; r++) {
    const A = v(`A${r}`); const B = v(`B${r}`); const H = c(`H${r}`); const F = c(`F${r}`);
    if (/^\d+$/.test(A) && B && !H) { cat = Number(A); sub = null; continue; }
    if (/^Total/.test(A) || !cat) continue;
    if (!H) {
      // หัวข้อย่อย = มีชื่อ ไม่มีราคา ไม่มีจำนวน · "- xxx" เป็นบรรทัดอธิบาย · "จำนวน…" เป็นช่องตั้งค่าในไฟล์
      const fEmpty = !F || F.v === '' || F.v == null || norm(F.w) === '-';
      if (B && fEmpty && !/^-/.test(B) && !/^จำนวน/.test(B)) sub = B;
      else if (B) skipped.push({ ref: `BOQS!r${r}`, name: B, reason: 'บรรทัดอธิบาย/ช่องตั้งค่าในไฟล์ ไม่ใช่รายการ' });
      continue;
    }
    const f = H.f || '';
    if (/XLOOKUP/i.test(f)) continue;   // ราคามาจาก sheet Unit price Material — นำเข้าจากฝั่งนั้นแล้ว
    const ref = `BOQS!r${r}`;
    const base = { ref, source: SOURCE_BOQS, category_id: cat, subgroup: sub, name: B, brand: v(`D${r}`) || null, unit: v(`G${r}`) || 'Set.' };
    const E = v(`E${r}`);
    const howToCount = /x/.test(E) && /[ก-๙]/.test(E);   // หมวด O&M ใช้ช่องรุ่นเขียนวิธีนับจำนวน
    if (E && !howToCount) base.model = E;

    // บรรทัด % — Accessories (% ของต้นทุนหมวด) · ประกันภัย (% ของยอดขายหมวด 1–17)
    const pct = /SUM\(I\d+:I\d+.*\)\*C(\d+)/i.exec(f) || /C(\d+)\*\(SUM\(K10:K26\)\)/i.exec(f);
    if (pct) {
      const cRow = Number(pct[1]);
      const shown = c(`C${r}`)?.v; const used = c(`C${cRow}`)?.v;
      const isSale = /K10:K26/.test(f);
      const row = add({ ...base, name: B || 'Accessories', price_basis: isSale ? 'pct_sale' : 'pct_category', unit: 'Lot.', unit_price: typeof shown === 'number' ? Math.round(shown * 1000000) / 10000 : null });
      if (cRow !== r && typeof used === 'number' && used !== shown) flag(row, `ไฟล์เดิมแสดง ${shown * 100}% แต่สูตรใช้ ${used * 100}% ของแถว C${cRow} (อ้างผิดหมวด)`);
      if (/I253\+I265/.test(f)) flag(row, 'ไฟล์เดิมคิด % จากหมวด 11+12 ไม่ใช่หมวดตัวเอง');
      continue;
    }
    // บรรทัด % ที่คิดจากหมวดอื่น (หมวด 15) ใช้รูปแบบสูตรต่างไป
    if (/\*C\d+$/.test(f) && /\(I\d+\+I\d+\)/.test(f)) {
      const row = add({ ...base, price_basis: 'pct_category', unit: 'Lot.', unit_price: typeof c(`C${r}`)?.v === 'number' ? Math.round(c(`C${r}`).v * 1000000) / 10000 : null });
      flag(row, `ไฟล์เดิมคิด % จากหมวด 11+12 (สูตร =${f})`);
      continue;
    }

    const value = typeof H.v === 'number' ? H.v : null;
    const perWp = /(^|[^A-Z])B4\b/.test(F?.f || '');   // จำนวน = ขนาดระบบ ⇒ ราคาเป็นบาท/Wp
    if (perWp) Object.assign(base, { price_basis: 'system_wp', unit: 'Wp' });
    if (howToCount) base.notes = [`วิธีนับจำนวน (ไฟล์เดิม): ${E}`];

    if (!f) {
      if (!(value > 0)) { skipped.push({ ref, name: B, reason: 'ไฟล์เดิมไม่มีราคา' }); continue; }
      add({ ...base, unit_price: value });
    } else if (/^[\d+\-*/.()\s]+$/.test(f)) {
      // สูตรตัวเลขล้วน เช่น 920+380 → คิดค่าได้ตรงๆ
      const row = add({ ...base, unit_price: value });
      row.notes.push(`ไฟล์เดิม = ${f}`);
    } else {
      const row = add({ ...base, unit_price: null });
      flag(row, `ราคาไฟล์เดิมเป็นสูตร =${f} (ค่าในไฟล์ ${value ?? '-'}) — ใส่เป็นอัตราคงที่`);
    }
  }
}

// ───────────────────────── รวม / ตัดซ้ำ ─────────────────────────
function dedupe() {
  const key = (r) => [r.category_id, r.subgroup, r.name, r.brand, r.model, r.price_basis].map((x) => norm(x).toLowerCase()).join('|');
  const seen = new Map(); const out = [];
  for (const r of rows) {
    const k = key(r);
    const prev = seen.get(k);
    if (!prev) { seen.set(k, r); out.push(r); continue; }
    if (prev.unit_price === r.unit_price || r.unit_price == null) { skipped.push({ ref: r.ref, name: r.name, reason: `ซ้ำกับ ${prev.ref}` }); continue; }
    if (prev.unit_price == null) { Object.assign(prev, { unit_price: r.unit_price, ref: `${prev.ref}+${r.ref}` }); skipped.push({ ref: r.ref, name: r.name, reason: `รวมราคาเข้า ${prev.ref}` }); continue; }
    flag(prev, `ชื่อซ้ำในไฟล์แต่ราคาต่างกัน (${prev.unit_price} / ${r.unit_price}) — ตั้งชื่อให้ไม่ซ้ำ`);
    flag(r, `ชื่อซ้ำในไฟล์แต่ราคาต่างกัน (${prev.unit_price} / ${r.unit_price}) — ตั้งชื่อให้ไม่ซ้ำ`);
    out.push(r);
  }
  // รายการไม่มีราคาไม่มียี่ห้อจาก sheet ราคา ที่มีตัวมีราคาชื่อเดียวกันจาก BOQS แล้ว → ทิ้งตัวว่าง
  const k2 = (r) => [r.category_id, r.name, r.model].map((x) => norm(x).toLowerCase()).join('|');
  const priced = new Set(out.filter((r) => r.unit_price != null).map(k2));
  return out.filter((r) => {
    if (r.unit_price == null && !r.brand && r.source === SOURCE_UPM && priced.has(k2(r))) { skipped.push({ ref: r.ref, name: r.name, reason: 'มีรายการชื่อเดียวกันที่มีราคาจาก sheet BOQS แล้ว' }); return false; }
    return true;
  });
}

// ───────────────────────── DB ─────────────────────────
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database,
  options: { encrypt: false, trustServerCertificate: true },
});
const existing = (await pool.request().query(`SELECT COUNT(*) n, SUM(CASE WHEN source LIKE 'excel:%' THEN 1 ELSE 0 END) x FROM b2b_materials`)).recordset[0];

if (undo) {
  console.log(`ฐาน ${database}: รายการทั้งหมด ${existing.n} · มาจาก Excel ${existing.x ?? 0}`);
  if (!execute) { console.log('DRY-RUN — ใส่ --yes เพื่อถอนรายการที่นำเข้าจาก Excel'); await pool.close(); process.exit(0); }
  const tx = new sql.Transaction(pool); await tx.begin();
  const h = await new sql.Request(tx).query(`DELETE p FROM b2b_material_prices p JOIN b2b_materials m ON m.id = p.material_id WHERE m.source LIKE 'excel:%'`);
  const m = await new sql.Request(tx).query(`DELETE FROM b2b_materials WHERE source LIKE 'excel:%'`);
  await tx.commit();
  console.log(`ถอนแล้ว: รายการ ${m.rowsAffected[0]} · ประวัติราคา ${h.rowsAffected[0]}`);
  await pool.close(); process.exit(0);
}

const wb = XLSX.readFile(file, { cellFormula: true });
for (const s of ['Unit price  Material', 'EPCL - BOQS']) if (!wb.Sheets[s]) { console.error(`ไม่พบ sheet "${s}" ในไฟล์`); process.exit(1); }
readUnitPriceMaterial(wb.Sheets['Unit price  Material']);
readBoqsTyped(wb.Sheets['EPCL - BOQS']);
const final = dedupe();

// ลำดับในหมวด = ลำดับในไฟล์ (sheet ราคาก่อน แล้วตามด้วยรายการจาก BOQS)
const seq = {};
for (const r of final) r.sort_order = (seq[r.category_id] = (seq[r.category_id] ?? 0) + 10);

// สรุป
const byCat = {};
for (const r of final) {
  const s = (byCat[r.category_id] ||= { n: 0, priced: 0, pending: 0, check: 0 });
  s.n++;
  if (r.unit_price != null) s.priced++; else s.pending++;
  if (r.notes.some((x) => x.startsWith('⚠'))) s.check++;
}
console.log(`ไฟล์: ${path.basename(file)} → ฐาน ${database} (${execute ? 'นำเข้าจริง' : 'DRY-RUN'})`);
console.log('หมวด  รายการ  มีราคา  รอราคา  ⚠ตรวจ');
for (const [k, s] of Object.entries(byCat)) console.log(`${String(k).padStart(4)}  ${String(s.n).padStart(6)}  ${String(s.priced).padStart(6)}  ${String(s.pending).padStart(6)}  ${String(s.check).padStart(5)}`);
const tot = Object.values(byCat).reduce((a, s) => ({ n: a.n + s.n, priced: a.priced + s.priced, pending: a.pending + s.pending, check: a.check + s.check }), { n: 0, priced: 0, pending: 0, check: 0 });
console.log(`รวม  ${String(tot.n).padStart(6)}  ${String(tot.priced).padStart(6)}  ${String(tot.pending).padStart(6)}  ${String(tot.check).padStart(5)}  · ข้าม ${skipped.length} แถว`);

// ไฟล์สรุปให้ทีมตรวจ — วางข้างไฟล์ต้นฉบับ (โฟลเดอร์นั้นไม่เข้า git)
const basisTh = { unit: 'ต่อหน่วย', watt: 'ต่อวัตต์ของแผง', system_wp: 'ต่อ Wp ของระบบ', pct_category: '% ของต้นทุนหมวด', pct_sale: '% ของยอดขาย' };
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(final.map((r) => ({
  'ที่มา (sheet!เซลล์)': r.ref, 'หมวด': r.category_id, 'หัวข้อย่อย': r.subgroup ?? '', 'รายการ': r.name, 'ยี่ห้อ': r.brand ?? '', 'รุ่น / ขนาด': r.model ?? '',
  'W': r.spec_watt ?? '', 'หน่วย': r.unit, 'แบบราคา': basisTh[r.price_basis], 'ราคา': r.unit_price ?? 'รอราคา', 'หมายเหตุ / ต้องตรวจ': r.notes.join(' · '),
}))), 'จะนำเข้า');
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(skipped.map((s) => ({ 'ที่มา': s.ref, 'รายการ': s.name, 'เหตุผลที่ข้าม': s.reason }))), 'ข้าม');
const reviewPath = path.join(path.dirname(file), '_นำเข้า Master Data - ตรวจ.xlsx');
XLSX.writeFile(out, reviewPath);
console.log(`ไฟล์สรุปให้ตรวจ: ${reviewPath}`);

if (!execute) { console.log('DRY-RUN — ใส่ --yes เพื่อนำเข้าจริง'); await pool.close(); process.exit(0); }
if (existing.x > 0) { console.error(`มีรายการที่นำเข้าจาก Excel อยู่แล้ว ${existing.x} รายการ — ถอนก่อนด้วย --undo --yes แล้วค่อยนำเข้าใหม่`); await pool.close(); process.exit(1); }

const note = `นำเข้าจาก Excel (${path.basename(file)})`;
const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const r of final) {
    const ins = await new sql.Request(tx)
      .input('category_id', sql.Int, r.category_id).input('subgroup', sql.NVarChar(200), r.subgroup)
      .input('name', sql.NVarChar(300), r.name).input('brand', sql.NVarChar(150), r.brand).input('model', sql.NVarChar(300), r.model)
      .input('spec_watt', sql.Decimal(10, 2), r.spec_watt).input('unit', sql.NVarChar(30), String(r.unit).slice(0, 30))
      .input('basis', sql.VarChar(20), r.price_basis).input('price', sql.Decimal(14, 4), r.unit_price)
      .input('note', sql.NVarChar(500), r.notes.length ? r.notes.join(' · ').slice(0, 500) : null)
      .input('sort', sql.Int, r.sort_order).input('source', sql.NVarChar(50), r.source)
      .query(`INSERT INTO b2b_materials (category_id, subgroup, name, brand, model, spec_watt, unit, price_basis, unit_price, note, sort_order, source,
                                         price_updated_at)
              OUTPUT INSERTED.id
              VALUES (@category_id, @subgroup, @name, @brand, @model, @spec_watt, @unit, @basis, @price, @note, @sort, @source,
                      CASE WHEN @price IS NULL THEN NULL ELSE SYSDATETIMEOFFSET() END)`);
    if (r.unit_price != null) {
      await new sql.Request(tx).input('id', sql.Int, ins.recordset[0].id).input('price', sql.Decimal(14, 4), r.unit_price).input('note', sql.NVarChar(500), note)
        .query(`INSERT INTO b2b_material_prices (material_id, old_price, new_price, note) VALUES (@id, NULL, @price, @note)`);
    }
  }
  await tx.commit();
  console.log(`นำเข้าแล้ว ${final.length} รายการ`);
} catch (e) {
  await tx.rollback();
  console.error('นำเข้าไม่สำเร็จ (ยกเลิกทั้งชุด):', e.message);
  process.exitCode = 1;
}
await pool.close();
