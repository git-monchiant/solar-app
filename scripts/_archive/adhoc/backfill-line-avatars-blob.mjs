// Backfill line_users.picture_blob/picture_mime by fetching the LINE CDN URL
// stored in picture_url. Run once after migration 123 to seed avatars for all
// existing users; the webhook handles new ones.
import sql from 'mssql';

async function download(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SenaSolarApp/1.0' } });
    if (!r.ok) return { ok: false, status: r.status };
    const mime = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, buf, mime };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const todo = await pool.request().query(`
  SELECT id, line_user_id, picture_url
  FROM line_users
  WHERE picture_blob IS NULL AND picture_url IS NOT NULL AND picture_url <> ''
  ORDER BY id
`);
console.log(`Backfilling ${todo.recordset.length} LINE avatars into picture_blob...\n`);

let ok = 0, missed = 0;
for (let i = 0; i < todo.recordset.length; i++) {
  const u = todo.recordset[i];
  const r = await download(u.picture_url);
  if (!r.ok) {
    missed++;
    if (missed % 20 === 0) console.log(`  ...${missed} missed (last: id=${u.id} status=${r.status || r.error})`);
    continue;
  }
  await pool.request()
    .input('id', sql.Int, u.id)
    .input('blob', sql.VarBinary(sql.MAX), r.buf)
    .input('mime', sql.NVarChar(50), r.mime)
    .query(`UPDATE line_users SET picture_blob = @blob, picture_mime = @mime WHERE id = @id`);
  ok++;
  if (ok % 50 === 0) process.stdout.write(`  saved ${ok}/${todo.recordset.length}\n`);
}
console.log(`\nDone. saved=${ok} missed=${missed}`);
await pool.close();
