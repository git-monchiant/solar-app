// Backfill / validate / nightly-recompute ของ leads.journey_step / journey_sub
// (design: docs/plan/20260813-01-journey-step-codes.md — กติกาอยู่ที่ src/lib/journey-rules.mjs)
//
// Usage:
//   node scripts/tools/backfill_journey.mjs --db=solardb_v3          # dry-run = VALIDATE
//   node scripts/tools/backfill_journey.mjs --db=solardb_v3 --yes    # เขียนค่าที่ต่างลง DB
//
// dry-run เทียบค่า stored กับค่าคำนวณสดทุก lead แล้วรายงาน mismatch (exit 1 ถ้ามี)
// — ใช้เป็นตัว validate หลัง backfill และหลังใช้งานจริงเพื่อพิสูจน์ว่า hook ครบ
// โหมด --yes ใช้เป็น nightly recompute ได้เลย: เกลี่ยเคสขึ้นกับเวลา (นัดสำรวจ→กำลังสำรวจ,
// รอติดตั้ง→กำลังติดตั้ง) และ self-heal drift ทุกชนิด

import sql from 'mssql';
import { computeJourney, JOURNEY_FLAGS_SQL } from '../../src/lib/journey-rules.mjs';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const execute = args.includes('--yes');

if (!dbArg) {
  console.error('Usage: node scripts/tools/backfill_journey.mjs --db=<solardb_v3> [--yes]');
  process.exit(1);
}
const database = dbArg.split('=')[1];
if (!database || database === 'master') { console.error('Bad --db value'); process.exit(1); }

const config = {
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
};

const pool = await sql.connect(config);

const rows = (await pool.request().query(`
  SELECT l.id, l.status, l.survey_date, l.install_date, l.install_completed_at,
         l.journey_step, l.journey_sub,
         ${JOURNEY_FLAGS_SQL}
  FROM leads l
`)).recordset;

const codeOf = (step, sub) => (step == null ? 'NULL' : `${step}/${sub}`);
const changes = [];
const dist = new Map();

for (const row of rows) {
  const j = computeJourney(row);
  const step = j ? j.step : null;
  const sub = j ? j.sub : null;
  const code = codeOf(step, sub);
  dist.set(code, (dist.get(code) ?? 0) + 1);
  if (row.journey_step !== step || row.journey_sub !== sub) {
    changes.push({ id: row.id, status: row.status, from: codeOf(row.journey_step, row.journey_sub), to: code, step, sub });
  }
}

console.log(`DB: ${database} · leads ทั้งหมด ${rows.length}`);
console.log('\nการกระจายตาม code (คำนวณสด):');
for (const [code, n] of [...dist.entries()].sort((a, b) => {
  const pa = a[0] === 'NULL' ? Infinity : parseInt(a[0]);
  const pb = b[0] === 'NULL' ? Infinity : parseInt(b[0]);
  return pa - pb || a[0].localeCompare(b[0]);
})) {
  console.log(`  ${code.padEnd(10)} ${n}`);
}

console.log(`\nค่าใน DB ต่างจากค่าคำนวณ: ${changes.length} แถว`);
for (const c of changes.slice(0, 30)) {
  console.log(`  lead ${String(c.id).padEnd(5)} status=${c.status.padEnd(14)} ${c.from} → ${c.to}`);
}
if (changes.length > 30) console.log(`  … และอีก ${changes.length - 30} แถว`);

if (!execute) {
  await pool.close();
  if (changes.length > 0) {
    console.log('\nDRY-RUN — ยังไม่เขียนอะไร (ใส่ --yes เพื่อเขียน) · exit 1 เพราะมี mismatch');
    process.exit(1);
  }
  console.log('\n✅ VALIDATE ผ่าน — ค่าใน DB ตรงกับกติกาทุกแถว');
  process.exit(0);
}

for (const c of changes) {
  await pool.request()
    .input('id', sql.Int, c.id)
    .input('step', sql.Int, c.step)
    .input('sub', sql.Int, c.sub)
    .query('UPDATE leads SET journey_step = @step, journey_sub = @sub, journey_updated_at = GETDATE() WHERE id = @id');
}
await pool.close();
console.log(`\n✅ เขียนแล้ว ${changes.length} แถว`);
