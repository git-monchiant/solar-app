/**
 * Unify role model: merge legacy users.role + user_roles table into a
 * single JSON array column users.roles. Idempotent.
 *
 * Run order:
 *   1. sql/095_users_roles_json.sql (adds column + CHECK)
 *   2. this script (backfills data)
 *   3. Drop user_roles table + users.role AFTER verifying code no longer uses them.
 */
import sql from 'mssql';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

// Apply migration 095 (idempotent).
await pool.request().query(`
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'roles')
    ALTER TABLE dbo.users ADD roles NVARCHAR(MAX) NULL;
`);
const ck = await pool.request().query(
  `SELECT 1 AS x FROM sys.check_constraints WHERE name = 'CK_users_roles_json'`
);
if (ck.recordset.length === 0) {
  await pool.request().query(
    `ALTER TABLE dbo.users ADD CONSTRAINT CK_users_roles_json
       CHECK (roles IS NULL OR ISJSON(roles) = 1);`
  );
}

// Build merged role set per user from both sources.
const users = (await pool.request().query(`
  SELECT u.id, u.username, u.role as legacy_role,
         (SELECT STRING_AGG(role, ',') FROM user_roles WHERE user_id = u.id) as user_roles_agg
  FROM users u ORDER BY u.id
`)).recordset;

const VALID = new Set(['admin', 'sales', 'solar', 'leadsseeker']);
let updated = 0;
for (const u of users) {
  const set = new Set();
  if (u.legacy_role && VALID.has(u.legacy_role)) set.add(u.legacy_role);
  if (u.user_roles_agg) {
    for (const r of u.user_roles_agg.split(',')) {
      const t = r.trim();
      if (VALID.has(t)) set.add(t);
    }
  }
  // If somehow no valid role at all, default to sales.
  if (set.size === 0) set.add('sales');
  const arr = Array.from(set).sort();
  const json = JSON.stringify(arr);

  await pool.request()
    .input('id', sql.Int, u.id)
    .input('roles', sql.NVarChar(sql.MAX), json)
    .query(`UPDATE users SET roles = @roles WHERE id = @id`);
  console.log(`#${u.id} ${u.username}: [${arr.join(', ')}]`);
  updated++;
}
console.log(`\nusers updated: ${updated}`);

await pool.close();
