import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const p = await pool.request().input("id", sql.Int, 463).query(`
  SELECT * FROM payments WHERE lead_id = @id ORDER BY step_no
`);
for (const row of p.recordset) {
  // print all non-null cols
  const compact = Object.fromEntries(Object.entries(row).filter(([_,v]) => v != null));
  console.log(JSON.stringify(compact, null, 2));
  console.log("---");
}
await pool.close();
