// Backfill lead_activities.title for follow-up rows whose outcome was lost
// when the buggy API discarded body.title. Apply keyword heuristics to the
// note column to recover what outcome the sales person likely picked.
//
// Default: dry-run on dev, prints proposed changes. Pass --yes to apply.
// Override target via --db=solardb (prod, ask first).
//
// Heuristic order (first match wins):
//   1. fail keywords → "ติดต่อไม่ได้ - ไม่รับสาย"
//   2. wrong-contact → "ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง"
//   3. not-convenient → "ติดต่อได้ - ลูกค้าไม่สะดวกคุย"
//   4. sale keywords  → "ติดต่อได้ - Sale เสนอขาย"
//   5. obvious mash   → DELETE
//   else → leave as-is

import sql from 'mssql';
const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');

const RULES = [
  { pattern: /ไม่รับสาย|ยังไม่ตอบ|ยังไม่ตอบรับ|เงียบ|ไม่ติดต่อกลับ/, outcome: 'ติดต่อไม่ได้ - ไม่รับสาย' },
  { pattern: /เบอร์ผิด|เบอร์ไม่ถูก|ข้อมูลผิด|ข้อมูลไม่ถูก/, outcome: 'ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง' },
  { pattern: /ไม่สะดวก|อยู่ รพ\.|อยู่ระหว่างเดินทาง|ติดประชุม|ในเวลางาน/, outcome: 'ติดต่อได้ - ลูกค้าไม่สะดวกคุย' },
  { pattern: /สนใจ|เสนอ|ขายไฟ|ส่วนลด|นัด|ติดต่อกลับ|สอบถาม|TTB|สินเชื่อ|ติดตั้ง|upgrade|Huawei|ผ่อน|ราคา/, outcome: 'ติดต่อได้ - Sale เสนอขาย' },
];
const DELETE_RULES = [
  { pattern: /^(ะำหะ|หกดกห|asdf|test|qwer)$/i },  // exact-match keyboard mash
];

const GENERIC_TITLES = ['Called customer', 'Visited customer', 'Contacted via LINE', 'Other contact'];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database}`);
console.log(`Mode:      ${execute ? 'EXECUTE' : 'DRY-RUN (pass --yes to apply)'}\n`);

const r = await pool.request().query(`
  SELECT la.id, la.lead_id, la.activity_type, la.title, la.note, la.follow_up_date,
         l.full_name AS lead_name
  FROM lead_activities la
  LEFT JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
`);

const plan = { update: [], delete: [], skip: [] };
for (const row of r.recordset) {
  const note = (row.note || '').trim();
  if (!note) { plan.skip.push({ ...row, reason: 'empty note' }); continue; }

  const del = DELETE_RULES.find(d => d.pattern.test(note));
  if (del) { plan.delete.push({ ...row, reason: 'keyboard mash' }); continue; }

  const match = RULES.find(r => r.pattern.test(note));
  if (match) { plan.update.push({ ...row, newTitle: match.outcome }); continue; }

  plan.skip.push({ ...row, reason: 'no keyword match' });
}

console.log(`Proposed UPDATE: ${plan.update.length}`);
console.log(`Proposed DELETE: ${plan.delete.length}`);
console.log(`Skipped:         ${plan.skip.length}\n`);

console.log('--- UPDATE preview ---');
console.table(plan.update.map(r => ({
  id: r.id, lead: r.lead_id, name: r.lead_name?.slice(0, 25),
  noteSnip: (r.note || '').slice(0, 50),
  oldTitle: r.title,
  newTitle: r.newTitle,
})));
console.log('--- DELETE preview ---');
console.table(plan.delete.map(r => ({
  id: r.id, lead: r.lead_id, note: r.note, reason: r.reason,
})));

if (!execute) {
  console.log('\nDry-run — no changes made. Pass --yes to apply.');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const u of plan.update) {
    await new sql.Request(tx)
      .input('id', sql.Int, u.id)
      .input('title', sql.NVarChar(200), u.newTitle)
      .query(`UPDATE lead_activities SET title = @title WHERE id = @id`);
  }
  for (const d of plan.delete) {
    await new sql.Request(tx)
      .input('id', sql.Int, d.id)
      .query(`DELETE FROM lead_activities WHERE id = @id`);
  }
  await tx.commit();
  console.log(`\nOK — updated ${plan.update.length}, deleted ${plan.delete.length}`);
} catch (e) {
  await tx.rollback();
  console.error('FAILED, rolled back:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
