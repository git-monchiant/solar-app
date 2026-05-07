import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const cols = await pool.request().query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('projects')`);
console.log("projects columns:", cols.recordset.map(c => c.name).join(", "));

const exists = await pool.request().input("n", sql.NVarChar(200), "โครงการอื่นทั่วไป")
  .query(`SELECT id, name FROM projects WHERE name = @n`);
if (exists.recordset.length > 0) {
  console.log("Already exists:", exists.recordset[0]);
} else {
  const r = await pool.request().input("n", sql.NVarChar(200), "โครงการอื่นทั่วไป")
    .query(`INSERT INTO projects (name) OUTPUT INSERTED.id, INSERTED.name VALUES (@n)`);
  console.log("Inserted:", r.recordset[0]);
}
await pool.close();
