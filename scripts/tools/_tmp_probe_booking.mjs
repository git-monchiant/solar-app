// สำรวจว่า BookingInfo (REMAPIV2) มีชื่อเจ้าของ/ผู้จองไหม สำหรับสัญญาที่ itf ไม่ส่ง owners มา
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^REM_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const V2 = env.REM_V2_URL || 'https://rem-web.sena-it.com/sena/REMAPIV2/sena';
for (const cid of ['SO-LIFK6-24060003','SO-LIFK6-23030002','S0-NK-09080002','SO-LIFK6-25090002']) {
  const res = await fetch(`${V2}/BookingInfo?contract_id=${encodeURIComponent(cid)}`, {cache:'no-store'});
  const j = await res.json().catch(()=>null);
  const d = Array.isArray(j?.data) ? j.data[0] : j?.data;
  console.log('==', cid, '| http', res.status, '| status', j?.status);
  if (!d) { console.log('   ไม่มี data:', String(j?.message ?? '').slice(0,120)); continue; }
  const keys = Object.keys(d);
  console.log('   keys:', keys.join(', ').slice(0,400));
  for (const k of keys) {
    const v = d[k];
    if (/name|customer|owner|phone|tel|mobile|email|book/i.test(k) && v && typeof v !== 'object')
      console.log(`   ${k} = ${String(v).slice(0,60)}`);
    if (Array.isArray(v) && v.length && /customer|owner|book/i.test(k))
      console.log(`   ${k}[${v.length}] =`, JSON.stringify(v[0]).slice(0,240));
  }
}
