// ตัดค่าขัดกันที่ซ้ำกัน — บ้านเดียวกัน ช่องเดียวกัน ค่าเดิม/ค่าใหม่ชุดเดียวกัน ถูกบันทึกหลายรอบ
// (เกิดจากโหลดชีตบัญชีหลายรอบ: batch 13/14 แล้วมารอบผู้ใช้ map เอง batch 17)
// เก็บแถวแรกไว้ ลบที่เหลือ — ไม่ลบแถวที่ตัดสินไปแล้ว
import sql from 'mssql'; import fs from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-09.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:(WRITE?'★ WRITE ':'ตรวจ (SELECT) ')+'ตัดค่าขัดกันซ้ำใน om_field_sources'})+'\n');
const q = `
  WITH D AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY house_id, column_name, ISNULL(old_value,N''), ISNULL(new_value,N'')
      ORDER BY id) rn
    FROM om_field_sources
    WHERE confidence='probable' AND resolved_at IS NULL)
  ${WRITE ? 'DELETE FROM om_field_sources WHERE id IN (SELECT id FROM D WHERE rn > 1)'
          : 'SELECT COUNT(*) n FROM D WHERE rn > 1'}`;
const r = await pool.request().query(q);
console.log(WRITE ? `✔ ลบแถวซ้ำ ${r.rowsAffected[0]} แถว` : `จะลบแถวซ้ำ ${r.recordset[0].n} แถว`);
const a = (await pool.request().query(`SELECT COUNT(*) n FROM om_field_sources WHERE confidence='probable' AND resolved_at IS NULL`)).recordset[0].n;
console.log('ค่าขัดกันคงเหลือ:', a);
await pool.close();
