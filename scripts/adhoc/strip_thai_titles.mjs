import sql from 'mssql';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const stripThaiTitle = (v) => {
  const s = (v ?? '').trim();
  if (!s) return null;
  return s.replace(/^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?)\s*/u, '').trim() || null;
};

const rows = (await pool.request().query(`
  SELECT id, full_name, contacts FROM prospects
`)).recordset;

let fullNameUpdated = 0;
let contactsUpdated = 0;

for (const r of rows) {
  let changed = false;
  const patch = {};

  const newFull = stripThaiTitle(r.full_name);
  if (newFull !== r.full_name) {
    patch.full_name = newFull;
    changed = true;
    fullNameUpdated++;
  }

  if (r.contacts) {
    try {
      const arr = JSON.parse(r.contacts);
      if (Array.isArray(arr)) {
        const cleaned = arr.map((c) => ({
          name: stripThaiTitle(c?.name),
          phone: c?.phone ?? null,
        })).filter((c) => c.name || c.phone);
        const newJson = cleaned.length ? JSON.stringify(cleaned) : null;
        if (newJson !== r.contacts) {
          patch.contacts = newJson;
          changed = true;
          contactsUpdated++;
        }
      }
    } catch {}
  }

  if (!changed) continue;

  const req = pool.request().input('id', sql.Int, r.id);
  const sets = [];
  if ('full_name' in patch) {
    sets.push('full_name = @full_name');
    req.input('full_name', sql.NVarChar(200), patch.full_name);
  }
  if ('contacts' in patch) {
    sets.push('contacts = @contacts');
    req.input('contacts', sql.NVarChar(sql.MAX), patch.contacts);
  }
  await req.query(`UPDATE prospects SET ${sets.join(', ')} WHERE id = @id`);
}

console.log(`full_name stripped: ${fullNameUpdated}`);
console.log(`contacts JSON stripped: ${contactsUpdated}`);

// Quick verify.
const sample = await pool.request().query(`
  SELECT TOP 5 id, full_name, contacts FROM prospects WHERE contacts IS NOT NULL ORDER BY id DESC
`);
for (const r of sample.recordset) {
  console.log(`#${r.id}  full_name=${r.full_name}  contacts=${r.contacts}`);
}

await pool.close();
