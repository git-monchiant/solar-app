/**
 * Migrate: collapse duplicate (project_id, house_number) rows into one row
 * per house, with all people packed into the `contacts` JSON array.
 *
 * Run order:
 *   1. sql/093_prospects_contacts.sql    (add column + CHECK)
 *   2. node scripts/adhoc/migrate_contacts_json.mjs
 *   3. sql/094_prospects_house_unique.sql (unique index)
 */
import sql from 'mssql';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

// Apply 093 (idempotent)
const mig093 = `
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.prospects') AND name = 'contacts')
  ALTER TABLE dbo.prospects ADD contacts NVARCHAR(MAX) NULL;
`;
await pool.request().query(mig093);
const ckExists = await pool.request().query(
  `SELECT 1 AS x FROM sys.check_constraints WHERE name = 'CK_prospects_contacts_json'`
);
if (ckExists.recordset.length === 0) {
  await pool.request().query(
    `ALTER TABLE dbo.prospects ADD CONSTRAINT CK_prospects_contacts_json
       CHECK (contacts IS NULL OR ISJSON(contacts) = 1);`
  );
}
console.log('093 applied');

// Pull every prospect grouped by (project_id, house_number).
const rows = (await pool.request().query(`
  SELECT id, project_id, house_number, full_name, phone, seq,
         interest, note, visited_at, visit_count, visited_by, lead_id, returned_at,
         app_status, existing_solar, installed_kw, installed_product, ev_charger,
         line_id, contact_time, interest_reasons, interest_reason_note, interest_sizes
  FROM prospects
  WHERE project_id IS NOT NULL AND house_number IS NOT NULL
  ORDER BY project_id, house_number, seq, id
`)).recordset;

// Group.
const groups = new Map();
for (const r of rows) {
  const k = `${r.project_id}|${r.house_number}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const normalizeContact = (r) => ({
  name: (r.full_name || '').trim() || null,
  phone: (r.phone || '').trim() || null,
});

const isUsedRow = (r) =>
  r.interest != null ||
  (r.note && r.note.trim()) ||
  r.visited_at != null ||
  (r.visit_count ?? 0) > 0 ||
  r.lead_id != null ||
  r.line_id != null ||
  (r.interest_reasons && r.interest_reasons.trim()) ||
  (r.interest_reason_note && r.interest_reason_note.trim());

let kept = 0, deleted = 0, packed = 0, conflicts = 0;

for (const [, group] of groups) {
  // Pick "primary" row: prefer one with user activity; else lowest seq/id.
  const used = group.filter(isUsedRow);
  if (used.length > 1) {
    conflicts++;
    console.warn(`CONFLICT: multiple active rows for project=${group[0].project_id} house=${group[0].house_number} → keeping row id=${used[0].id}, others lose activity data`);
  }
  const primary = (used[0]) || group[0];

  // Build contacts array from every row in the group, dedup by (name|phone).
  const seen = new Set();
  const contacts = [];
  // Ensure primary contact goes first.
  const ordered = [primary, ...group.filter((g) => g.id !== primary.id)];
  for (const r of ordered) {
    const c = normalizeContact(r);
    if (!c.name && !c.phone) continue;
    const key = `${c.name || ''}|${c.phone || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push(c);
  }
  const contactsJson = contacts.length > 0 ? JSON.stringify(contacts) : null;

  // Update primary row: set contacts + sync primary full_name/phone.
  const primaryName = contacts[0]?.name ?? null;
  const primaryPhone = contacts[0]?.phone ?? null;
  await pool.request()
    .input('id', sql.Int, primary.id)
    .input('contacts', sql.NVarChar(sql.MAX), contactsJson)
    .input('full_name', sql.NVarChar(200), primaryName)
    .input('phone', sql.NVarChar(20), primaryPhone)
    .query(`UPDATE prospects SET contacts = @contacts, full_name = @full_name, phone = @phone WHERE id = @id`);
  kept++;
  if (contacts.length > 1) packed += contacts.length - 1;

  // Delete non-primary rows.
  const toDelete = group.filter((g) => g.id !== primary.id).map((g) => g.id);
  if (toDelete.length > 0) {
    const ids = toDelete.join(',');
    const del = await pool.request().query(`DELETE FROM prospects WHERE id IN (${ids})`);
    deleted += del.rowsAffected[0] ?? 0;
  }
}

console.log(`groups kept: ${kept}`);
console.log(`rows deleted: ${deleted}`);
console.log(`extra contacts packed into JSON: ${packed}`);
console.log(`conflicts (houses with >1 active row, see warnings above): ${conflicts}`);

// Also backfill contacts on single-row houses that were never in a group-of-many
// (so every house has a contacts array, not just collapsed ones).
const backfill = await pool.request().query(`
  UPDATE prospects
  SET contacts = (SELECT full_name AS name, phone AS phone FOR JSON PATH)
  WHERE contacts IS NULL AND (full_name IS NOT NULL OR phone IS NOT NULL)
`);
console.log(`backfilled single-contact JSON on: ${backfill.rowsAffected[0]} rows`);

const summary = await pool.request().query(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN contacts IS NOT NULL THEN 1 ELSE 0 END) AS with_contacts,
    SUM(CASE WHEN contacts IS NULL THEN 1 ELSE 0 END) AS without_contacts
  FROM prospects
`);
console.log('after:', summary.recordset[0]);

// Check for remaining duplicates before anyone tries to add the unique index.
const dup = await pool.request().query(`
  SELECT project_id, house_number, COUNT(*) AS n
  FROM prospects
  WHERE project_id IS NOT NULL AND house_number IS NOT NULL
  GROUP BY project_id, house_number HAVING COUNT(*) > 1
`);
console.log(`remaining (project_id, house_number) duplicates: ${dup.recordset.length}`);
if (dup.recordset.length > 0) console.log(dup.recordset);

await pool.close();
