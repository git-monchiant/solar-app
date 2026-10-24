import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
console.log("om_faq.category:", JSON.stringify(await q(`SELECT category, COUNT(*) n FROM om_faq GROUP BY category`)));
console.log("om_faq_categories:", JSON.stringify(await q(`SELECT id,name,sort_order FROM om_faq_categories ORDER BY sort_order`)));
console.log("install_checklists ตัวอย่าง 1 แถว:", JSON.stringify((await q(`SELECT TOP 1 lead_id, inspection_date, LEFT(visual_checks,180) visual_checks, LEFT(function_tests,180) function_tests FROM install_checklists WHERE visual_checks IS NOT NULL`))[0]));
await pool.close();
