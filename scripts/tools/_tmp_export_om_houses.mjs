// export หน้า O&M > ทะเบียนบ้าน (แท็บ "ทั้งหมด" · ทุกโครงการ) เป็น Excel — SELECT อย่างเดียว
import sql from 'mssql'; import fs from 'fs'; import XLSX from 'xlsx-js-style';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});

const CL = `(SELECT TOP 1 id FROM om_service_type WHERE code = N'cleaning')`;
const isC = (a) => `(ISNULL(${a}.service_type_id, ${CL}) = ${CL})`;
const CYC = `ISNULL((SELECT TOP 1 cycle_months FROM om_service_type WHERE code = N'cleaning'), 12)`;
const washed = `(CASE WHEN EXISTS(SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isC('rd')}) THEN 1 ELSE 0 END)`;
const rem = `(CASE WHEN EXISTS(SELECT 1 FROM om_installations i WHERE i.house_id = h.id AND i.rem_contract_id IS NOT NULL) THEN 1 ELSE 0 END)`;
const demo = `ISNULL(pj.is_demo, 0)`, unit = `ISNULL(h.unit_status, N'')`;
const bucket = `CASE
  WHEN h.segment IN ('condo','sales_office','facility') THEN 'HIDE'
  WHEN h.is_vip = 1 THEN 'VIP'
  WHEN ${washed} = 1 OR ${rem} = 1 OR (${demo} = 0 AND ${unit} NOT IN (N'ห้องว่าง', N'พร้อมขาย', N'บ้านตัวอย่าง')) THEN 'SHOW'
  ELSE 'HIDE' END`;
const HN_A = `TRY_CAST(NULLIF(LTRIM(RTRIM(LEFT(h.house_number, CHARINDEX('/', h.house_number + '/') - 1))), '') AS int)`;
const HN_B = `TRY_CAST(NULLIF(LTRIM(RTRIM(SUBSTRING(h.house_number, CHARINDEX('/', h.house_number + '/') + 1, 50))), '') AS int)`;

const rows = (await pool.request().query(`
  SELECT h.id, ISNULL(pj.name_th, h.project_name) project_name, h.house_number, h.segment, h.is_vip, h.unit_status,
    (SELECT COUNT(*) FROM om_installations i WHERE i.house_id = h.id) system_count,
    (SELECT STRING_AGG(CAST(COALESCE(i.rem_size_kwp, i.promo_size_kw) AS varchar(12)), ' + ') FROM om_installations i
      WHERE i.house_id = h.id AND COALESCE(i.rem_size_kwp, i.promo_size_kw) IS NOT NULL) kwp_list,
    (SELECT STRING_AGG(i.inverter_brand, ', ') FROM om_installations i WHERE i.house_id = h.id AND i.inverter_brand IS NOT NULL) inverter,
    (SELECT MIN(CONVERT(char(10), i.warranty_start, 23)) FROM om_installations i WHERE i.house_id = h.id AND i.warranty_start IS NOT NULL) warranty_start,
    (SELECT CONVERT(char(10), MAX(rd.service_date), 23) FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
      WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isC('rd')}) last_wash,
    (SELECT COUNT(*) FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
      WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isC('rd')}) wash_count,
    (SELECT ISNULL(SUM(g.qty), 0) FROM om_entitlement_grants g JOIN om_installations i ON i.id = g.installation_id
      WHERE i.house_id = h.id AND ${isC('g')})
    - (SELECT COUNT(*) FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
      WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isC('rd')}) balance,
    (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
      WHERE hc.house_id = h.id AND hc.is_current = 1 ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
    (SELECT TOP 1 p.phone FROM om_house_customers hc JOIN om_customer_phones p ON p.customer_id = hc.customer_id
      WHERE hc.house_id = h.id AND hc.is_current = 1 ORDER BY p.is_primary DESC, p.id) customer_phone,
    CASE WHEN NOT EXISTS (SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
      WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isC('rd')}
        AND DATEADD(month, ${CYC}, rd.service_date) > SYSDATETIMEOFFSET()) THEN 1 ELSE 0 END due_wash,
    h.note
  FROM om_houses h LEFT JOIN om_projects pj ON pj.project_id = h.project_id
  WHERE h.is_om = 1 AND ${bucket} <> 'HIDE'
  ORDER BY ISNULL(pj.name_th, h.project_name), CASE WHEN ${HN_A} IS NULL THEN 1 ELSE 0 END, ${HN_A}, ${HN_B}, h.house_number, h.id`)).recordset;
await pool.close();

const head = ['โครงการ','บ้านเลขที่','ประเภท','VIP','สถานะยูนิต','จำนวนระบบ','ระบบ / kWp','อินเวอร์เตอร์','วันเริ่มประกัน','ล้างล่าสุด','ล้างแล้ว (ครั้ง)','สิทธิ์เหลือ','ชื่อลูกค้า','เบอร์','ถึงคิวล้าง','หมายเหตุ'];
const data = rows.map(r => [r.project_name ?? '', r.house_number ?? '', r.segment ?? '', r.is_vip ? 'VIP' : '', r.unit_status ?? '',
  r.system_count, r.kwp_list ? r.kwp_list.split(' + ').map(v => Number(v).toFixed(2)).join(' + ') + ' kW' : '',
  r.inverter ?? '', r.warranty_start ?? '', r.last_wash ?? 'ยังไม่เคยล้าง', r.wash_count, r.balance,
  r.customer_name ?? '', r.customer_phone ?? '', r.due_wash ? 'ถึงคิว' : '', r.note ?? '']);
const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
head.forEach((_, c) => { const a = XLSX.utils.encode_cell({ r: 0, c }); ws[a].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F6F5' } } }; });
// เบอร์โทรเก็บเป็นข้อความ กันเลข 0 หน้าหาย
data.forEach((_, i) => { const a = XLSX.utils.encode_cell({ r: i + 1, c: 13 }); if (ws[a]) ws[a].t = 's'; });
ws['!cols'] = [28,12,10,6,14,8,16,20,13,13,10,9,28,14,10,30].map(wch => ({ wch }));
ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: head.length - 1 } }) };
ws['!freeze'] = { xSplit: 0, ySplit: 1 }; ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'ทะเบียนบ้าน O&M');
XLSX.writeFile(wb, process.argv[2]);
console.log('rows', rows.length, 'due', rows.filter(r=>r.due_wash).length, 'nophone', rows.filter(r=>!r.customer_phone).length, 'noinv', rows.filter(r=>!r.inverter).length);
