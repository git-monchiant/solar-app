import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^REM_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const BASE = env.REM_API_URL || 'https://rem-web.sena-it.com/sena/itf'; const KEY = env.REM_API_KEY;
const post = async (b) => { const r = await fetch(`${BASE}/api/saleorder/transfer`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Basic ${KEY}`},body:JSON.stringify(b),cache:'no-store'}); const j = await r.json(); return Array.isArray(j)?j:(j?.data??j?.result??[]); };
const whole = await post({projectID:'LIFK6', unitID:'', unitNumber:'', houseNumber:''});
const nm = (o) => `${o.firstName} ${o.lastName}${o.contractID && o.contractID!=='' ? ` <${o.contractID}>` : ''}`;
for (const hn of ['45/215','45/209','45/216','45/208']) {
  const w = whole.find(t => t.houseNumber === hn);
  const u = (await post({projectID:'LIFK6', unitID:w.unitID, unitNumber:'', houseNumber:''}))[0];
  console.log(`== ${hn} · ${w.contractID}`);
  console.log('   ทั้งโครงการ:', (w.owners ?? []).map(nm).join(' | ') || '(ว่าง)');
  console.log('   รายหลัง   :', (u?.owners ?? []).map(nm).join(' | ') || '(ว่าง)');
}
