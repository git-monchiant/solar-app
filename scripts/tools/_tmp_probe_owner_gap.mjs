// เทียบ owners ที่ได้จาก "ยิงทั้งโครงการ" กับ "ยิงรายหลัง" — สงสัยว่าทั้งโครงการส่ง owners ไม่ครบ
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^REM_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const BASE = env.REM_API_URL || 'https://rem-web.sena-it.com/sena/itf';
const KEY = env.REM_API_KEY;
async function post(body){
  const res = await fetch(`${BASE}/api/saleorder/transfer`, {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Basic ${KEY}`}, body:JSON.stringify(body), cache:'no-store'});
  const j = await res.json();
  return Array.isArray(j)? j : (j?.data ?? j?.result ?? []);
}
for (const pid of ['LIFK6','NK']) {
  const whole = await post({projectID:pid, unitID:'', unitNumber:'', houseNumber:''});
  const withOwners = whole.filter(t => (t.owners ?? []).length);
  console.log(`== ${pid} · ยิงทั้งโครงการ: ${whole.length} สัญญา · มี owners ${withOwners.length}`);
  for (const t of whole.slice(0,6)) {
    const one = await post({projectID:pid, unitID:t.unitID, unitNumber:'', houseNumber:''});
    const n1 = (t.owners ?? []).length, n2 = (one[0]?.owners ?? []).length;
    console.log(`   ${String(t.houseNumber).padEnd(10)} ${t.contractID.padEnd(22)} ทั้งโครงการ ${n1} · รายหลัง ${n2} ${n1!==n2 ? '  ★ ต่างกัน' : ''}`);
  }
}
