// 197: ค่าไฟเฉลี่ยต่อเดือนในใบเสนอราคาที่สร้างไปแล้ว ให้ตรงกับคำตอบในแบบสอบถามลูกค้า
//
// เดิม QuotationBuilder หยิบค่าไฟจากฟอร์มสำรวจก่อนแบบสอบถาม ฟอร์มสำรวจมีตัวเลขที่ไม่ใช่
// ค่าจริงปนอยู่ (99,999 / 999,999 / 9,999,999) และค่าที่ทีมสำรวจกรอกไม่ตรงกับที่ลูกค้าตอบ
// ตัวเลขนี้ถูกพิมพ์ลง PDF (หน้ารายงานสำรวจและหน้าเปรียบเทียบเงินกู้) และใช้คำนวณยอดประหยัด
// กับระยะคืนทุน เช่น SSR-QT-26-0049 ขึ้นค่าไฟ 999,999 ทั้งที่ลูกค้าตอบ 9,000
//
// สำหรับทุกใบที่ค่าไฟไม่ตรงกับแบบสอบถาม:
//   1. document_inputs_json.current_monthly_bill = ค่าจากแบบสอบถาม
//   2. คำนวณ financial snapshot ใหม่ด้วยสูตรเดียวกับระบบ (calculateFinancialSnapshot)
//      โดยใช้ quotation/package จาก snapshot ของใบเอง ข้อมูลอื่นในเอกสารจึงไม่เปลี่ยน
//   3. ลบไฟล์ PDF ที่แช่ไว้ ระบบสร้างใหม่จาก snapshot ที่แก้แล้วเมื่อเปิดครั้งถัดไป
//   4. บันทึกใน Timeline ของลีดว่าตัวเลขเปลี่ยนจากเท่าไรเป็นเท่าไร
//
// ความปลอดภัย: ก่อนเขียน คำนวณซ้ำด้วยค่าเดิมต้องได้ผลตรงกับที่เก็บไว้ทุกหลัก ถ้าไม่ตรง
// (เช่นใบที่คำนวณด้วยสูตรรุ่นเก่า) จะข้ามใบนั้นและรายงาน ไม่เขียนตัวเลขที่ตรวจทานไม่ได้
//
// ค่าแบบสอบถามอ่านจาก snapshot ของใบเอง (lead_data ตอนอนุมัติ) ถ้าไม่มีค่อยอ่านจากปัจจุบัน
// ต้องรันหลัง deploy โค้ดที่แก้ survey-report.js แล้ว ไม่อย่างนั้นใครเปิด PDF ระหว่างนั้น
// ระบบจะสร้างไฟล์ใหม่ด้วยโค้ดเก่าแล้วแช่ไว้อีก
//
// รันซ้ำได้ — รอบที่สองไม่พบใบที่ค่าไม่ตรง · --dry-run เพื่อดูรายการโดยไม่เขียน

import sql from 'mssql';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const dryRun = args.includes('--dry-run');
if (!dbArg) {
  console.error('Usage: node 197_quotation_monthly_bill_from_questionnaire.mjs --db=<solardb|solardb_dev> [--dry-run]');
  process.exit(1);
}
const database = dbArg.split('=')[1];

// ใช้สูตรคำนวณจริงของระบบ ไม่เขียนสูตรซ้ำในสคริปต์ — quotation-document.ts import
// "server-only" ซึ่งโยน error นอก Next.js จึงชี้ไปที่ไฟล์เปล่าแทน
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stub = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig197-')), 'server-only.mjs');
fs.writeFileSync(stub, 'export {};\n');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(repoRoot, 'src'), 'server-only': stub } });
const { calculateFinancialSnapshot, parseDocumentInputs } = await jiti.import(path.join(repoRoot, 'src/lib/quotation-document.ts'));

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

const baht = n => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const num = v => (v == null || v === '' ? null : Number(v));

