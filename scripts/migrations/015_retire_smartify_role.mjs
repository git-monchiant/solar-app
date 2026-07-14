import sql from "mssql";

const dbArg = process.argv.slice(2).find((arg) => arg.startsWith("--db="));
const database = dbArg?.split("=")[1];

if (!database) {
  console.error("Usage: node 015_retire_smartify_role.mjs --db=<solardb|solardb_dev>");
  process.exit(1);
}

const pool = await sql.connect({
  server: "172.41.1.73",
  port: 1433,
  user: "monchiant",
  password: "monchiant",
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

const transaction = new sql.Transaction(pool);

try {
  await transaction.begin();
  const users = await new sql.Request(transaction).query(`
    SELECT id, username, roles
    FROM users WITH (UPDLOCK, HOLDLOCK)
    WHERE roles IS NOT NULL
      AND ISJSON(roles) = 1
      AND EXISTS (SELECT 1 FROM OPENJSON(roles) WHERE value = 'smartify')
  `);

  for (const user of users.recordset) {
    const parsedRoles = JSON.parse(user.roles);
    if (!Array.isArray(parsedRoles)) {
      throw new Error(`Cannot retire smartify: user '${user.username}' has non-array roles JSON`);
    }
    const roles = parsedRoles.filter((role) => role !== "smartify");
    if (roles.length === 0) {
      throw new Error(`Cannot retire smartify: user '${user.username}' would have no roles`);
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, user.id)
      .input("roles", sql.NVarChar(sql.MAX), JSON.stringify(roles))
      .query("UPDATE users SET roles = @roles, updated_at = GETDATE() WHERE id = @id");
  }

  await transaction.commit();
  console.log(`Removed smartify from ${users.recordset.length} user(s) in ${database}.`);
} catch (error) {
  await transaction.rollback();
  throw error;
} finally {
  await pool.close();
}
