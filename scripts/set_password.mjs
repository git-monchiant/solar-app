import sql from 'mssql';
import { scryptSync, randomBytes } from 'crypto';

const config = {
  server: '172.41.1.73',
  port: 1433,
  user: 'monchiant',
  password: 'monchiant',
  database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
};

function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

const username = process.argv[2];
const password = process.argv[3];
if (!username || !password) {
  console.error('usage: node scripts/set_password.mjs <username> <password>');
  process.exit(1);
}

const pool = await sql.connect(config);
const hash = hashPassword(password);
const result = await pool.request()
  .input('username', sql.NVarChar(50), username)
  .input('hash', sql.NVarChar(255), hash)
  .query('UPDATE users SET password_hash = @hash WHERE username = @username');
console.log(`Updated ${result.rowsAffected[0]} row(s) for "${username}"`);
await pool.close();
