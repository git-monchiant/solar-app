// Backfill v4: for each generic-title row, find the CLOSEST-in-time sibling
// activity of the same lead and borrow its outcome.
//
// Improvements over v3:
//   - includes 'note' activity_type in sibling lookup (notes carry keyword info)
//   - picks nearest sibling by time delta (not just "most recent real outcome")
//     so a lead with multiple contact attempts maps each generic row to the
//     outcome of its own attempt, not the lead's last attempt
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
  { pattern: /สนใจ|เสนอ|ขอ.+คิดดู|ส่วนลด|ติดต่อกลับ|สอบถาม|ผ่อน|ขายไฟ|TTB|สินเชื่อ|ติดตั้ง/, outcome: 'ติดต่อได้ - Sale เสนอขาย' },
];

const deriveOutcome = (sibling) => {
  if (sibling.title && /^ติดต่อ(ได้|ไม่ได้)/.test(sibling.title)) return sibling.title;
  const note = (sibling.note || '').trim();
  if (note) {
    const rule = KEYWORD_RULES.find(r => r.pattern.test(note));
    if (rule) return rule.outcome;
  }
  return null;
};

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const generic = await pool.request().query(`
  SELECT la.id, la.lead_id, la.title, la.note, la.created_at,
         l.full_name
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
`);
console.log(`Generic-titled rows to inspect: ${generic.recordset.length}`);

const leadIds = [...new Set(generic.recordset.map(r => r.lead_id))];
const siblingsByLead = new Map();
for (const lid of leadIds) {
  const s = await pool.request().query(`
    SELECT id, title, note, created_at FROM lead_activities
    WHERE lead_id = ${lid}
      AND activity_type IN ('call','visit','line','other','note','follow_up','loan_followup')
  `);
  siblingsByLead.set(lid, s.recordset);
}

const updates = [];
for (const row of generic.recordset) {
  const siblings = (siblingsByLead.get(row.lead_id) || [])
    .filter(s => s.id !== row.id);

  // Rank candidate siblings: only those with derivable outcome, sorted by
  // |time delta| from this generic row.
  const rowT = new Date(row.created_at).getTime();
  const cands = siblings
    .map(s => ({ ...s, outcome: deriveOutcome(s), dt: Math.abs(new Date(s.created_at).getTime() - rowT) }))
    .filter(s => s.outcome)
    .sort((a, b) => a.dt - b.dt);

  if (cands.length === 0) continue;
  const best = cands[0];
  if (best.outcome !== row.title) {
    updates.push({ ...row, newTitle: best.outcome, sourceId: best.id, dtMin: Math.round(best.dt / 60000) });
  }
}

console.log(`Will update: ${updates.length} rows\n`);
console.table(updates.map(u => ({
  id: u.id, lead: u.lead_id, name: u.full_name?.slice(0, 18),
  old: u.title.slice(0, 25),
  new: u.newTitle,
  srcId: u.sourceId, '|Δt|min': u.dtMin,
})));

if (!execute) { console.log('\nDry-run — pass --yes to apply.'); await pool.close(); process.exit(0); }

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
