import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`SELECT name, system_type_id FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_customize_items'`);
console.log(r.recordset);
await pool.close();
