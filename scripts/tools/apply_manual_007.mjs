import sql from 'mssql';
const A = "ติดต่อได้ - Sale เสนอขาย";
const C = "ติดต่อไม่ได้ - ไม่รับสาย";
const mappings = [
  { id: 1208, title: C },
  { id: 1147, title: C },
  { id: 1692, title: A },
  { id: 1564, title: A },
  { id: 1547, title: A },
  { id: 1546, title: A },
  { id: 1545, title: A },
  { id: 1526, title: A },
  { id: 1517, title: A },
  { id: 1430, title: A },
  { id: 841,  title: A },
];
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
for (const m of mappings) {
  await pool.request()
    .input('id', sql.Int, m.id)
    .input('title', sql.NVarChar(sql.MAX), m.title)
    .query(`UPDATE lead_activities SET title = @title WHERE id = @id`);
  console.log(`  ${m.id} → ${m.title}`);
}
console.log(`\nDone — ${mappings.length} rows updated`);
await pool.close();
