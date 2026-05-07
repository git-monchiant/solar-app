import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

// Bug victims: leads with survey_actual_date set but survey hasn't actually
// happened (status is still survey/pre_survey, no survey_completed_by set).
// Caused by SurveyStep auto-saving today as the default actual visit date.
const before = await pool.request().query(`
  SELECT id, full_name, status, survey_date, survey_actual_date, survey_completed_by, survey_confirmed
  FROM leads
  WHERE survey_actual_date IS NOT NULL
    AND survey_completed_by IS NULL
    AND status IN ('pre_survey', 'survey')
  ORDER BY id
`);
console.log('Affected leads:'); console.table(before.recordset);

if (before.recordset.length > 0) {
  const ids = before.recordset.map(r => r.id);
  const r = await pool.request().query(`
    UPDATE leads SET survey_actual_date = NULL
    WHERE id IN (${ids.join(',')})
  `);
  console.log(`Reset survey_actual_date for ${r.rowsAffected[0]} leads.`);
}

const lockList = await pool.request().query(`
  SELECT id, full_name, status, zone, survey_date, survey_time_slot
  FROM leads
  WHERE survey_date IS NOT NULL
    AND survey_actual_date IS NULL
    AND status NOT IN ('quote', 'order', 'install', 'warranty', 'gridtie', 'closed', 'lost', 'returned')
  ORDER BY survey_date
`);
console.log('\nLeads now locking survey slots (per /api/surveys/scheduled query):');
console.table(lockList.recordset);

await pool.close();
