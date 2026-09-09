// ดู response ดิบของ itf transfer สำหรับสัญญาที่ไม่มี owners + ลองเส้นทางอื่นที่น่าจะมีผู้จอง
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^REM_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const BASE = env.REM_API_URL || 'https://rem-web.sena-it.com/sena/itf';
const KEY = env.REM_API_KEY;
async function post(path, body){
  const res = await fetch(`${BASE}${path}`, {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Basic ${KEY}`}, body:JSON.stringify(body), cache:'no-store'});
  const txt = await res.text();
  let j=null; try{ j=JSON.parse(txt);}catch{}
  return {status:res.status, j, txt};
}
// 1) transfer ดิบของ 45/208
const r = await post('/api/saleorder/transfer', {projectID:'LIFK6', unitID:'', unitNumber:'', houseNumber:'45/208'});
const arr = Array.isArray(r.j)? r.j : (r.j?.data ?? r.j?.result ?? []);
console.log('== transfer 45/208 · http', r.status, '· rows', arr.length);
if (arr[0]) { console.log('   keys:', Object.keys(arr[0]).join(', ')); console.log('   owners:', JSON.stringify(arr[0].owners ?? null).slice(0,200)); console.log('   raw:', JSON.stringify(arr[0]).slice(0,700)); }
// 2) ลองเส้นทางที่น่าจะมี "ผู้จอง"
for (const p of ['/api/saleorder/booking','/api/saleorder/contract','/api/master/customer','/api/saleorder/reservation']) {
  const x = await post(p, {projectID:'LIFK6', unitID:'', unitNumber:'', houseNumber:'45/208'});
  const a = Array.isArray(x.j)? x.j : (x.j?.data ?? x.j?.result ?? []);
  console.log(`== ${p} · http ${x.status} · rows ${Array.isArray(a)?a.length:'-'} ${x.status!==200? x.txt.slice(0,90):''}`);
  if (Array.isArray(a) && a[0]) console.log('   keys:', Object.keys(a[0]).join(', ').slice(0,300));
}
