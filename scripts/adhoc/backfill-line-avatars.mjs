import sql from 'mssql';
import { writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';

const AVATAR_DIR = path.resolve('public/uploads/line-avatars');
const PUBLIC_PREFIX = '/uploads/line-avatars';

async function ensureDir() {
  try { await stat(AVATAR_DIR); } catch { await mkdir(AVATAR_DIR, { recursive: true }); }
}

async function download(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SenaSolarApp/1.0' } });
    if (!r.ok) return { ok: false, status: r.status };
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    return { ok: true, buf: Buffer.from(await r.arrayBuffer()), ext };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
await ensureDir();

const todo = await pool.request().query(`
  SELECT id, line_user_id, picture_url
  FROM line_users
  WHERE picture_local_path IS NULL AND picture_url IS NOT NULL AND picture_url <> ''
  ORDER BY id
`);
console.log(`Backfilling ${todo.recordset.length} LINE avatars...\n`);

let ok = 0, missed = 0;
for (let i = 0; i < todo.recordset.length; i++) {
  const u = todo.recordset[i];
  const safeId = String(u.line_user_id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const r = await download(u.picture_url);
  if (!r.ok) {
    missed++;
    if (missed % 20 === 0) console.log(`  ...${missed} missed (last: id=${u.id} status=${r.status || r.error})`);
    continue;
  }
  const filename = `${safeId}.${r.ext}`;
  await writeFile(path.join(AVATAR_DIR, filename), r.buf);
  const localPath = `${PUBLIC_PREFIX}/${filename}`;
  await pool.request()
    .input('id', sql.Int, u.id)
    .input('p', sql.NVarChar(300), localPath)
    .query(`UPDATE line_users SET picture_local_path = @p WHERE id = @id`);
  ok++;
  if (ok % 50 === 0) process.stdout.write(`  saved ${ok}/${todo.recordset.length}\n`);
}
console.log(`\nDone. saved=${ok} missed=${missed}`);
await pool.close();
