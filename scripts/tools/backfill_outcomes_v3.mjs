// Backfill v3: borrow outcome from sibling activities of the same lead.
// For each remaining generic-title follow-up row, look at the lead's OTHER
// follow-up activities. If any has a real outcome title ("ติดต่อ%"), use the
// most recent one. If only sibling notes contain outcome keywords, apply
// the same keyword heuristic used in round 1.
//
// Default: dev + dry-run. --yes to apply.

import sql from 'mssql';
const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');

const KEYWORD_RULES = [
  { pattern: /ไม่รับสาย|ยังไม่ตอบ|เงียบ|ไม่ติดต่อกลับ/, outcome: 'ติดต่อไม่ได้ - ไม่รับสาย' },
  { pattern: /เบอร์ผิด|เบอร์ไม่ถูก|ข้อมูลผิด/, outcome: 'ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง' },
  { pattern: /ไม่สะดวก|อยู่ รพ\.|ติดประชุม|ในเวลางาน/, outcome: 'ติดต่อได้ - ลูกค้าไม่สะดวกคุย' },
  { pattern: /สนใจ|เสนอ|ขอ.+คิดดู|ส่วนลด|ติดต่อกลับ|สอบถาม|ผ่อน|ขายไฟ|TTB|สินเชื่อ/, outcome: 'ติดต่อได้ - Sale เสนอขาย' },
];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

// All generic-titled rows that need backfill
const generic = await pool.request().query(`
  SELECT la.id, la.lead_id, la.title, la.note, la.created_at,
         l.full_name, l.status
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
`);
console.log(`Generic-titled rows to inspect: ${generic.recordset.length}`);

// Group by lead_id for context lookup
const leadIds = [...new Set(generic.recordset.map(r => r.lead_id))];
const siblingsByLead = new Map();
for (const lid of leadIds) {
  const s = await pool.request().query(`
    SELECT title, note, created_at FROM lead_activities
    WHERE lead_id = ${lid}
      AND activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    ORDER BY created_at DESC
  `);
  siblingsByLead.set(lid, s.recordset);
}

const updates = [];
for (const row of generic.recordset) {
  const siblings = siblingsByLead.get(row.lead_id) || [];
  // Step 1: most recent sibling with a real outcome title
  const realOutcome = siblings.find(s =>
    s.title && (s.title.startsWith('ติดต่อได้') || s.title.startsWith('ติดต่อไม่ได้'))
    && new Date(s.created_at) >= new Date(row.created_at)  // prefer later
  ) || siblings.find(s =>
    s.title && (s.title.startsWith('ติดต่อได้') || s.title.startsWith('ติดต่อไม่ได้'))
  );
  if (realOutcome) {
    if (realOutcome.title !== row.title) {
      updates.push({ ...row, newTitle: realOutcome.title, source: 'sibling-title' });
    }
    continue;
  }
  // Step 2: scan sibling notes for keywords
  let matched = null;
  for (const s of siblings) {
    const note = (s.note || '').trim();
    if (!note) continue;
    const rule = KEYWORD_RULES.find(r => r.pattern.test(note));
    if (rule) { matched = rule.outcome; break; }
  }
  if (matched && matched !== row.title) {
    updates.push({ ...row, newTitle: matched, source: 'sibling-note' });
  }
}

console.log(`Will update: ${updates.length} rows\n`);
console.table(updates.map(u => ({
  id: u.id, lead: u.lead_id, name: u.full_name?.slice(0, 20),
  source: u.source, old: u.title.slice(0, 25), new: u.newTitle,
})));

if (!execute) {
  console.log('\nDry-run — pass --yes to apply.');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const u of updates) {
    await new sql.Request(tx)
      .input('id', sql.Int, u.id)
      .input('title', sql.NVarChar(200), u.newTitle)
      .query(`UPDATE lead_activities SET title = @title WHERE id = @id`);
  }
  await tx.commit();
  console.log(`\nOK — updated ${updates.length}`);
} catch (e) {
  await tx.rollback();
  console.error('FAILED:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
