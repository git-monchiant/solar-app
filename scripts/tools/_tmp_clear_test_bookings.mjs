// ลบงานทดสอบที่สร้างตอนพัฒนา (9 ก.ย. 69) — ล้างทั้งประวัติและใบตัดสิทธิ์ที่ผูกไว้
import sql from 'mssql'; import fs from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-09.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:(WRITE?'★ WRITE ':'ตรวจ (SELECT) ')+'ลบงานทดสอบใน om_bookings'})+'\n');
const rows = (await pool.request().query(`SELECT id, house_id, status FROM om_bookings ORDER BY id`)).recordset;
console.log('งานในระบบ:', rows.length, rows.map(r=>`#${r.id}(${r.status})`).join(' '));
if (!rows.length) { await pool.close(); process.exit(0); }
if (!WRITE) { console.log('ตรวจอย่างเดียว — ใส่ --write เพื่อลบ'); await pool.close(); process.exit(0); }
const tx = new sql.Transaction(pool); await tx.begin();
try {
  const r1 = await new sql.Request(tx).query(`DELETE FROM om_redemptions WHERE booking_id IS NOT NULL`);
  const r2 = await new sql.Request(tx).query(`DELETE FROM om_booking_history`);
  const r3 = await new sql.Request(tx).query(`DELETE FROM om_bookings`);
  await tx.commit();
  console.log(`✔ ลบแล้ว · งาน ${r3.rowsAffected[0]} · ประวัติ ${r2.rowsAffected[0]} · ใบตัดสิทธิ์ ${r1.rowsAffected[0]}`);
} catch (e) { await tx.rollback(); console.error('ROLLBACK:', e.message); process.exitCode = 1; }
await pool.close();
