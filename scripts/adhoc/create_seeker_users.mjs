import sql from 'mssql';
import { scryptSync, randomBytes } from 'crypto';

function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

const USERS = [
  { full_name: 'คุณอลงกรณ์ วิบูลย์พันธ์', email: 'alongkornw@senxgroup.com' },
  { full_name: 'นายเกรียงศักดิ์ โกษียาภรณ์', email: 'kreangsakk@senxgroup.com' },
  { full_name: 'นางมาริษา ตันเจริญรัตน์', email: 'marisat@senxgroup.com' },
  { full_name: 'นายสุทธิกรณ์ เจริญตะคุ', email: 'suthikornc@senxgroup.com' },
  { full_name: 'นายสุวรรณ มีศรี', email: 'suwanm@senxgroup.com' },
];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

for (const u of USERS) {
  const username = u.email.split('@')[0];
  const password = username; // user will change on first login
  const hashed = hashPassword(password);

  const existing = await pool.request()
    .input('email', sql.NVarChar(200), u.email)
    .query(`SELECT id FROM users WHERE email = @email`);

  if (existing.recordset.length > 0) {
    console.log(`EXISTS: ${u.email} (id=${existing.recordset[0].id}) — skipping`);
    continue;
  }

  const r = await pool.request()
    .input('username', sql.NVarChar(100), username)
    .input('password_hash', sql.NVarChar(255), hashed)
    .input('full_name', sql.NVarChar(200), u.full_name)
    .input('email', sql.NVarChar(200), u.email)
    .input('roles', sql.NVarChar(sql.MAX), JSON.stringify(['leadsseeker']))
    .input('team', sql.NVarChar(100), 'Sen X PM')
    .input('is_active', sql.Bit, 1)
    .query(`
      INSERT INTO users (username, password_hash, full_name, email, roles, team, is_active)
      OUTPUT INSERTED.id
      VALUES (@username, @password_hash, @full_name, @email, @roles, @team, @is_active)
    `);
  console.log(`CREATED id=${r.recordset[0].id}  ${u.full_name}  ${u.email}  pw=${password}`);
}

await pool.close();
