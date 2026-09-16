import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
const T=["packages","package_items","install_checklists","calendar_blocks","line_users","lead_activities"];
for (const t of T) {
  const c=await q(`SELECT COLUMN_NAME n, DATA_TYPE d, CHARACTER_MAXIMUM_LENGTH L, IS_NULLABLE nl
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`);
  console.log(`\n${t}: ` + c.map(x=>`${x.n}:${x.d}${x.L&&x.L>0?`(${x.L})`:""}${x.nl==="YES"?"?":""}`).join(" · "));
}
process.exit(0);
const theirs=await q(`SELECT t.name, ISNULL(SUM(p.rows),0) rows_ FROM sys.tables t
  LEFT JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
  WHERE t.name NOT LIKE 'om[_]%' AND t.name NOT LIKE '%[_]bak[_]%' GROUP BY t.name ORDER BY t.name`);
console.log(theirs.map(x=>`  ${x.name.padEnd(28)}${Number(x.rows_).toLocaleString().padStart(8)}`).join("\n"));
await pool.close();
