import sql from 'mssql';
const ids = [1208, 1147, 1692, 1564, 1547, 1546, 1545, 1526, 1517, 1430, 841];
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});
for (const id of ids) {
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT activity_type, title, note FROM lead_activities WHERE id=@id`);
  if (r.recordset[0]) {
    const row = r.recordset[0];
    console.log(`id=${id}  [${row.activity_type}]  title="${row.title}"  note="${row.note?.slice(0,60)}"`);
  } else {
    console.log(`id=${id}  NOT FOUND in prod`);
  }
}
await pool.close();
