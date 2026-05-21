// Backfill lead_activities title for generic-titled follow-up rows using
// signals OUTSIDE the activity itself (lead.status, lead.lost_reason,
// payments). Compounds with the keyword backfill that already ran.
//
// Rules (in priority order — first match wins):
//   1. Lead has booking (status past pre_survey-01, OR pre_slip_url paid):
//        → "ติดต่อได้ - Sale เสนอขาย"
//   2. Lead is lost with lost_reason in "ติดต่อไม่ได้ / ข้อมูลผิด" group:
//        → "ติดต่อไม่ได้ - ไม่รับสาย" (or ข้อมูลติดต่อไม่ถูกต้อง if reason says so)
//   3. Lead is lost with lost_reason in "ลูกค้าไม่สนใจ" / "ปิดการขายไม่สำเร็จ"
//      / "ความพร้อม" / "สินเชื่อ" group → customer was offered but didn't close:
//        → "ติดต่อได้ - Sale เสนอขาย"
//   4. Otherwise: leave as-is
//
// Default: dev + dry-run. --yes to apply. --db=solardb for prod.
import sql from 'mssql';
const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const r = await pool.request().query(`
  SELECT la.id, la.lead_id, la.activity_type, la.title, la.note,
         l.full_name, l.status, l.lost_reason,
         CASE WHEN bk.lead_id IS NOT NULL OR
                   l.status IN ('pre_survey-02','survey','quote','order','install','warranty','gridtie','closed')
              THEN 1 ELSE 0 END AS booked
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  LEFT JOIN (
    SELECT DISTINCT lead_id FROM payments
    WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
  ) bk ON bk.lead_id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
`);

const updates = [];
for (const row of r.recordset) {
  let newTitle = null;
  let reason = null;
  if (row.booked === 1) {
    newTitle = 'ติดต่อได้ - Sale เสนอขาย';
    reason = 'booked';
  } else if (row.status === 'lost' && row.lost_reason) {
    const lr = row.lost_reason;
    if (/^ติดต่อไม่ได้/.test(lr) || /ข้อมูล(ติดต่อ)?ไม่ถูก|ข้อมูลผิด/.test(lr)) {
      newTitle = lr.includes('ข้อมูล') ? 'ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง' : 'ติดต่อไม่ได้ - ไม่รับสาย';
      reason = 'lost: cant-contact';
    } else if (/^ลูกค้าไม่สนใจ|^ปิดการขายไม่สำเร็จ|^ความพร้อม|^สินเชื่อ/.test(lr)) {
      newTitle = 'ติดต่อได้ - Sale เสนอขาย';
      reason = 'lost: offered-declined';
    }
    // bare 'อื่นๆ' / 'test' / unmatched → skip
  }
  if (newTitle && newTitle !== row.title) updates.push({ ...row, newTitle, reason });
}

console.log(`Will update: ${updates.length} rows`);
console.table(updates.map(u => ({
  id: u.id, lead: u.lead_id, name: u.full_name?.slice(0, 22),
  status: u.status, lost_reason: u.lost_reason?.slice(0, 35),
  reason: u.reason,
  old: u.title.slice(0, 25), new: u.newTitle,
})));

if (!execute) {
  console.log('\nDry-run only — pass --yes to apply.');
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
  console.log(`\nOK — updated ${updates.length} rows`);
} catch (e) {
  await tx.rollback();
  console.error('FAILED:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