try {
  const rows = (await pool.request().query(`
    SELECT q.id, q.lead_id, q.doc_no, q.status, q.package_id,
           q.subtotal_incl_vat, q.contract_total_incl_vat, q.outstanding_amount,
           q.document_inputs_json, q.financial_snapshot_json, q.document_snapshot_json,
           d.monthly_bill AS live_bill, p.kwp AS live_kwp
    FROM quotations q
    LEFT JOIN lead_data d ON d.lead_id = q.lead_id
    LEFT JOIN packages p ON p.id = q.package_id
    WHERE ISJSON(q.document_inputs_json) = 1
      AND TRY_CAST(JSON_VALUE(q.document_inputs_json, '$.current_monthly_bill') AS DECIMAL(14,2)) > 0
    ORDER BY q.id
  `)).recordset;

  let changed = 0;
  const skipped = [];
  for (const r of rows) {
    const doc = r.document_snapshot_json ? JSON.parse(r.document_snapshot_json) : null;
    const questionnaire = num(doc?.lead_data?.monthly_bill) || num(r.live_bill);
    const rawInputs = JSON.parse(r.document_inputs_json);
    const current = num(rawInputs.current_monthly_bill);
    if (!(questionnaire > 0) || current === questionnaire) continue;

    const quotationObj = doc?.quotation ?? {
      subtotal_incl_vat: r.subtotal_incl_vat,
      contract_total_incl_vat: r.contract_total_incl_vat,
      outstanding_amount: r.outstanding_amount,
    };
    const packageObj = doc?.package ?? { kwp: r.live_kwp };
    const storedFin = r.financial_snapshot_json ? JSON.parse(r.financial_snapshot_json) : null;

    if (storedFin) {
      const replay = calculateFinancialSnapshot(parseDocumentInputs(rawInputs), quotationObj, packageObj);
      if (JSON.stringify(replay.outputs) !== JSON.stringify(storedFin.outputs)) {
        skipped.push(`${r.doc_no} (คำนวณซ้ำด้วยค่าเดิมได้ไม่ตรงกับที่เก็บไว้)`);
        continue;
      }
    }

    const newRaw = { ...rawInputs, current_monthly_bill: questionnaire };
    const newFin = calculateFinancialSnapshot(parseDocumentInputs(newRaw), quotationObj, packageObj);
    const oldPayback = storedFin?.outputs?.payback_months;
    const newPayback = newFin.outputs.payback_months;
    console.log(`${r.doc_no} (ลีด ${r.lead_id}, ${r.status}) ค่าไฟ ${baht(current)} → ${baht(questionnaire)} · คืนทุน ${oldPayback ?? '-'} → ${newPayback} เดือน`);
    if (dryRun) { changed++; continue; }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const req = new sql.Request(tx)
        .input('id', sql.Int, r.id)
        .input('inputs', sql.NVarChar(sql.MAX), JSON.stringify(newRaw))
        .input('fin', sql.NVarChar(sql.MAX), storedFin ? JSON.stringify(newFin) : null)
        .input('doc', sql.NVarChar(sql.MAX), doc ? JSON.stringify({ ...doc, financial: newFin }) : null)
        .input('bill_before', sql.Decimal(14, 2), current);
      const upd = await req.query(`
        UPDATE quotations
        SET document_inputs_json = @inputs,
            financial_snapshot_json = COALESCE(@fin, financial_snapshot_json),
            document_snapshot_json = COALESCE(@doc, document_snapshot_json)
        WHERE id = @id
          AND TRY_CAST(JSON_VALUE(document_inputs_json, '$.current_monthly_bill') AS DECIMAL(14,2)) = @bill_before
      `);
      if (upd.rowsAffected[0] !== 1) throw new Error(`${r.doc_no}: ข้อมูลเปลี่ยนระหว่างรัน — ข้าม`);
      await new sql.Request(tx).input('id', sql.Int, r.id)
        .query(`DELETE FROM quotation_document_artifacts WHERE quotation_id = @id`);
      await new sql.Request(tx)
        .input('lead_id', sql.Int, r.lead_id)
        .input('title', sql.NVarChar(200), `ปรับค่าไฟเฉลี่ยต่อเดือนในใบเสนอราคา ${r.doc_no} ให้ตรงกับแบบสอบถาม`)
        .input('note', sql.NVarChar(500),
          `ค่าไฟเดิม ${baht(current)} บาท/เดือน เปลี่ยนเป็น ${baht(questionnaire)} บาท/เดือน`
          + (oldPayback != null ? ` · ระยะคืนทุนเดิม ${oldPayback} เดือน เปลี่ยนเป็น ${newPayback} เดือน` : ''))
        .query(`
          INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by, created_at)
          VALUES (@lead_id, 'quotation', @title, @note, 1, SYSDATETIME())
        `);
      await tx.commit();
      changed++;
    } catch (error) {
      await tx.rollback();
      skipped.push(`${r.doc_no} (${error.message})`);
    }
  }

  console.log(`\n${dryRun ? '[dry-run] จะแก้' : 'แก้แล้ว'} ${changed} ใบ · ข้าม ${skipped.length} ใบ`);
  for (const s of skipped) console.log(`  ข้าม ${s}`);
  if (skipped.length) process.exitCode = 1;
} finally {
  await pool.close();
}
