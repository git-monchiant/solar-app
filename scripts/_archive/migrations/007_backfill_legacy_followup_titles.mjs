// Backfill legacy `lead_activities.title` so existing follow-up rows match the
// 5 structured outcomes that the new AddActivityModal writes:
//   A = "ติดต่อได้ - Sale เสนอขาย"
//   B = "ติดต่อได้ - ลูกค้าไม่สะดวกคุย"
//   C = "ติดต่อไม่ได้ - ไม่รับสาย"
//   D = "ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง"
//
// Strict regex match on `note` only — no guessing. Unmatched rows (NULL note
// or ambiguous wording) are left untouched, so LeadCard's structured-prefix
// guard will simply not render a chip for them. Idempotent: rows already
// using one of the 5 prefixes are skipped by the WHERE clause.
//
// Usage:
//   node scripts/migrations/007_backfill_legacy_followup_titles.mjs --db=solardb_dev
//   node scripts/migrations/007_backfill_legacy_followup_titles.mjs --db=solardb
//   node scripts/migrations/007_backfill_legacy_followup_titles.mjs --db=solardb --dry-run

import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const dryRun = args.includes('--dry-run');

if (!dbArg) {
  console.error('Usage: node 007_backfill_legacy_followup_titles.mjs --db=<solardb|solardb_dev> [--dry-run]');
  process.exit(1);
}
const database = dbArg.split('=')[1];

const A = "ติดต่อได้ - Sale เสนอขาย";
const B = "ติดต่อได้ - ลูกค้าไม่สะดวกคุย";
const C = "ติดต่อไม่ได้ - ไม่รับสาย";
const D = "ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง";

function classify(note) {
  if (!note) return null;
  const n = note;
  if (/เบอร์ผิด|ผิดเบอร์|ข้อมูลผิด|ข้อมูลไม่ถูก|wrong number|เบอร์ไม่ถูก/i.test(n)) return D;
  if (/ไม่รับสาย|ลูกค้าเงียบ|ไม่ตอบกลับ|ลูกค้าไม่ตอบ|ติดต่อ.{0,3}ไม่.{0,3}ได้|ติดต่อ.{0,3}ไ.{0,3}ม่ได้/i.test(n)) return C;
  if (/ไม่สะดวก|อยู่ตลาด|ติดประชุม|ไม่ว่างคุย/i.test(n)) return B;
  if (/ราคา|เสนอ|kwp|kWh|แพ็คเกจ|แพคเกจ|ขอคุย(กับ)?(แฟน|ทางบ้าน|ภรรยา)|ขอเวลาคิด|ขอคิดดู|รอช่วง|ฟีดแบค|ปลายปี|ข้อมูลเพิ่ม|ตัดสินใจ|งบประมาณ|สินเชื่อ|อัพเกรด|scale.?up/i.test(n)) return A;
  return null;
}

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Database: ${database}${dryRun ? '  [DRY RUN]' : ''}`);
if (database === 'solardb' && !dryRun) console.log('⚠️  PRODUCTION DATABASE');

const rows = (await pool.request().query(`
  SELECT id, note
  FROM lead_activities
  WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    AND title IS NOT NULL
    AND title NOT LIKE N'ติดต่อได้%'
    AND title NOT LIKE N'ติดต่อไม่ได้%'
    AND title <> N'อื่นๆ'
`)).recordset;

const buckets = { [A]: [], [B]: [], [C]: [], [D]: [] };
for (const r of rows) {
  const v = classify(r.note);
  if (v) buckets[v].push(r.id);
}

const total = Object.values(buckets).reduce((s, a) => s + a.length, 0);
console.log(`\nLegacy follow-up rows scanned: ${rows.length}`);
console.log(`Rows to update:                ${total}\n`);
for (const k of [A, B, C, D]) {
  console.log(`  ${String(buckets[k].length).padStart(4)}  → ${k}`);
}

if (dryRun) {
  console.log('\nDry run only — no rows changed.');
  await pool.close();
  process.exit(0);
}

if (total === 0) {
  console.log('\nNothing to update.');
  await pool.close();
  process.exit(0);
}

console.log('\nApplying updates...');
for (const [val, ids] of Object.entries(buckets)) {
  if (ids.length === 0) continue;
  // Chunk to keep parameter count well under SQL Server's 2100 limit.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const req = pool.request().input('title', sql.NVarChar(sql.MAX), val);
    const placeholders = chunk.map((id, idx) => {
      req.input(`id${idx}`, sql.Int, id);
      return `@id${idx}`;
    }).join(',');
    await req.query(`UPDATE lead_activities SET title = @title WHERE id IN (${placeholders})`);
  }
  console.log(`  updated ${ids.length} → ${val}`);
}

// Manual ID-based overrides for rows where regex falls short (typos,
// substantive notes that don't trip the keyword patterns). Each entry was
// hand-classified — see the dry-run report in scripts/tools/dump_unmatched.mjs.
const MANUAL = [
  { id: 1208, title: C, expectNote: 'ติดต่อไ่ม่ได้' },          // typo of "ติดต่อไม่ได้"
  { id: 1147, title: C, expectNote: 'ติดต่อลูกค้าไม่ได้' },
  { id: 1692, title: A, expectNote: 'ติดตามเอกสารลูกค้า ยื่นธนาคาร' },
  { id: 1564, title: A, expectNote: 'รอพิจารณา' },
  { id: 1547, title: A, expectNote: 'ลูกค้าคุณเชอร์รี่ จองสำรวจ-รอชำระ' },
  { id: 1546, title: A, expectNote: 'ลูกค้าคุณเชอร์รี่ จองสำรวจ-รอชำระ' },
  { id: 1545, title: A, expectNote: 'ลูกค้าคุณเชอร์รี่ จองสำรวจ-รอชำระ' },
  { id: 1526, title: A, expectNote: 'ลูกค้าแอดไลน์สอบถามเพิ่มเติม' },
  { id: 1517, title: A, expectNote: '7/5/2026 ลูกค้าให้ติดต่ออีกครั้ง' },
  { id: 1430, title: A, expectNote: 'ลูกค้าแจ้งแอดไลน์แต่ยังไม่แอด' },
  { id: 841,  title: A, expectNote: 'ลูกค้าบอกว่าไม่สนใจ' },
];

console.log('\nApplying manual ID overrides...');
let manualApplied = 0;
let manualSkipped = 0;
for (const m of MANUAL) {
  const cur = (await pool.request().input('id', sql.Int, m.id)
    .query(`SELECT note, title FROM lead_activities WHERE id = @id`)).recordset[0];
  if (!cur) { console.log(`  id=${m.id}  NOT FOUND — skipped`); manualSkipped++; continue; }
  // Skip if note no longer matches what we hand-classified — avoids
  // clobbering a row that got edited after the classification was decided.
  if (!cur.note || !cur.note.startsWith(m.expectNote.slice(0, 15))) {
    console.log(`  id=${m.id}  note changed — skipped`);
    manualSkipped++;
    continue;
  }
  await pool.request()
    .input('id', sql.Int, m.id)
    .input('title', sql.NVarChar(sql.MAX), m.title)
    .query(`UPDATE lead_activities SET title = @title WHERE id = @id`);
  console.log(`  ${m.id} → ${m.title}`);
  manualApplied++;
}
console.log(`Manual: ${manualApplied} applied, ${manualSkipped} skipped`);

console.log('\nDone.');
await pool.close();
