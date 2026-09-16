import sql from "mssql"; import fs from "fs";
const pool = await sql.connect({server:"172.41.1.73",port:1433,user:"monchiant",password:"monchiant",
  database:"solardb_dev",options:{encrypt:false,trustServerCertificate:true,useUTC:false}});
const rows=(await pool.request().query(`SELECT id,policy_code,policy_version,instance_key,status,
  CONVERT(varchar(30),started_at,121) s,CONVERT(varchar(30),due_at,121) d,CONVERT(varchar(30),completed_at,121) c,
  CONVERT(varchar(30),breached_at,121) b,CONVERT(varchar(30),superseded_at,121) sup,owner_role,
  CONVERT(varchar(30),updated_at,121) u FROM lead_sla_instances`)).recordset;
fs.writeFileSync(process.argv[2], JSON.stringify(rows));
await pool.close();
