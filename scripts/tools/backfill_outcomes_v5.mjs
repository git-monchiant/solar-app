// Backfill v5 — fill in outcome by following the dashboard's bucket logic.
// Priority order (first match wins per row):
//   1. CLOSEST sibling activity with derivable outcome → use that (v4 logic)
//   2. Lead is booked (status past pre_survey-01 OR pre_slip_url confirmed)
//      → "ติดต่อได้ - Sale เสนอขาย"
//   3. Lead is lost with mappable lost_reason → category-based outcome
//   4. Lead has pre_slip uploaded (not yet confirmed) → "ติดต่อได้ - Sale เสนอขาย"
//   5. Lead status='pre_survey', no pitch, no slip → dashboard "ยังไม่สะดวกคุย"
//      bucket → "ติดต่อได้ - ลูกค้าไม่สะดวกคุย"
//   6. Otherwise → leave alone
//
// Default: dev + dry-run.
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
const deriveOutcome = (s) => {
  if (s.title && /^ติดต่อ(ได้|ไม่ได้)/.test(s.title)) return s.title;
  const note = (s.note || '').trim();
  if (note) {
    const rule = KEYWORD_RULES.find(r => r.pattern.test(note));
    if (rule) return rule.outcome;
  }
  return null;
};

const BOOKED_STATUSES = ['pre_survey-02','survey','quote','order','install','warranty','gridtie','closed'];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const generic = await pool.request().query(`
  SELECT la.id, la.lead_id, la.title, la.note, la.created_at,
         l.full_name, l.status, l.lost_reason,
         CASE WHEN EXISTS (SELECT 1 FROM payments p
                           WHERE p.lead_id = l.id AND p.slip_field='pre_slip_url'
                             AND p.confirmed_at IS NOT NULL) THEN 1 ELSE 0 END AS pre_slip_confirmed,
         CASE WHEN EXISTS (SELECT 1 FROM payments p
                           WHERE p.lead_id = l.id AND p.slip_field='pre_slip_url'
                             AND p.submitted_at IS NOT NULL) THEN 1 ELSE 0 END AS pre_slip_uploaded,
         CASE WHEN EXISTS (SELECT 1 FROM lead_activities la2
                           WHERE la2.lead_id = l.id AND la2.title LIKE N'%เสนอขาย%') THEN 1 ELSE 0 END AS has_pitch
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
  let newTitle = null, source = null;

  // 1. Closest sibling with outcome
  const siblings = (siblingsByLead.get(row.lead_id) || []).filter(s => s.id !== row.id);
  const rowT = new Date(row.created_at).getTime();
  const sCands = siblings
    .map(s => ({ ...s, outcome: deriveOutcome(s), dt: Math.abs(new Date(s.created_at).getTime() - rowT) }))
    .filter(s => s.outcome)
    .sort((a, b) => a.dt - b.dt);
  if (sCands.length > 0) {
    newTitle = sCands[0].outcome;
    source = 'sibling';
  }
  // 2. Lead is booked → Sale เสนอขาย
  else if (row.pre_slip_confirmed === 1 || BOOKED_STATUSES.includes(row.status)) {
    newTitle = 'ติดต่อได้ - Sale เสนอขาย';
    source = 'booked';
  }
  // 3. Lost with mappable reason
  else if (row.status === 'lost' && row.lost_reason) {
    const lr = row.lost_reason;
    if (/^ติดต่อไม่ได้/.test(lr)) {
      newTitle = /ข้อมูล/.test(lr) ? 'ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง' : 'ติดต่อไม่ได้ - ไม่รับสาย';
      source = 'lost:no-contact';
    } else if (/^(ลูกค้าไม่สนใจ|ปิดการขายไม่สำเร็จ|ความพร้อม|สินเชื่อ)/.test(lr)) {
      newTitle = 'ติดต่อได้ - Sale เสนอขาย';
      source = 'lost:offered';
    }
  }
  // 4. Slip uploaded → had a sale interaction
  else if (row.pre_slip_uploaded === 1 || row.has_pitch === 1) {
    newTitle = 'ติดต่อได้ - Sale เสนอขาย';
    source = 'slip/pitch';
  }
  // 5. pre_survey default → ยังไม่สะดวกคุย bucket
  else if (row.status === 'pre_survey') {
    newTitle = 'ติดต่อได้ - ลูกค้าไม่สะดวกคุย';
    source = 'dashboard:no-pitch';
  }

  if (newTitle && newTitle !== row.title) {
    updates.push({ ...row, newTitle, source });
  }
}

const byRule = updates.reduce((a, u) => { a[u.source] = (a[u.source] || 0) + 1; return a; }, {});
console.log(`Will update: ${updates.length} rows`);
console.log('--- by rule ---');
console.table(byRule);
console.log('--- detail ---');
console.table(updates.map(u => ({
  id: u.id, lead: u.lead_id, name: u.full_name?.slice(0, 18), status: u.status,
  src: u.source, old: u.title.slice(0, 25), new: u.newTitle,
})));

if (!execute) { console.log('\nDry-run only — pass --yes to apply.'); await pool.close(); process.exit(0); }

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
