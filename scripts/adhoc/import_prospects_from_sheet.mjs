/**
 * Import prospects from a Google Sheet (same col A–I format as the Sena Wela
 * sheet). Each run imports ONE project.
 *
 * Usage:
 *   node scripts/adhoc/import_prospects_from_sheet.mjs \
 *     --project "เสนา เวล่า สุขุมวิท - บางปู" \
 *     --csv /tmp/prospects_import.csv
 *
 *   # or directly from Google Sheets (gid defaults to 0):
 *     --url "https://docs.google.com/spreadsheets/d/<ID>/edit?gid=0"
 *
 *   # optional: wipe ALL prospects before the import (for the very first run).
 *     --clear-all
 *
 * Behavior:
 *   - Creates the project row if the name is new.
 *   - Deletes prospects for THIS project before inserting (re-runs are idempotent).
 *     With --clear-all, deletes everything in prospects first instead.
 *   - Sheet rows: top 3 rows treated as headers; cols A–I mapped; blank house_number skipped.
 */
import sql from 'mssql';
import fs from 'fs';

const cfg = {
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
};

const args = new Map();
let posA = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    if (next === undefined || next.startsWith('--')) args.set(key, true);
    else { args.set(key, next); i++; }
  } else posA.push(a);
}

let PROJECT_NAME = args.get('project');
const CSV_PATH = args.get('csv');
const SHEET_URL = args.get('url');
const CLEAR_ALL = !!args.get('clear-all');
const HEADER_ROWS = parseInt(args.get('header-rows') || '3', 10);

if (!PROJECT_NAME && !SHEET_URL) { console.error('Missing --project (required unless --url auto-detects from filename)'); process.exit(1); }
if (!CSV_PATH && !SHEET_URL) { console.error('Missing --csv or --url'); process.exit(1); }

