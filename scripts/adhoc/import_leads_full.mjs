/**
 * Full import from Solar Sales Lead Database sheet (58 cols → leads).
 * Destroy-and-reseed: replaces all leads + dependent rows. Maps each sheet
 * column to a typed DB field where one exists (migration 096 added the
 * remaining columns), so data is queryable rather than buried in notes.
 *
 * All imported leads start at status=pre_survey; the sheet's 14-status code
 * is preserved in customer_code/note context so sales can re-advance them.
 *
 * Usage: node scripts/adhoc/import_leads_full.mjs [--dry-run]
 */
import sql from 'mssql';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/14Fvt4SJEohqmWOslEoMaGnCV0gRrrjKdh5IRzONKz54/export?format=csv&gid=0';
const DRY_RUN = process.argv.includes('--dry-run');

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const res = await fetch(SHEET_URL);
const csvText = await res.text();
const rows = parseCSV(csvText);

// Sheet has merged-header rows up top; first 3 rows are headers.
const data = rows.slice(3).filter(r => r.length > 8 && (r[8] || '').trim());
console.log(`parsed ${data.length} lead rows from sheet`);

// --- helpers ---
const trim = (v) => (v || '').toString().trim();
const blank = (v) => trim(v) || null;

const parseDate = (v) => {
  const s = trim(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let y = parseInt(m[3]);
    if (y > 2500) y -= 543;
    return new Date(y, parseInt(m[2]) - 1, parseInt(m[1])).toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const parseMoney = (v) => {
  const s = trim(v).replace(/[^\d.]/g, '');
  return s ? parseFloat(s) : null;
};

const parseInt2 = (v) => {
  const s = trim(v).replace(/[^\d]/g, '');
  return s ? parseInt(s) : null;
};

const normPhone = (v) => {
  const s = trim(v).replace(/[^0-9+]/g, '').slice(0, 20);
  return s || null;
};

const CUSTOMER_TYPE_MAP = (v) => {
  const s = trim(v);
  if (/upgrade|Scale ?Up/i.test(s)) return 'upgrade';
  if (/ล้างแผง|O&M/i.test(s)) return 'o_and_m';
  return 'new';
};

// Sheet status codes → app status. Always start at pre_survey for safety;
// stash the original sheet status in the note so sales can resume.
const STATUS_MAP = (sheetStatus) => {
  const s = trim(sheetStatus);
  const note = s ? `สถานะจาก sheet: ${s}` : null;
  if (/^12\./.test(s)) return { status: 'pre_survey', note, lost: 'ปฏิเสธ/ยกเลิก' };
  if (/^13\./.test(s)) return { status: 'pre_survey', note, lost: 'ติดต่อไม่ได้' };
  if (/^14\./.test(s)) return { status: 'pre_survey', note, lost: 'ข้อมูลไม่ถูกต้อง' };
  return { status: 'pre_survey', note };
};

// --- project lookup/upsert ---
const projects = (await pool.request().query(`SELECT id, name FROM projects`)).recordset;
const norm = (s) => trim(s).replace(/\s+/g, '').replace(/[-–]/g, '');
const findProjectInMemory = (name) => {
  const n = trim(name);
  if (!n || /อื่น/.test(n)) return null;
  const exact = projects.find(p => p.name.trim() === n);
  if (exact) return exact;
  const key = norm(n);
  return projects.find(p => norm(p.name).includes(key) || key.includes(norm(p.name))) || null;
};
async function findOrCreateProject(name) {
  const n = trim(name);
  if (!n || /อื่น/.test(n)) return null;
  const existing = findProjectInMemory(n);
  if (existing) return existing;
  const ins = await pool.request()
    .input('name', sql.NVarChar(200), n)
    .query(`INSERT INTO projects (name, is_active) OUTPUT INSERTED.id VALUES (@name, 1)`);
  const created = { id: ins.recordset[0].id, name: n };
  projects.push(created);
  return created;
}

if (DRY_RUN) {
  let matched = 0, unmatched = 0;
  for (const r of data) (findProjectInMemory(r[10]) ? matched++ : unmatched++);
  console.log(`project pre-check: ${matched} matched, ${unmatched} would be created`);
  console.log(`first 3 sample customer_codes: ${data.slice(0, 3).map(r => r[1]).join(', ')}`);
  console.log('\nDRY RUN — not touching DB');
  await pool.close();
  process.exit(0);
}

// --- destroy & reseed ---
const delActs = await pool.request().query(`DELETE FROM lead_activities`);
const delPay = await pool.request().query(`DELETE FROM payments`);
const unlinkProspects = await pool.request().query(`UPDATE prospects SET lead_id = NULL, returned_at = NULL WHERE lead_id IS NOT NULL`);
const delLeads = await pool.request().query(`DELETE FROM leads`);
console.log(`\ncleaned: leads=${delLeads.rowsAffected[0]} activities=${delActs.rowsAffected[0]} payments=${delPay.rowsAffected[0]} prospects_unlinked=${unlinkProspects.rowsAffected[0]}`);

// --- import loop ---
let inserted = 0, failed = 0;
for (const r of data) {
  try {
    const projMatch = await findOrCreateProject(r[10]);
    const statusMap = STATUS_MAP(r[2]);

    // Compose notes from the few sheet fields without a typed DB column
    const noteParts = [
      statusMap.note,
      trim(r[4]) ? `LINE OA: ${trim(r[4])}` : '',
      trim(r[24]) ? `หมายเหตุ: ${trim(r[24])}` : '',
      trim(r[25]) ? `สถานะหลังติดต่อ: ${trim(r[25])}` : '',
      trim(r[57]) ? `หมายเหตุติดตั้ง: ${trim(r[57])}` : '',
      !projMatch && trim(r[10]) ? `โครงการจริง: ${trim(r[10])}` : '',
    ].filter(Boolean).join('\n') || null;

    const lostReason = statusMap.lost
      ? [statusMap.lost, trim(r[26]), trim(r[42])].filter(Boolean).join(' · ')
      : (trim(r[26]) || trim(r[42]) || null);

    const req = pool.request()
      // Identity / contact
      .input('customer_code', sql.NVarChar(20), blank(r[1]))
      .input('full_name', sql.NVarChar(200), trim(r[8]) || 'ลูกค้า')
      .input('phone', sql.NVarChar(20), normPhone(r[9]))
      .input('installation_address', sql.NVarChar(500), blank(r[7]))
      .input('project_id', sql.Int, projMatch ? projMatch.id : null)
      .input('project_note', sql.NVarChar(500), blank(r[11]))
      .input('customer_type', sql.NVarChar(50), CUSTOMER_TYPE_MAP(r[12]))
      .input('seeker_type', sql.NVarChar(50), blank(r[13]))
      .input('customer_interest', sql.NVarChar(500), blank(r[14]))
      .input('seeker_name', sql.NVarChar(200), blank(r[15]))
      .input('source', sql.NVarChar(50), blank(r[3]))
      .input('assigned_staff', sql.NVarChar(100), blank(r[5]))
      // Lifecycle
      .input('status', sql.NVarChar(50), statusMap.status)
      .input('contact_date', sql.Date, parseDate(r[16]))
      .input('requirement', sql.NVarChar(sql.MAX), blank(r[18]))
      .input('pre_peak_usage', sql.NVarChar(20), blank(r[19]))
      .input('payment_type', sql.NVarChar(50), blank(r[20]))
      .input('home_loan_status', sql.NVarChar(50), blank(r[21]))
      .input('pre_note', sql.NVarChar(sql.MAX), blank(r[23]))
      .input('last_contact_result', sql.NVarChar(sql.MAX), blank(r[41]))
      .input('lost_reason', sql.NVarChar(sql.MAX), lostReason)
      // Booking (pre)
      .input('pre_total_price', sql.Decimal(12, 2), parseMoney(r[27]))
      .input('pre_doc_no', sql.NVarChar(20), blank(r[28]))
      .input('pre_booked_at', sql.DateTime2, parseDate(r[29]) ? new Date(parseDate(r[29])) : null)
      // Survey
      .input('survey_date', sql.Date, parseDate(r[31]))
      .input('survey_actual_date', sql.Date, parseDate(r[32]))
      .input('survey_actual_by', sql.NVarChar(200), blank(r[34]))
      .input('survey_note', sql.NVarChar(sql.MAX), blank(r[35]))
      // Quotation
      .input('quotation_by', sql.NVarChar(200), blank(r[36]))
      .input('quotation_amount', sql.Decimal(12, 2), parseMoney(r[37]))
      .input('quotation_doc_no', sql.NVarChar(30), blank(r[38]))
      .input('quotation_sent_date', sql.Date, parseDate(r[39]))
      // Finance — installments
      .input('finance_bank', sql.NVarChar(100), blank(r[44]))
      .input('finance_months', sql.Int, parseInt2(r[45]))
      .input('finance_monthly', sql.Decimal(12, 2), parseMoney(r[46]))
      // Finance — Home Equity
      .input('home_equity_check', sql.NVarChar(200), blank(r[47]))
      .input('finance_loan_bank', sql.NVarChar(100), blank(r[48]))
      .input('finance_loan_amount', sql.Decimal(12, 2), parseMoney(r[49]))
      .input('finance_documents', sql.NVarChar(sql.MAX), blank(r[50]))
      .input('finance_status', sql.NVarChar(50), blank(r[51]))
      // Install
      .input('install_date', sql.Date, parseDate(r[52]))
      .input('install_actual_date', sql.Date, parseDate(r[54]))
      .input('install_completed_at', sql.DateTime2, parseDate(r[55]) ? new Date(parseDate(r[55])) : null)
      .input('install_note', sql.NVarChar(sql.MAX), blank(r[57]))
      // Misc
      .input('note', sql.NVarChar(sql.MAX), noteParts)
      .input('created_at', sql.DateTime2, parseDate(r[6]) ? new Date(parseDate(r[6])) : new Date());

    await req.query(`
      INSERT INTO leads (
        customer_code, full_name, phone, installation_address,
        project_id, project_note, customer_type,
        seeker_type, customer_interest, seeker_name,
        source, assigned_staff, status,
        contact_date, requirement, pre_peak_usage, payment_type, home_loan_status,
        pre_note, last_contact_result, lost_reason,
        pre_total_price, pre_doc_no, pre_booked_at,
        survey_date, survey_actual_date, survey_actual_by, survey_note,
        quotation_by, quotation_amount, quotation_doc_no, quotation_sent_date,
        finance_bank, finance_months, finance_monthly,
        home_equity_check, finance_loan_bank, finance_loan_amount, finance_documents, finance_status,
        install_date, install_actual_date, install_completed_at, install_note,
        note, created_at
      ) VALUES (
        @customer_code, @full_name, @phone, @installation_address,
        @project_id, @project_note, @customer_type,
        @seeker_type, @customer_interest, @seeker_name,
        @source, @assigned_staff, @status,
        @contact_date, @requirement, @pre_peak_usage, @payment_type, @home_loan_status,
        @pre_note, @last_contact_result, @lost_reason,
        @pre_total_price, @pre_doc_no, @pre_booked_at,
        @survey_date, @survey_actual_date, @survey_actual_by, @survey_note,
        @quotation_by, @quotation_amount, @quotation_doc_no, @quotation_sent_date,
        @finance_bank, @finance_months, @finance_monthly,
        @home_equity_check, @finance_loan_bank, @finance_loan_amount, @finance_documents, @finance_status,
        @install_date, @install_actual_date, @install_completed_at, @install_note,
        @note, @created_at
      )
    `);
    inserted++;
  } catch (e) {
    failed++;
    console.error(`FAIL row seq=${r[0]} code=${r[1]} name=${r[8]?.slice(0, 30)}: ${e.message}`);
  }
}

console.log(`\nIMPORTED: ${inserted}  FAILED: ${failed}`);

const final = (await pool.request().query(`
  SELECT status, COUNT(*) AS n FROM leads GROUP BY status ORDER BY n DESC
`)).recordset;
console.log('\nfinal status distribution:');
for (const x of final) console.log(`  ${x.n.toString().padStart(3)}  ${x.status}`);

const sample = (await pool.request().query(`
  SELECT TOP 3 customer_code, full_name, project_note, customer_interest, seeker_type, seeker_name,
         survey_actual_date, quotation_doc_no, finance_bank
  FROM leads ORDER BY id
`)).recordset;
console.log('\nsample rows (new fields):');
for (const x of sample) console.log(' ', x);

await pool.close();
