// ล้างข้อมูลทดสอบของโมดูล B2B ก่อนทีมใช้งานจริง
// ผู้ใช้ขอ 6 ต.ค. 69 (หลังลองหน้า BOQ) · เคาะ 15 ต.ค. ให้ลบใบ BOQ ทดสอบก่อนเริ่มเฟส 1 ของแผน docs/plan/20261015-07-b2b-project-flow.md
//
//   --projects=all        ลบโครงการทุกโครงการ + timeline + ใบเสนอราคา + งวดเงิน (+ไฟล์หลักฐาน) + BOQ ของโครงการ + บริษัทลูกค้าที่ไม่เหลือโครงการ
//   --projects=test       ลบเฉพาะโครงการที่ชื่อโครงการ/บริษัทมีคำว่า test (บริษัทลบเฉพาะที่ชื่อมี test และไม่เหลือโครงการ)
//   --boqs=all            ลบใบ BOQ ทุกใบ (ทุก Rev + บรรทัด)
//   --boqs=test           ลบเฉพาะเลขที่ที่ชื่อโครงการ/ลูกค้า (Rev ไหนก็ได้) มีคำว่า test — ลบทั้งชุด Rev ของเลขที่นั้น
//   --manual-materials    ลบรายการ Master ที่สร้างเองในหน้าเว็บ (ไม่ได้มาจาก Excel) ที่ไม่มีใบ BOQ อ้างแล้ว + ประวัติราคา
//   ไม่ใส่ --yes          = DRY-RUN แสดงรายการที่จะลบ ไม่แตะข้อมูล
//
// อยากล้าง Master ที่มาจาก Excel แล้วนำเข้าใหม่ → ใช้ b2b_import_materials.mjs --undo --yes แล้วนำเข้าอีกรอบ
// เลขที่ BOQ / โครงการ คิดจาก MAX ของเดือน ⇒ ลบหมดแล้วใบแรกถัดไปกลับมาเริ่ม -001
//
// ใช้งาน
//   node scripts/tools/b2b_clean_test_data.mjs --db=solardb_v3 --boqs=all                # dry-run
//   node scripts/tools/b2b_clean_test_data.mjs --db=solardb_v3 --boqs=all --yes          # ลบจริง
//   node scripts/tools/b2b_clean_test_data.mjs --db=solardb_v3 --manual-materials --yes
//   node scripts/tools/b2b_clean_test_data.mjs --db=solardb_v3 --projects=test --yes
import sql from 'mssql';
import path from 'path';
import { unlink } from 'fs/promises';

// ที่เก็บไฟล์หลักฐานรับเงิน — ตรงกับ src/lib/b2b/file-store.ts (B2B_UPLOAD_DIR หรือ storage/b2b-files)
const FILE_DIR = process.env.B2B_UPLOAD_DIR ? path.resolve(process.env.B2B_UPLOAD_DIR) : path.join(process.cwd(), 'storage', 'b2b-files');
const safeName = (n) => !!n && /^[A-Za-z0-9._-]+$/.test(n) && !n.includes('..');
const filesToRemove = [];

const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const database = arg('db');
const boqs = arg('boqs');
const projects = arg('projects');
const manualMaterials = args.includes('--manual-materials');
const execute = args.includes('--yes');
if (!database || !/v3$/i.test(database)) { console.error('ต้องระบุ --db=<ฐานของ v3> (ตาราง b2b_* มีเฉพาะฐาน v3)'); process.exit(1); }
if (boqs && !['all', 'test'].includes(boqs)) { console.error('--boqs ต้องเป็น all หรือ test'); process.exit(1); }
if (projects && !['all', 'test'].includes(projects)) { console.error('--projects ต้องเป็น all หรือ test'); process.exit(1); }
if (!boqs && !projects && !manualMaterials) { console.error('ต้องระบุอย่างน้อยหนึ่งอย่าง: --projects=all|test · --boqs=all|test · --manual-materials'); process.exit(1); }

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`ฐาน ${database} (${execute ? 'ลบจริง' : 'DRY-RUN'})`);

