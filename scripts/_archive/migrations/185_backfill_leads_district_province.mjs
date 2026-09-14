// Backfill leads.district / leads.province จากข้อมูลพื้นที่ที่กระจัดกระจายอยู่เดิม
//
// ลำดับความน่าเชื่อถือ (ไล่ทีละฟิลด์ ไม่ใช่ทีละแหล่ง — เอาให้เต็มที่สุด):
//   1. projects.district / projects.province ผ่าน leads.project_id — คนคีย์เอง
//      หรือ backfill จาก geocode มาแล้ว สะอาดกว่า
//   2. แกะจาก leads.installation_address ด้วย parseThaiLocation()
//
// เช่น ลีดที่โครงการรู้แค่จังหวัด แต่ที่อยู่พิมพ์ชื่อเขตไว้ ก็จะได้จังหวัดจากข้อ 1
// และเขตจากข้อ 2
//
// รันซ้ำได้ — เขียนทับเฉพาะแถวที่ยังว่าง (district IS NULL AND province IS NULL)
// จึงไม่ทับค่าที่คนแก้เองทีหลัง ถ้าต้องการคำนวณใหม่ทั้งหมดให้ส่ง --force
//
// ใช้: node scripts/migrations/185_backfill_leads_district_province.mjs --db=solardb_dev
//      node scripts/migrations/185_backfill_leads_district_province.mjs --db=solardb --force

import sql from 'mssql';
import { parseThaiLocation, normalizeProvince, stripAdminPrefix } from '../../src/lib/thai-location.ts';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const force = args.includes('--force');

if (!dbArg) {
  console.error('Usage: node 185_backfill_leads_district_province.mjs --db=<solardb|solardb_dev> [--force]');
  process.exit(1);
}
const database = dbArg.split('=')[1];
if (!database) { console.error('Empty --db value'); process.exit(1); }

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

try {
  const where = force ? '' : 'WHERE l.district IS NULL AND l.province IS NULL';
  const rows = (await pool.request().query(`
    SELECT l.id, l.installation_address, p.district AS proj_district, p.province AS proj_province
    FROM leads l
    LEFT JOIN projects p ON p.id = l.project_id
    ${where}
  `)).recordset;

  console.log(`${database}: ลีดที่ต้องประมวลผล ${rows.length} แถว${force ? ' (--force: คำนวณใหม่ทั้งหมด)' : ''}`);

  let updated = 0, skipped = 0;
  const fromProject = { district: 0, province: 0 };
  const fromAddress = { district: 0, province: 0 };

  for (const r of rows) {
    const parsed = parseThaiLocation(r.installation_address);

    // โครงการมาก่อน แล้วค่อยเติมช่องที่ยังว่างด้วยค่าที่แกะจากที่อยู่
    const projDistrict = r.proj_district ? stripAdminPrefix(r.proj_district) || null : null;
    const projProvince = normalizeProvince(r.proj_province);

    const district = projDistrict ?? parsed.district;
    const province = projProvince ?? parsed.province;

    if (!district && !province) { skipped++; continue; }

    if (projDistrict) fromProject.district++; else if (parsed.district) fromAddress.district++;
    if (projProvince) fromProject.province++; else if (parsed.province) fromAddress.province++;

    await pool.request()
      .input('id', sql.Int, r.id)
      .input('district', sql.NVarChar(100), district)
      .input('province', sql.NVarChar(100), province)
      .query('UPDATE leads SET district = @district, province = @province WHERE id = @id');
    updated++;
  }

  console.log(`\nอัปเดต ${updated} แถว · ข้าม ${skipped} แถว (ไม่มีข้อมูลพื้นที่ให้แกะ)`);
  console.log(`  เขต/อำเภอ : จากโครงการ ${fromProject.district} · จากที่อยู่ ${fromAddress.district}`);
  console.log(`  จังหวัด   : จากโครงการ ${fromProject.province} · จากที่อยู่ ${fromAddress.province}`);

  const after = (await pool.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN district IS NOT NULL THEN 1 ELSE 0 END) AS has_district,
      SUM(CASE WHEN province IS NOT NULL THEN 1 ELSE 0 END) AS has_province
    FROM leads`)).recordset[0];
  const pct = n => `${(n / after.total * 100).toFixed(1)}%`;
  console.log(`\nผลรวมทั้งตาราง (${after.total} ลีด): มีเขต/อำเภอ ${after.has_district} (${pct(after.has_district)}) · มีจังหวัด ${after.has_province} (${pct(after.has_province)})`);
} catch (e) {
  console.error('Backfill failed:', e.message);
  await pool.close();
  process.exit(1);
}

await pool.close();
