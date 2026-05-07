/**
 * Merge import from Solar Sales Lead Database sheet → leads.
 *
 * Behaviour:
 *   • UPDATE existing leads (matched by customer_code) with sheet values.
 *   • INSERT new leads for sheet rows whose customer_code isn't in DB.
 *   • DELETE every row in lead_activities, payments, slip_files (full reset).
 *   • Reset paid flags + slip URL columns on every lead (payments are gone).
 *   • Leads in DB that don't match any sheet row are LEFT ALONE.
 *
 * Usage: node scripts/adhoc/import_leads_merge.mjs [--dry-run]
 */
import sql from 'mssql';
import { readFileSync } from 'fs';

// Load .env.local manually so the script picks up DB creds from the project.
try {
  const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch { /* ignore — fall back to hard-coded creds below */ }

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
  server: process.env.DB_SERVER || '172.41.1.73',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'monchiant',
  password: process.env.DB_PASSWORD || 'monchiant',
  database: process.env.DB_NAME || 'solardb',
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

// --- existing leads keyed by customer_code (for UPDATE-vs-INSERT decision) ---
const existingLeads = (await pool.request().query(`
  SELECT id, customer_code FROM leads WHERE customer_code IS NOT NULL AND LTRIM(RTRIM(customer_code)) <> ''
`)).recordset;
const existingByCode = new Map();
for (const l of existingLeads) existingByCode.set(trim(l.customer_code), l.id);

if (DRY_RUN) {
  let willUpdate = 0, willInsert = 0, missingCode = 0;
  let projMatched = 0, projNew = 0;
  for (const r of data) {
    const code = trim(r[1]);
    if (!code) { missingCode++; continue; }
    if (existingByCode.has(code)) willUpdate++; else willInsert++;
    if (findProjectInMemory(r[10])) projMatched++; else projNew++;
  }
  console.log(`\nplan:`);
  console.log(`  ${willUpdate} would UPDATE existing leads`);
  console.log(`  ${willInsert} would INSERT new leads`);
  console.log(`  ${missingCode} sheet rows have no customer_code (skipped)`);
  console.log(`\nprojects: ${projMatched} matched, ${projNew} would be created`);
  console.log('\nDRY RUN — not touching DB');
  await pool.close();
  process.exit(0);
}

// --- cleanup dependent rows (per user spec — keep leads, wipe attachments) ---
const delActs = await pool.request().query(`DELETE FROM lead_activities`);
const delPay = await pool.request().query(`DELETE FROM payments`);
const delSlips = await pool.request().query(`DELETE FROM slip_files`);
console.log(`\ncleaned: activities=${delActs.rowsAffected[0]} payments=${delPay.rowsAffected[0]} slip_files=${delSlips.rowsAffected[0]}`);

// Reset paid flags + slip URLs on every lead — those columns reference rows we
// just deleted, so they're stale. Sheet will overwrite them on UPDATE rows.
await pool.request().query(`
  UPDATE leads SET
    payment_confirmed = 0,
    pre_slip_url = NULL,
    order_before_paid = 0,
    order_before_slip = NULL,
    order_after_paid = 0,
    order_after_slip = NULL
`);

// --- import loop ---
let inserted = 0, updated = 0, failed = 0, skippedNoCode = 0;
for (const r of data) {
  try {
    const code = trim(r[1]);
    if (!code) { skippedNoCode++; continue; }

    const projMatch = await findOrCreateProject(r[10]);
    const statusMap = STATUS_MAP(r[2]);

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

    const bind = (req) => req
      .input('customer_code', sql.NVarChar(20), code)
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
      .input('status', sql.NVarChar(50), statusMap.status)
      .input('contact_date', sql.Date, parseDate(r[16]))
      .input('requirement', sql.NVarChar(sql.MAX), blank(r[18]))
      .input('pre_peak_usage', sql.NVarChar(20), blank(r[19]))
      .input('payment_type', sql.NVarChar(50), blank(r[20]))
      .input('home_loan_status', sql.NVarChar(50), blank(r[21]))
      .input('pre_note', sql.NVarChar(sql.MAX), blank(r[23]))
      .input('last_contact_result', sql.NVarChar(sql.MAX), blank(r[41]))
      .input('lost_reason', sql.NVarChar(sql.MAX), lostReason)
      .input('pre_total_price', sql.Decimal(12, 2), parseMoney(r[27]))
      .input('pre_doc_no', sql.NVarChar(20), blank(r[28]))
      .input('pre_booked_at', sql.DateTime2, parseDate(r[29]) ? new Date(parseDate(r[29])) : null)
      .input('survey_date', sql.Date, parseDate(r[31]))
      .input('survey_actual_date', sql.Date, parseDate(r[32]))
      .input('survey_actual_by', sql.NVarChar(200), blank(r[34]))
      .input('survey_note', sql.NVarChar(sql.MAX), blank(r[35]))
      .input('quotation_by', sql.NVarChar(200), blank(r[36]))
      .input('quotation_amount', sql.Decimal(12, 2), parseMoney(r[37]))
      .input('quotation_doc_no', sql.NVarChar(30), blank(r[38]))
      .input('quotation_sent_date', sql.Date, parseDate(r[39]))
      .input('finance_bank', sql.NVarChar(100), blank(r[44]))
      .input('finance_months', sql.Int, parseInt2(r[45]))
      .input('finance_monthly', sql.Decimal(12, 2), parseMoney(r[46]))
      .input('home_equity_check', sql.NVarChar(200), blank(r[47]))
      .input('finance_loan_bank', sql.NVarChar(100), blank(r[48]))
      .input('finance_loan_amount', sql.Decimal(12, 2), parseMoney(r[49]))
      .input('finance_documents', sql.NVarChar(sql.MAX), blank(r[50]))
      .input('finance_status', sql.NVarChar(50), blank(r[51]))
      .input('install_date', sql.Date, parseDate(r[52]))
      .input('install_actual_date', sql.Date, parseDate(r[54]))
      .input('install_completed_at', sql.DateTime2, parseDate(r[55]) ? new Date(parseDate(r[55])) : null)
      .input('install_note', sql.NVarChar(sql.MAX), blank(r[57]))
      .input('note', sql.NVarChar(sql.MAX), noteParts);

    if (existingByCode.has(code)) {
      const id = existingByCode.get(code);
      const req = bind(pool.request()).input('id', sql.Int, id);
      await req.query(`
        UPDATE leads SET
          full_name = @full_name, phone = @phone, installation_address = @installation_address,
          project_id = @project_id, project_note = @project_note, customer_type = @customer_type,
          seeker_type = @seeker_type, customer_interest = @customer_interest, seeker_name = @seeker_name,
          source = @source, assigned_staff = @assigned_staff, status = @status,
          contact_date = @contact_date, requirement = @requirement, pre_peak_usage = @pre_peak_usage,
          payment_type = @payment_type, home_loan_status = @home_loan_status,
          pre_note = @pre_note, last_contact_result = @last_contact_result, lost_reason = @lost_reason,
          pre_total_price = @pre_total_price, pre_doc_no = @pre_doc_no, pre_booked_at = @pre_booked_at,
          survey_date = @survey_date, survey_actual_date = @survey_actual_date,
          survey_actual_by = @survey_actual_by, survey_note = @survey_note,
          quotation_by = @quotation_by, quotation_amount = @quotation_amount,
          quotation_doc_no = @quotation_doc_no, quotation_sent_date = @quotation_sent_date,
          finance_bank = @finance_bank, finance_months = @finance_months, finance_monthly = @finance_monthly,
          home_equity_check = @home_equity_check, finance_loan_bank = @finance_loan_bank,
          finance_loan_amount = @finance_loan_amount, finance_documents = @finance_documents,
          finance_status = @finance_status,
          install_date = @install_date, install_actual_date = @install_actual_date,
          install_completed_at = @install_completed_at, install_note = @install_note,
          note = @note,
          updated_at = GETDATE()
        WHERE id = @id
      `);
      updated++;
    } else {
      const req = bind(pool.request())
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
    }
  } catch (e) {
    failed++;
    console.error(`FAIL row seq=${r[0]} code=${r[1]} name=${r[8]?.slice(0, 30)}: ${e.message}`);
  }
}

console.log(`\nUPDATED: ${updated}  INSERTED: ${inserted}  SKIPPED (no code): ${skippedNoCode}  FAILED: ${failed}`);

// Re-seed exactly one lead_created activity per lead so every lead has an
// audit-trail entry to anchor the timeline.
const seed = await pool.request().query(`
  INSERT INTO lead_activities (lead_id, activity_type, title, created_at, created_by)
  SELECT id, 'lead_created', 'ลงทะเบียน lead', created_at, NULL
  FROM leads
`);
console.log(`seeded lead_created activities: ${seed.rowsAffected[0]}`);

const final = (await pool.request().query(`
  SELECT status, COUNT(*) AS n FROM leads GROUP BY status ORDER BY n DESC
`)).recordset;
console.log('\nfinal status distribution:');
for (const x of final) console.log(`  ${x.n.toString().padStart(3)}  ${x.status}`);

await pool.close();
