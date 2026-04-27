/**
 * Import leads from the QC tracking Google Sheet. Destroys existing leads
 * first (this is a seed import, not merge). Maps the sheet's 14-status
 * codes onto the app's 8-stage lifecycle and folds free-text details
 * (quote doc no, surveyor, loan specifics) into notes/requirement fields.
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
const data = rows.slice(3).filter(r => r.length > 8 && (r[8] || '').trim());
console.log(`parsed ${data.length} lead rows from sheet`);

const projects = (await pool.request().query(`SELECT id, name FROM projects`)).recordset;
const norm = (s) => (s || '').replace(/\s+/g, '').replace(/[-–]/g, '');
const findProjectInMemory = (name) => {
  const n = (name || '').trim();
  if (!n || /อื่น/.test(n)) return null;
  const exact = projects.find(p => p.name.trim() === n);
  if (exact) return exact;
  const key = norm(n);
  return projects.find(p => norm(p.name).includes(key) || key.includes(norm(p.name))) || null;
};
// Upsert variant: look up by fuzzy name; if missing, create the project
// (is_active=1) so sheet project names don't end up as NULL project_id.
async function findOrCreateProject(name) {
  const n = (name || '').trim();
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

// Don't "walk the flow" — every imported lead starts at pre_survey and the
// sales team advances it through the app themselves. Dates/notes/amounts
// from the sheet are still captured as raw data; gate flags (survey_confirmed,
// payment_confirmed, ...) stay off so nothing is mis-reported as completed.
const STATUS_MAP = (sheetStatus) => {
  const s = (sheetStatus || '').trim();
  const label = s ? `สถานะจาก sheet: ${s}` : null;
  if (/^12\./.test(s)) return { status: 'pre_survey', note: label, lost: 'ปฏิเสธ/ยกเลิก' };
  if (/^13\./.test(s)) return { status: 'pre_survey', note: label, lost: 'ติดต่อไม่ได้' };
  if (/^14\./.test(s)) return { status: 'pre_survey', note: label, lost: 'ข้อมูลไม่ถูกต้อง' };
  return { status: 'pre_survey', note: label };
};

const CUSTOMER_TYPE_MAP = (v) => {
  const s = (v || '').trim();
  if (/upgrade|Scale ?Up/i.test(s)) return 'upgrade';
  if (/ล้างแผง|O&M/i.test(s)) return 'o_and_m';
  return 'new';
};

const parseDate = (v) => {
  const s = (v || '').trim();
  if (!s) return null;
  // Sheet uses "D/M/YYYY" with Buddhist year sometimes. Normalize → ISO.
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let y = parseInt(m[3]);
    if (y > 2500) y -= 543; // B.E. → C.E.
    return new Date(y, parseInt(m[2]) - 1, parseInt(m[1])).toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const parseMoney = (v) => {
  const s = (v || '').trim().replace(/[^\d.]/g, '');
  return s ? parseFloat(s) : null;
};

const normPhone = (v) => {
  const s = (v || '').trim();
  if (!s) return null;
  return s.replace(/[^0-9+]/g, '').slice(0, 20) || null;
};

if (DRY_RUN) {
  let matched = 0, unmatched = 0;
  for (const r of data) (findProjectInMemory(r[10]) ? matched++ : unmatched++);
  console.log(`project pre-check: ${matched} matched, ${unmatched} would be created`);
  console.log('\nDRY RUN — not touching DB'); await pool.close(); process.exit(0);
}

// Clean existing leads + dependent rows.
const delActs = await pool.request().query(`DELETE FROM lead_activities`);
const delPay = await pool.request().query(`DELETE FROM payments`);
const unlinkProspects = await pool.request().query(`UPDATE prospects SET lead_id = NULL, returned_at = NULL WHERE lead_id IS NOT NULL`);
const delLeads = await pool.request().query(`DELETE FROM leads`);
console.log(`\ncleaned: leads=${delLeads.rowsAffected[0]} activities=${delActs.rowsAffected[0]} payments=${delPay.rowsAffected[0]} prospects_unlinked=${unlinkProspects.rowsAffected[0]}`);

let inserted = 0, failed = 0;
for (const r of data) {
  try {
    const projMatch = await findOrCreateProject(r[10]);
    const statusMap = STATUS_MAP(r[2]);
    const projectNote = (r[11] || '').trim();
    const lostReason = statusMap.lost ? [statusMap.lost, (r[23] || '').trim(), (r[38] || '').trim()].filter(Boolean).join(' · ') : null;

    const requirement = [
      (r[18] || '').trim() ? `ความต้องการ: ${r[18].trim()}` : '',
      (r[19] || '').trim() ? `Product: ${r[19].trim()}` : '',
      (r[20] || '').trim() ? `รายละเอียด: ${r[20].trim()}` : '',
      (r[14] || '').trim() ? `ความสนใจ: ${r[14].trim()}` : '',
    ].filter(Boolean).join('\n');

    const noteParts = [
      (r[1] || '').trim() ? `sheet#: ${r[1].trim()}` : '',
      statusMap.note ? `สถานะจาก sheet: ${statusMap.note}` : '',
      (r[15] || '').trim() ? `Lead Seeker: ${r[15].trim()}` : '',
      (r[4] || '').trim() ? `LINE OA: ${r[4].trim()}` : '',
      (r[21] || '').trim() ? `หมายเหตุ: ${r[21].trim()}` : '',
      !projMatch && (r[10] || '').trim() ? `โครงการจริง: ${r[10].trim()}${projectNote ? ` (${projectNote})` : ''}` : '',
      projectNote && projMatch ? `หมายเหตุโครงการ: ${projectNote}` : '',
    ].filter(Boolean).join('\n');

    const quotationNote = [
      (r[33] || '').trim() ? `ผู้จัดทำ: ${r[33].trim()}` : '',
      (r[35] || '').trim() ? `เลขที่ใบเสนอราคา: ${r[35].trim()}` : '',
      (r[36] || '').trim() ? `วันที่ส่ง: ${r[36].trim()}` : '',
    ].filter(Boolean).join(' · ');

    const surveyNote = [
      (r[31] || '').trim() ? `ผู้สำรวจ: ${r[31].trim()}` : '',
      (r[30] || '').trim() ? `Package: ${r[30].trim()}` : '',
      (r[32] || '').trim() ? r[32].trim() : '',
    ].filter(Boolean).join('\n');

    const paymentType = (r[39] || '').trim();
    const finance = [
      paymentType ? `payment: ${paymentType}` : '',
      (r[40] || '').trim() ? `bank: ${r[40].trim()}` : '',
      (r[41] || '').trim() ? `months: ${r[41].trim()}` : '',
      (r[42] || '').trim() ? `monthly: ${r[42].trim()}` : '',
      (r[44] || '').trim() ? `loan bank: ${r[44].trim()}` : '',
      (r[45] || '').trim() ? `loan amount: ${r[45].trim()}` : '',
      (r[46] || '').trim() ? `docs: ${r[46].trim()}` : '',
      (r[47] || '').trim() ? `loan status: ${r[47].trim()}` : '',
    ].filter(Boolean).join(' · ');

    const req = pool.request()
      .input('full_name', sql.NVarChar(200), (r[8] || '').trim() || 'ลูกค้า')
      .input('phone', sql.NVarChar(20), normPhone(r[9]))
      .input('project_id', sql.Int, projMatch ? projMatch.id : null)
      .input('installation_address', sql.NVarChar(500), (r[7] || '').trim() || null)
      .input('customer_type', sql.NVarChar(50), CUSTOMER_TYPE_MAP(r[12]))
      .input('status', sql.NVarChar(50), statusMap.status)
      .input('source', sql.NVarChar(50), (r[3] || '').trim() || null)
      .input('assigned_staff', sql.NVarChar(100), (r[5] || '').trim() || null)
      .input('note', sql.NVarChar(sql.MAX), noteParts || null)
      .input('requirement', sql.NVarChar(sql.MAX), requirement || null)
      .input('contact_date', sql.Date, parseDate(r[16]))
      .input('last_contact_result', sql.NVarChar(200), (r[22] || '').trim() || null)
      .input('lost_reason', sql.NVarChar(500), lostReason)
      .input('pre_booked_at', sql.DateTime2, parseDate(r[26]) ? new Date(parseDate(r[26])) : null)
      .input('pre_doc_no', sql.NVarChar(50), (r[25] || '').trim() || null)
      .input('pre_total_price', sql.Decimal(12, 2), parseMoney(r[24]))
      .input('payment_confirmed', sql.Bit, statusMap.paymentConfirmed ? 1 : 0)
      .input('survey_date', sql.Date, parseDate(r[29]) || parseDate(r[28]))
      .input('survey_confirmed', sql.Bit, statusMap.surveyConfirmed ? 1 : 0)
      .input('survey_note', sql.NVarChar(sql.MAX), surveyNote || null)
      .input('quotation_note', sql.NVarChar(sql.MAX), quotationNote || null)
      .input('quotation_amount', sql.Decimal(12, 2), parseMoney(r[34]))
      .input('order_before_paid', sql.Bit, statusMap.orderBeforePaid ? 1 : 0)
      .input('order_after_paid', sql.Bit, statusMap.orderAfterPaid ? 1 : 0)
      .input('install_date', sql.Date, parseDate(r[50]) || parseDate(r[48]))
      .input('install_confirmed', sql.Bit, statusMap.installConfirmed ? 1 : 0)
      .input('install_completed_at', sql.DateTime2, parseDate(r[51]) ? new Date(parseDate(r[51])) : null)
      .input('payment_type', sql.NVarChar(50), paymentType || null)
      .input('finance_status', sql.NVarChar(sql.MAX), finance || null)
      .input('home_equity_check', sql.NVarChar(500), (r[43] || '').trim() || null)
      .input('created_at', sql.DateTime2, parseDate(r[6]) ? new Date(parseDate(r[6])) : new Date());

    await req.query(`
      INSERT INTO leads (
        full_name, phone, project_id, installation_address, customer_type, status, source,
        assigned_staff, note, requirement, contact_date, last_contact_result, lost_reason,
        pre_booked_at, pre_doc_no, pre_total_price, payment_confirmed,
        survey_date, survey_confirmed, survey_note,
        quotation_note, quotation_amount,
        order_before_paid, order_after_paid,
        install_date, install_confirmed, install_completed_at,
        payment_type, finance_status, home_equity_check, created_at
      ) VALUES (
        @full_name, @phone, @project_id, @installation_address, @customer_type, @status, @source,
        @assigned_staff, @note, @requirement, @contact_date, @last_contact_result, @lost_reason,
        @pre_booked_at, @pre_doc_no, @pre_total_price, @payment_confirmed,
        @survey_date, @survey_confirmed, @survey_note,
        @quotation_note, @quotation_amount,
        @order_before_paid, @order_after_paid,
        @install_date, @install_confirmed, @install_completed_at,
        @payment_type, @finance_status, @home_equity_check, @created_at
      )
    `);
    inserted++;
  } catch (e) {
    failed++;
    console.error(`FAIL row seq=${r[0]} name=${r[8]?.slice(0, 30)}: ${e.message}`);
  }
}

console.log(`\nIMPORTED: ${inserted}  FAILED: ${failed}`);

// Final state check
const final = (await pool.request().query(`
  SELECT status, COUNT(*) AS n FROM leads GROUP BY status ORDER BY n DESC
`)).recordset;
console.log('\nfinal status distribution:');
for (const x of final) console.log(`  ${x.n.toString().padStart(3)}  ${x.status}`);

await pool.close();
