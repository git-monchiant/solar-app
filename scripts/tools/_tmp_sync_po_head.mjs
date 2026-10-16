// เติม om_installations.po_number / install_date / inverter_kw ให้บ้านที่มีใบ PO ในตารางลูกแล้ว
// แต่ช่องหลักยังว่าง (เช่น 87/17 ที่เพิ่งรู้โครงการทีหลัง) · เขียนเฉพาะช่องว่าง + ลงที่มารายฟิลด์
import sql from 'mssql'; import fs from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-09.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:(WRITE?'★ WRITE ':'ตรวจ (SELECT) ')+'sync po_number/install_date/inverter_kw จาก om_installation_pos'})+'\n');
const cand = (await pool.request().query(`
  SELECT i.id inst_id, i.house_id, p.po_number, CONVERT(char(10),p.po_date,23) po_date, p.amount_kw, p.source_ref, p.batch_id,
         i.po_number cur_po, CONVERT(char(10),i.install_date,23) cur_date, i.inverter_kw cur_kw
  FROM om_installations i
  CROSS APPLY (SELECT TOP 1 * FROM om_installation_pos x WHERE x.installation_id=i.id AND x.kind='install' ORDER BY x.po_date, x.id) p
  WHERE i.po_number IS NULL OR i.install_date IS NULL OR i.inverter_kw IS NULL`)).recordset;
const tx = new sql.Transaction(pool); await tx.begin();
const n={po:0,date:0,kw:0};
try{
  for(const c of cand){
    const set=[]; const fields=[];
    if(!c.cur_po && c.po_number){ set.push('po_number=@po'); fields.push(['po_number',c.po_number]); }
    if(!c.cur_date && c.po_date){ set.push('install_date=@d'); fields.push(['install_date',c.po_date]); }
    if(c.cur_kw==null && c.amount_kw!=null){ set.push('inverter_kw=@k'); fields.push(['inverter_kw',c.amount_kw]); }
    if(!set.length) continue;
    if(WRITE){
      await new sql.Request(tx).input('i',sql.Int,c.inst_id).input('po',sql.NVarChar(50),c.po_number)
        .input('d',sql.Date,c.po_date).input('k',sql.Decimal(10,4),c.amount_kw)
        .query(`UPDATE om_installations SET ${set.join(', ')}, updated_at=SYSDATETIMEOFFSET() WHERE id=@i`);
      for(const [col,val] of fields)
        await new sql.Request(tx).input('h',sql.Int,c.house_id).input('i',sql.Int,c.inst_id)
          .input('c',sql.VarChar(40),col).input('nv',sql.NVarChar(200),String(val)).input('b',sql.Int,c.batch_id)
          .input('r',sql.NVarChar(200),c.source_ref)
          .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, source_kind, batch_id, source_ref, match_method, confidence)
                  VALUES (@h,@i,'om_installations',@c,@nv,'import',@b,@r,N'จากใบ PO ในตารางลูก',N'confirmed')`);
    }
    for(const [col] of fields) n[col==='po_number'?'po':col==='install_date'?'date':'kw']++;
  }
  if(WRITE) await tx.commit(); else await tx.rollback();
  console.log(WRITE?'✔ เขียนแล้ว':'ตรวจอย่างเดียว', '| po', n.po, '| วันติดตั้ง', n.date, '| kW', n.kw);
}catch(e){ await tx.rollback(); console.error('ROLLBACK:', e.message); process.exitCode=1; }
await pool.close();
