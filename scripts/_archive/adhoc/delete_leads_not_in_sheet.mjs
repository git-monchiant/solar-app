/**
 * Drop every lead whose customer_code isn't in the source sheet.
 * Pairs with import_leads_merge.mjs — that one only INSERTs/UPDATEs from the
 * sheet; this trims the DB back so the lead count matches the sheet exactly.
 */
import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

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
const csvText = await (await fetch(SHEET_URL)).text();
const rows = parseCSV(csvText);
const data = rows.slice(3).filter(r => r.length > 8 && (r[8] || '').trim());

const sheetCodes = new Set(
  data.map(r => (r[1] || '').toString().trim()).filter(Boolean),
);
console.log(`sheet has ${sheetCodes.size} distinct customer_codes`);

const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false },
});

// Build the IN-list as a TVP-free literal (codes are short safe strings).
const codesSql = [...sheetCodes]
  .map(c => `'${c.replace(/'/g, "''")}'`)
  .join(',') || "''";

const before = (await pool.request().query(`SELECT COUNT(*) AS n FROM leads`)).recordset[0].n;
console.log(`leads before: ${before}`);

// Find target leads first so we can wipe dependent rows in the right order.
const targets = await pool.request().query(`
  SELECT id, customer_code, full_name FROM leads
  WHERE customer_code IS NULL
     OR LTRIM(RTRIM(customer_code)) = ''
     OR LTRIM(RTRIM(customer_code)) NOT IN (${codesSql})
`);
console.log(`will delete ${targets.recordset.length} leads not in sheet`);
if (targets.recordset.length > 0) {
  console.log('first few:');
  for (const t of targets.recordset.slice(0, 5)) {
    console.log(`  ${t.id}  code="${t.customer_code ?? '(null)'}"  name="${t.full_name}"`);
  }
}

// 1. Cascade-delete dependent rows (only lead_activities has a hard FK; the
//    rest were already wiped by the merge import but we cover them anyway).
const idsCsv = targets.recordset.map(r => r.id).join(',') || '0';
const delActs = await pool.request().query(`DELETE FROM lead_activities WHERE lead_id IN (${idsCsv})`);
const delPay = await pool.request().query(`DELETE FROM payments WHERE lead_id IN (${idsCsv})`);
const delSlips = await pool.request().query(`DELETE FROM slip_files WHERE lead_id IN (${idsCsv})`);
const unlinkPros = await pool.request().query(`UPDATE prospects SET lead_id = NULL, returned_at = NULL WHERE lead_id IN (${idsCsv})`);
console.log(`cleanup: activities=${delActs.rowsAffected[0]} payments=${delPay.rowsAffected[0]} slips=${delSlips.rowsAffected[0]} prospects_unlinked=${unlinkPros.rowsAffected[0]}`);

// 2. Delete the leads themselves.
const delLeads = await pool.request().query(`DELETE FROM leads WHERE id IN (${idsCsv})`);
console.log(`deleted ${delLeads.rowsAffected[0]} leads`);

const after = (await pool.request().query(`SELECT COUNT(*) AS n FROM leads`)).recordset[0].n;
console.log(`leads after: ${after}`);

await pool.close();
