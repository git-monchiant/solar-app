import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const LEAD_COLS = `
  l.id, l.full_name, l.house_number, l.phone, l.email, l.note,
  l.status, l.source, l.customer_type, l.line_id, l.zone,
  l.created_at, l.contact_date, l.updated_at, l.next_follow_up,
  l.assigned_user_id, l.installation_address, l.project_id,
  l.pre_doc_no, l.pre_total_price, l.payment_confirmed,
  l.survey_date, l.survey_time_slot,
  l.install_date, l.install_completed_at, l.install_extra_cost,
  l.order_total, l.quotation_amount,
  COALESCE(NULLIF(l.project_name, ''), p.name) as project_name,
  p.district, p.province, pk.name as package_name, u.full_name as assigned_name
`;

const queries = [
  ['newLeads', `SELECT ${LEAD_COLS}, (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'pre_survey' AND l.pre_doc_no IS NULL AND (l.next_follow_up IS NULL OR CAST(l.next_follow_up AS DATE) < CAST(GETDATE() AS DATE)) ORDER BY l.created_at DESC`],
  ['followUpToday', `SELECT ${LEAD_COLS}, (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.next_follow_up = CAST(GETDATE() AS DATE) AND l.status NOT IN ('install', 'lost') ORDER BY COALESCE(l.contact_date, l.created_at) ASC`],
  ['followUpOverdue', `SELECT ${LEAD_COLS}, (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.next_follow_up < CAST(GETDATE() AS DATE) AND l.status NOT IN ('install', 'lost') ORDER BY COALESCE(l.contact_date, l.created_at) ASC`],
  ['surveyToday', `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'survey' AND l.survey_date = CAST(GETDATE() AS DATE)`],
  ['surveyPending', `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'survey' AND (l.survey_date != CAST(GETDATE() AS DATE) OR l.survey_date IS NULL)`],
  ['quotationPending', `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'quote'`],
  ['installPending', `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'order'`],
  ['followUpUpcoming', `SELECT ${LEAD_COLS}, (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE CAST(l.next_follow_up AS DATE) > CAST(GETDATE() AS DATE) AND l.status NOT IN ('install', 'lost')`],
  ['installing', `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'install'`],
  ['recentlyClosed', `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'closed' AND l.install_completed_at >= DATEADD(day, -7, GETDATE())`],
  ['booking', `SELECT ${LEAD_COLS}, (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note FROM leads l LEFT JOIN projects p ON l.project_id = p.id LEFT JOIN packages pk ON l.interested_package_id = pk.id LEFT JOIN users u ON l.assigned_user_id = u.id WHERE l.status = 'pre_survey' AND l.payment_confirmed = 1 ORDER BY l.pre_booked_at DESC, l.updated_at DESC`],
];

for (const [name, q] of queries) {
  try {
    const r = await pool.request().query(q);
    console.log(`OK ${name}: ${r.recordset.length} rows`);
  } catch (e) {
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

await pool.close();
