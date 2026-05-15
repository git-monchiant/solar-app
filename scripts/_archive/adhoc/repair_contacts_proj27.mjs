/**
 * Restore missing contacts for project 27 (สำเพ็ง 2 เฟส 3 - 18 แปลง) from
 * the source Google Sheet. Only touches the `contacts` JSON (adds back
 * residents that were deleted). Leaves interest/note/visit data alone.
 */
import sql from 'mssql';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1FUHN7vmwbpXOwb7QooT_ZWaZg1_tChs2SgHv03aDeqc/export?format=csv&gid=0';
const PROJECT_ID = 27;
const HEADER_ROWS = 3;

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const normPhone = (v) => {
  const s = (v ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, '').slice(0, 20);
  return digits || null;
};
const stripThaiTitle = (v) => {
  const s = (v ?? '').trim();
  if (!s) return null;
  return s.replace(/^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?)\s*/u, '').trim() || null;
};
const trimOrNull = (v) => { const s = (v ?? '').trim(); return s || null; };

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

const res = await fetch(SHEET_URL);
if (!res.ok) { console.error('fetch failed', res.status); process.exit(1); }
const csvText = await res.text();
const rows = parseCSV(csvText);
const headerRow = rows[HEADER_ROWS - 1] || [];
const norm = (s) => (s ?? '').replace(/\s+/g, '').toLowerCase();
function findCol(preds) {
  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i]);
    if (!h) continue;
    if (preds.some((p) => h.includes(norm(p)))) return i;
  }
  return -1;
}
const COL = {
  house_number: findCol(['บ้านเลขที่', 'แปลง']),
  full_name: findCol(['ชื่อ-นามสกุล', 'สมาชิก']),
  phone: findCol(['เบอร์']),
};
if (COL.house_number < 0 || COL.full_name < 0) {
  console.error('missing columns in sheet');
  process.exit(1);
}

// Build ground-truth contacts per house from CSV.
const truth = new Map();
for (const r of rows.slice(HEADER_ROWS)) {
  const house = trimOrNull(r[COL.house_number]);
  if (!house) continue;
  const name = stripThaiTitle(r[COL.full_name]);
  const phone = normPhone(r[COL.phone]);
  if (!name && !phone) continue;
  if (!truth.has(house)) truth.set(house, []);
  const arr = truth.get(house);
  const key = `${name || ''}|${phone || ''}`;
  if (!arr.some((c) => `${c.name || ''}|${c.phone || ''}` === key)) {
    arr.push({ name, phone });
  }
}

// Pull current DB state for project 27.
const db = (await pool.request().query(`
  SELECT id, house_number, full_name, phone, contacts
  FROM prospects WHERE project_id = ${PROJECT_ID}
`)).recordset;

let touched = 0, added = 0;
for (const row of db) {
  const sheetContacts = truth.get(row.house_number) || [];
  if (sheetContacts.length === 0) continue;

  let current = [];
  if (row.contacts) {
    try {
      const parsed = JSON.parse(row.contacts);
      if (Array.isArray(parsed)) current = parsed.map((c) => ({
        name: c?.name ?? null,
        phone: c?.phone ?? null,
      }));
    } catch {}
  }
  const currentKeys = new Set(current.map((c) => `${c.name || ''}|${c.phone || ''}`));

  let changed = false;
  for (const sc of sheetContacts) {
    const key = `${sc.name || ''}|${sc.phone || ''}`;
    if (!currentKeys.has(key)) {
      current.push(sc);
      currentKeys.add(key);
      added++;
      changed = true;
    }
  }
  if (!changed) continue;

  const json = JSON.stringify(current);
  await pool.request()
    .input('id', sql.Int, row.id)
    .input('contacts', sql.NVarChar(sql.MAX), json)
    .query(`UPDATE prospects SET contacts = @contacts WHERE id = @id`);
  touched++;
  console.log(`#${row.id} ${row.house_number}: +${sheetContacts.length} sheet / ${current.length} after`);
}

console.log(`\nhouses touched: ${touched}`);
console.log(`contacts restored: ${added}`);

await pool.close();
