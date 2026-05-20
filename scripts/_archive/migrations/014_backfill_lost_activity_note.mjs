// 014: backfill leads.lost_reason → lead_activities.note for old
// status_change→lost rows where note is NULL. Pre-dates the lostNote logic
// added to PATCH /api/leads/[id] in commit 47dcc47 — without this, old "ยกเลิก"
// entries in the activity log show only the status delta, not the reason.
//
// Idempotent: only touches rows where note IS NULL. Safe to re-run.
import sql from 'mssql';

const dbArg = process.argv.find(a => a.startsWith('--db='));
if (!dbArg) { console.error('Missing --db=<name>'); process.exit(1); }
const database = dbArg.slice(5);

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

const upd = await pool.request().query(`
  UPDATE la SET la.note = l.lost_reason
  FROM lead_activities la
  JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type = 'status_change'
    AND la.new_status = 'lost'
    AND la.note IS NULL
    AND l.lost_reason IS NOT NULL AND l.lost_reason <> ''
`);
console.log(`  backfilled ${upd.rowsAffected[0]} lead_activities row(s)`);
await pool.close();
