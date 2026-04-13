import sql from 'mssql';
import fs from 'fs';
const config = {
  server: '172.41.1.73',
  port: 1433,
  user: 'monchiant',
  password: 'monchiant',
  database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
};
const file = process.argv[2];
const content = fs.readFileSync(file, 'utf8');
const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(b => b && !b.startsWith('--') || b.includes('\n'));
const pool = await sql.connect(config);
for (const batch of batches) {
  if (!batch.trim()) continue;
  console.log('-- batch --');
  console.log(batch.substring(0, 100));
  await pool.request().batch(batch);
}
console.log('OK');
await pool.close();