const tx = new sql.Transaction(pool);
await tx.begin();
const q = (text) => new sql.Request(tx).query(text);
try {
  // โครงการก่อน — ลบ BOQ ของโครงการไปด้วย (ใบในโครงการอ้าง project_id ด้วย FK)
  if (projects) {
    const where = projects === 'all'
      ? '1 = 1'
      : `p.name LIKE N'%test%' OR p.customer_id IN (SELECT id FROM b2b_customers WHERE name LIKE N'%test%')`;
    const rows = (await q(`
      SELECT p.id, p.code, p.name, c.name AS customer_name, p.stage,
             (SELECT COUNT(*) FROM b2b_boqs b WHERE b.project_id = p.id) AS boqs,
             (SELECT COUNT(*) FROM b2b_quotations x WHERE x.project_id = p.id) AS quotes
      FROM b2b_projects p JOIN b2b_customers c ON c.id = p.customer_id WHERE ${where} ORDER BY p.id`)).recordset;
    console.log(`
โครงการที่จะลบ: ${rows.length} · BOQ ของโครงการ ${rows.reduce((s, r) => s + r.boqs, 0)} แถว (ทุก Rev)`);
    for (const r of rows) console.log(`  ${r.code} · ${r.name} · ${r.customer_name} · ขั้น ${r.stage} · BOQ ${r.boqs} แถว · ใบเสนอราคา ${r.quotes} แถว`);
    const ids = rows.length ? rows.map((r) => r.id).join(',') : '0';
    if (execute && rows.length > 0) {
      // สัญญา (won_quote_id/won_boq_id) อ้างใบ/BOQ · ใบอ้างโครงการ+BOQ — ปลดสัญญาก่อน แล้วลบงวด → ใบ → BOQ
      await q(`UPDATE b2b_projects SET won_quote_id = NULL, won_boq_id = NULL WHERE id IN (${ids})`);
      const files = (await q(`SELECT evidence_file FROM b2b_project_installments WHERE project_id IN (${ids}) AND evidence_file IS NOT NULL`)).recordset;
      filesToRemove.push(...files.map((f) => f.evidence_file));
      // ดำเนินโครงการ (เฟส 4) — รูป/ไฟล์ milestone + เอกสารขออนุญาต
      const msFiles = (await q(`SELECT files_json FROM b2b_project_milestones WHERE project_id IN (${ids}) AND files_json IS NOT NULL`)).recordset;
      for (const r of msFiles) filesToRemove.push(...JSON.parse(r.files_json).map((f) => f.file));
      const pmFiles = (await q(`SELECT file_name FROM b2b_project_permits WHERE project_id IN (${ids}) AND file_name IS NOT NULL`)).recordset;
      filesToRemove.push(...pmFiles.map((f) => f.file_name));
      // O&M B2B (แผน 20261015-09) — timeline → ครั้งเข้างาน (+ ไฟล์รายงาน) → สัญญา
      const omFiles = (await q(`SELECT files_json FROM b2b_om_visits WHERE project_id IN (${ids}) AND files_json IS NOT NULL`)).recordset;
      for (const r of omFiles) filesToRemove.push(...JSON.parse(r.files_json).map((f) => f.file));
      await q(`DELETE FROM b2b_om_activities WHERE contract_id IN (SELECT id FROM b2b_om_contracts WHERE project_id IN (${ids}))`);
      const omv = await q(`DELETE FROM b2b_om_visits WHERE project_id IN (${ids})`);
      const omc = await q(`DELETE FROM b2b_om_contracts WHERE project_id IN (${ids})`);
      const ms = await q(`DELETE FROM b2b_project_milestones WHERE project_id IN (${ids})`);
      const pm = await q(`DELETE FROM b2b_project_permits WHERE project_id IN (${ids})`);
      const ins = await q(`DELETE FROM b2b_project_installments WHERE project_id IN (${ids})`);
      const qt = await q(`DELETE FROM b2b_quotations WHERE project_id IN (${ids})`);
      const i = await q(`DELETE FROM b2b_boq_items WHERE boq_id IN (SELECT id FROM b2b_boqs WHERE project_id IN (${ids}))`);
      const b = await q(`DELETE FROM b2b_boqs WHERE project_id IN (${ids})`);
      const a = await q(`DELETE FROM b2b_project_activities WHERE project_id IN (${ids})`);
      const p = await q(`DELETE FROM b2b_projects WHERE id IN (${ids})`);
      console.log(`ลบแล้ว: โครงการ ${p.rowsAffected[0]} · timeline ${a.rowsAffected[0]} · งวดเงิน ${ins.rowsAffected[0]} · หน้างาน ${ms.rowsAffected[0]} · สัญญา O&M ${omc.rowsAffected[0]} (${omv.rowsAffected[0]} ครั้ง) · ขออนุญาต ${pm.rowsAffected[0]} · ใบเสนอราคา ${qt.rowsAffected[0]} แถว · BOQ ${b.rowsAffected[0]} แถว · บรรทัด ${i.rowsAffected[0]}`);
    }
    // บริษัทที่ไม่เหลือโครงการ — โหมด test ลบเฉพาะบริษัทที่ชื่อมี test (บริษัทจริงที่เพิ่งพิมพ์ไว้ยังอยู่)
    // คิดจาก "โครงการที่เหลือหลังลบ" (ไม่นับ ids) ⇒ dry-run แสดงตรงกับตอนลบจริง
    const orphan = `NOT EXISTS (SELECT 1 FROM b2b_projects p WHERE p.customer_id = c.id AND p.id NOT IN (${ids}))${projects === 'test' ? ` AND c.name LIKE N'%test%'` : ''}`;
    const cust = (await q(`SELECT c.id, c.name FROM b2b_customers c WHERE ${orphan}`)).recordset;
    console.log(`บริษัทลูกค้าที่ไม่เหลือโครงการ (จะลบ): ${cust.length}${cust.length ? ' — ' + cust.map((c) => c.name).join(' · ') : ''}`);
    if (execute && cust.length > 0) await q(`DELETE c FROM b2b_customers c WHERE ${orphan}`);
  }

  if (boqs) {
    // test = ทั้งชุดเลขที่ที่มี Rev ใดก็ได้เข้าเงื่อนไข — ลบแค่บาง Rev แล้วชุดเลขที่จะขาดตอน (is_latest/root_id ชี้หาย)
    const where = boqs === 'all'
      ? '1 = 1'
      : `doc_no IN (SELECT doc_no FROM b2b_boqs WHERE project_name LIKE N'%test%' OR customer_name LIKE N'%test%')`;
    const rows = (await q(`
      SELECT b.id, b.doc_no, b.revision, b.project_name, b.customer_name,
             (SELECT COUNT(*) FROM b2b_boq_items i WHERE i.boq_id = b.id) AS items
      FROM b2b_boqs b WHERE ${where} ORDER BY b.doc_no, b.revision`)).recordset;
    console.log(`\nใบ BOQ ที่จะลบ: ${rows.length} แถว (${new Set(rows.map((r) => r.doc_no)).size} เลขที่) · บรรทัด ${rows.reduce((s, r) => s + r.items, 0)}`);
    for (const r of rows) console.log(`  ${r.doc_no} Rev ${r.revision} · ${r.project_name} · ${r.customer_name ?? '-'} · ${r.items} บรรทัด`);
    if (execute && rows.length > 0) {
      await q(`UPDATE b2b_projects SET won_quote_id = NULL WHERE won_quote_id IN (SELECT id FROM b2b_quotations WHERE boq_id IN (SELECT id FROM b2b_boqs WHERE ${where}))`);
      await q(`UPDATE b2b_projects SET won_boq_id = NULL WHERE won_boq_id IN (SELECT id FROM b2b_boqs WHERE ${where})`);
      await q(`DELETE FROM b2b_quotations WHERE boq_id IN (SELECT id FROM b2b_boqs WHERE ${where})`);
      const i = await q(`DELETE FROM b2b_boq_items WHERE boq_id IN (SELECT id FROM b2b_boqs WHERE ${where})`);
      const b = await q(`DELETE FROM b2b_boqs WHERE ${where}`);
      console.log(`ลบแล้ว: ใบ ${b.rowsAffected[0]} แถว · บรรทัด ${i.rowsAffected[0]}`);
    }
  }

  if (manualMaterials) {
    // ใบ BOQ ที่ยังอยู่อ้างรายการด้วย material_id (FK) — รายการที่ยังถูกอ้างลบไม่ได้ ให้ปิดใช้งานในหน้าเว็บแทน
    const manual = `source IS NULL OR source NOT LIKE 'excel:%'`;
    const rows = (await q(`
      SELECT m.id, m.code, m.name, m.model,
             (SELECT COUNT(*) FROM b2b_boq_items i WHERE i.material_id = m.id) AS used
      FROM b2b_materials m WHERE ${manual} ORDER BY m.id`)).recordset;
    const free = rows.filter((r) => r.used === 0);
    console.log(`\nรายการ Master ที่สร้างเอง: ${rows.length} · ลบได้ ${free.length} · ยังมีใบ BOQ อ้าง ${rows.length - free.length} (ข้าม)`);
    for (const r of rows) console.log(`  ${r.code} · ${r.name}${r.model ? ` · ${r.model}` : ''}${r.used ? ` — ข้าม (อ้างใน ${r.used} บรรทัด)` : ''}`);
    if (execute && free.length > 0) {
      const ids = free.map((r) => r.id).join(',');
      const h = await q(`DELETE FROM b2b_material_prices WHERE material_id IN (${ids})`);
      const m = await q(`DELETE FROM b2b_materials WHERE id IN (${ids})`);
      console.log(`ลบแล้ว: รายการ ${m.rowsAffected[0]} · ประวัติราคา ${h.rowsAffected[0]}`);
    }
  }

  if (execute) {
    await tx.commit();
    // ไฟล์หลักฐาน/หน้างาน/ขออนุญาต — ลบหลัง commit (ฐานถอยได้ ไฟล์ถอยไม่ได้)
    for (const f of filesToRemove) if (safeName(f)) await unlink(path.join(FILE_DIR, f)).catch(() => {});
    if (filesToRemove.length) console.log(`ลบไฟล์ ${filesToRemove.length} ไฟล์`);
    console.log('\nเสร็จ');
  }
  else { await tx.rollback(); console.log('\nDRY-RUN — ใส่ --yes เพื่อลบจริง'); }
} catch (e) {
  try { await tx.rollback(); } catch {}
  console.error('ล้มเหลว — ยกเลิกทั้งหมด (ไม่มีอะไรถูกลบ):', e.message);
  process.exitCode = 1;
}
await pool.close();
