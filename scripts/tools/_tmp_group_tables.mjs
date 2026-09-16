import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
const rows=await q(`SELECT t.name, ISNULL(SUM(p.rows),0) rows_ FROM sys.tables t
  LEFT JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
  WHERE t.name NOT LIKE '%[_]bak[_]%' GROUP BY t.name`);
const om = rows.filter(r=>/^om_/.test(r.name));
const theirs = rows.filter(r=>!/^om_/.test(r.name));
const G = {
  "โดเมน O&M": /^om_(houses|installations|customers|customer_phones|house_customers|entitlement_grants|redemptions|bookings|service_type|installation_pos)$/,
  "สำเนา REM": /^om_(rem_|projects$|project_map$)/,
  "LINE OA": /^om_(line_|liff_|richmenu|otp_|identity_|match_queue)/,
  "ประวัติ/ที่มา": /^om_(field_sources|import_batches|entitlement_history|customer_history|booking_history|sync_log)$/,
  "ตั้งค่า/lookup": /^om_(teams|team_|service_centers|slot_config|holidays|settings|faq)/,
};
for (const [g, re] of Object.entries(G)) {
  const set = om.filter(r=>re.test(r.name));
  console.log(`\n${g} — ${set.length} ตาราง · ${set.reduce((s,x)=>s+Number(x.rows_),0).toLocaleString()} แถว`);
  console.log(set.sort((a,b)=>b.rows_-a.rows_).map(x=>`   ${x.name.padEnd(26)}${Number(x.rows_).toLocaleString().padStart(8)}`).join("\n"));
}
const known = om.filter(r=>Object.values(G).some(re=>re.test(r.name)));
console.log("\nไม่เข้ากลุ่ม:", om.filter(r=>!known.includes(r)).map(x=>x.name).join(", ") || "ไม่มี");
console.log(`\nรวมของเรา ${om.length} ตาราง · ตารางในฐานที่ไม่ใช่ของเรา ${theirs.length} ตาราง`);
await pool.close();