async function fetchSheetTitle(url) {
  const m = url.match(/\/d\/([^/]+)/);
  if (!m) return null;
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/edit`);
  const html = await res.text();
  const tm = html.match(/<title>([^<]+)<\/title>/);
  if (!tm) return null;
  return tm[1]
    .replace(/\s*-\s*Google\s*(Sheets|ชีต)\s*$/i, '')
    .replace(/_ข้อมูลลูกบ้าน\s*\(Solar\)\s*$/i, '')
    .trim();
}

const normPhone = (v) => {
  const s = (v ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, '').slice(0, 20);
  return digits || null;
};

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

const trimOrNull = (v) => { const s = (v ?? '').trim(); return s ? s : null; };
const parseKw = (v) => { const s = (v ?? '').trim(); if (!s) return null; const m = s.match(/([0-9]+(?:\.[0-9]+)?)/); return m ? parseFloat(m[1]) : null; };
const parseSeq = (v) => { const n = parseInt((v ?? '').trim(), 10); return Number.isFinite(n) ? n : null; };

function sheetUrlToCsvUrl(input) {
  const m = input.match(/\/d\/([^/]+)/);
  if (!m) throw new Error(`Not a Google Sheet URL: ${input}`);
  const id = m[1];
  const gidMatch = input.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

let csvText;
if (CSV_PATH) {
  csvText = fs.readFileSync(CSV_PATH, 'utf8');
} else {
  const url = sheetUrlToCsvUrl(SHEET_URL);
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  csvText = await res.text();
}

if (!PROJECT_NAME && SHEET_URL) {
  PROJECT_NAME = await fetchSheetTitle(SHEET_URL);
  if (!PROJECT_NAME) { console.error('Could not auto-detect project name from sheet title'); process.exit(1); }
  console.log(`Auto-detected project name: "${PROJECT_NAME}"`);
}

const rows = parseCSV(csvText);
console.log(`CSV parsed: ${rows.length} rows (project: "${PROJECT_NAME}")`);

// Dynamically map header columns — sheet layouts vary (some add empty
// spacer cols between phone and app_status).
const headerRow = rows[HEADER_ROWS - 1] || [];
const norm = (s) => (s ?? '').replace(/\s+/g, '').toLowerCase();
function findCol(predicates) {
  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i]);
    if (!h) continue;
    if (predicates.some((p) => h.includes(norm(p)))) return i;
  }
  return -1;
}
const COL = {
  seq: findCol(['ลำดับ']),
  house_number: findCol(['บ้านเลขที่', 'แปลง']),
  full_name: findCol(['ชื่อ-นามสกุล', 'สมาชิก']),
  phone: findCol(['เบอร์']),
  app_status: findCol(['appsenprop', 'sensprop', 'สถานะการใช้งาน']),
  existing_solar: findCol(['solarเดิม', 'สถานะsolar']),
  installed_kw: findCol(['ขนาดติดตั้ง', 'kw', 'หน่วย:']),
  installed_product: findCol(['ผลิตภัณฑ์']),
  ev_charger: findCol(['evcharger', 'ev']),
  assignee: findCol(['เจ้าหน้าที่ผู้ดูแล', 'ผู้ดูแล', 'เจ้าหน้าที่']),
};
console.log('Column map:', COL);
if (COL.house_number < 0) { console.error('Cannot find house_number column in header'); process.exit(1); }

const pool = await sql.connect(cfg);

// Pick the assignee from the first non-empty assignee cell (one name per project).
const dataRowsAll = rows.slice(HEADER_ROWS).filter(r => (r[COL.house_number] ?? '').trim());
let assignee = null;
if (COL.assignee >= 0) {
  for (const r of dataRowsAll) {
    const v = (r[COL.assignee] ?? '').trim();
    if (v) { assignee = v.slice(0, 100); break; }
  }
}
console.log(`Assignee: ${assignee || '(none found)'}`);

// Find or create project
let projectId;
const existing = await pool.request()
  .input('name', sql.NVarChar(200), PROJECT_NAME)
  .query(`SELECT id FROM projects WHERE name = @name`);
if (existing.recordset.length > 0) {
  projectId = existing.recordset[0].id;
  console.log(`Project exists: id=${projectId}`);
  if (assignee !== null) {
    await pool.request()
      .input('id', sql.Int, projectId)
      .input('assignee', sql.NVarChar(100), assignee)
      .query(`UPDATE projects SET assignee = @assignee WHERE id = @id`);
  }
} else {
  const ins = await pool.request()
    .input('name', sql.NVarChar(200), PROJECT_NAME)
    .input('assignee', sql.NVarChar(100), assignee)
    .query(`INSERT INTO projects (name, is_active, assignee) OUTPUT INSERTED.id VALUES (@name, 1, @assignee)`);
  projectId = ins.recordset[0].id;
  console.log(`Project created: id=${projectId}`);
}

// Clear existing prospects
if (CLEAR_ALL) {
  const del = await pool.request().query(`DELETE FROM prospects`);
  console.log(`Deleted ALL prospects: ${del.rowsAffected[0] ?? 0} rows`);
} else {
  const del = await pool.request()
    .input('project_id', sql.Int, projectId)
    .query(`DELETE FROM prospects WHERE project_id = @project_id`);
  console.log(`Deleted prospects for project ${projectId}: ${del.rowsAffected[0] ?? 0} rows`);
}

// Import data rows using the dynamic column map
const dataRows = rows.slice(HEADER_ROWS).filter(r => (r[COL.house_number] ?? '').trim());
console.log(`Data rows to import: ${dataRows.length}`);

const get = (r, idx) => (idx >= 0 ? r[idx] : undefined);
let ok = 0, skip = 0;
for (const r of dataRows) {
  const house_number = trimOrNull(get(r, COL.house_number));
  if (!house_number) { skip++; continue; }
  await pool.request()
    .input('project_id', sql.Int, projectId)
    .input('project_name', sql.NVarChar(200), PROJECT_NAME)
    .input('seq', sql.Int, parseSeq(get(r, COL.seq)))
    .input('house_number', sql.NVarChar(50), house_number)
    .input('full_name', sql.NVarChar(200), trimOrNull(get(r, COL.full_name)))
    .input('phone', sql.NVarChar(20), normPhone(get(r, COL.phone)))
    .input('app_status', sql.NVarChar(50), trimOrNull(get(r, COL.app_status)))
    .input('existing_solar', sql.NVarChar(50), trimOrNull(get(r, COL.existing_solar)))
    .input('installed_kw', sql.Decimal(8, 2), parseKw(get(r, COL.installed_kw)))
    .input('installed_product', sql.NVarChar(200), trimOrNull(get(r, COL.installed_product)))
    .input('ev_charger', sql.NVarChar(100), trimOrNull(get(r, COL.ev_charger)))
    .query(`
      INSERT INTO prospects (project_id, project_name, seq, house_number, full_name, phone, app_status, existing_solar, installed_kw, installed_product, ev_charger)
      VALUES (@project_id, @project_name, @seq, @house_number, @full_name, @phone, @app_status, @existing_solar, @installed_kw, @installed_product, @ev_charger)
    `);
  ok++;
}
console.log(`Imported: ${ok} · Skipped: ${skip}`);
await pool.close();
