// Backfill follow-up activity titles whose outcome was lost when the API
// previously discarded body.title (fixed in commit prior to this migration).
// Apply dashboard-aware rules in priority order, first match wins:
//   1. CLOSEST sibling activity of same lead with a derivable outcome
//      (title startswith "ติดต่อ%" OR note keyword) → borrow its outcome
//   2. Lead is booked (status past pre_survey-01 OR pre_slip_url confirmed)
//      → "ติดต่อได้ - Sale เสนอขาย"
//   3. Lead lost with mappable lost_reason → group-based outcome
//   4. Lead has pre_slip uploaded or any sales pitch activity
//      → "ติดต่อได้ - Sale เสนอขาย"
//   5. Lead status='pre_survey' (no pitch, no slip) — matches dashboard's
//      "ยังไม่สะดวกคุย" bucket → "ติดต่อได้ - ลูกค้าไม่สะดวกคุย"
//   6. Else leave alone (lost_reason='test', no signal at all, …)
//
// Idempotent: WHERE-clause filters only rows whose title is one of the legacy
// generic strings, so re-running has no effect.
//
// Invoked by deploy_migrations.mjs as `node <this> --db=<name>` — no --yes
// needed; the script always executes its UPDATE.
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
if (!dbArg) { console.error('Missing --db='); process.exit(1); }
const database = dbArg.split('=')[1];

const KEYWORD_RULES = [
  { pattern: /ไม่รับสาย|ยังไม่ตอบ|เงียบ|ไม่ติดต่อกลับ/,    outcome: 'ติดต่อไม่ได้ - ไม่รับสาย' },
  { pattern: /เบอร์ผิด|เบอร์ไม่ถูก|ข้อมูลผิด/,             outcome: 'ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง' },
  { pattern: /ไม่สะดวก|อยู่ รพ\.|ติดประชุม|ในเวลางาน/,    outcome: 'ติดต่อได้ - ลูกค้าไม่สะดวกคุย' },
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
console.log(`[018] backfill follow-up outcomes — target ${database}`);

// Snapshot lead_activities into a side table BEFORE any UPDATE — gives us
// a one-command rollback path if the heuristics map something wrong.
// Backup table name is fixed; re-running drops the previous snapshot.
const BKP_TABLE = 'lead_activities_bkp_pre_018';
await pool.request().query(`
  IF OBJECT_ID('dbo.${BKP_TABLE}', 'U') IS NOT NULL DROP TABLE dbo.${BKP_TABLE};
  SELECT * INTO dbo.${BKP_TABLE} FROM dbo.lead_activities;
`);
const bkpCount = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.${BKP_TABLE}`);
console.log(`[018] backup table dbo.${BKP_TABLE} created — ${bkpCount.recordset[0].n} rows`);

const generic = await pool.request().query(`
  SELECT la.id, la.lead_id, la.title, la.note, la.created_at,
         l.status, l.lost_reason,
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

if (generic.recordset.length === 0) {
  console.log('[018] no generic-title rows — nothing to do.');
  await pool.close();
  process.exit(0);
}

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
  let newTitle = null;
  // 1. Closest sibling with outcome
  const siblings = (siblingsByLead.get(row.lead_id) || []).filter(s => s.id !== row.id);
  const rowT = new Date(row.created_at).getTime();
  const sCands = siblings
    .map(s => ({ ...s, outcome: deriveOutcome(s), dt: Math.abs(new Date(s.created_at).getTime() - rowT) }))
    .filter(s => s.outcome)
    .sort((a, b) => a.dt - b.dt);
  if (sCands.length > 0) newTitle = sCands[0].outcome;
  // 2. Booked
  else if (row.pre_slip_confirmed === 1 || BOOKED_STATUSES.includes(row.status)) newTitle = 'ติดต่อได้ - Sale เสนอขาย';
  // 3. Lost — group-mapped first, then fallback to Sale เสนอขาย for any
  // lost_reason we couldn't classify (e.g. 'test', bare 'อื่นๆ', NULL) since
  // a lead reaching the "lost" stage almost always means a sale attempt
  // happened first.
  else if (row.status === 'lost') {
    const lr = row.lost_reason || '';
    if (/^ติดต่อไม่ได้/.test(lr)) newTitle = /ข้อมูล/.test(lr) ? 'ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง' : 'ติดต่อไม่ได้ - ไม่รับสาย';
    else newTitle = 'ติดต่อได้ - Sale เสนอขาย';
  }
  // 4. Slip uploaded / has pitch
  else if (row.pre_slip_uploaded === 1 || row.has_pitch === 1) newTitle = 'ติดต่อได้ - Sale เสนอขาย';
  // 5. pre_survey default
  else if (row.status === 'pre_survey') newTitle = 'ติดต่อได้ - ลูกค้าไม่สะดวกคุย';

  if (newTitle && newTitle !== row.title) updates.push({ id: row.id, title: newTitle });
}

if (updates.length === 0) {
  console.log('[018] no updates needed.');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const u of updates) {
    await new sql.Request(tx)
      .input('id', sql.Int, u.id)
      .input('title', sql.NVarChar(200), u.title)
      .query(`UPDATE lead_activities SET title = @title WHERE id = @id`);
  }
  await tx.commit();
  console.log(`[018] updated ${updates.length} rows`);
} catch (e) {
  await tx.rollback();
  console.error('[018] FAILED:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
