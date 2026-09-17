import puppeteer from "puppeteer";
const OUT="/private/tmp/claude-501/-Users-monchiantunnakat-my-projects-sena-projects-solar-app/81fa9987-9764-4eff-941e-f8437154c6a7/scratchpad";
const b = await puppeteer.launch({headless:"new",args:["--no-sandbox"]});
const p = await b.newPage();
await p.setViewport({width:1800,height:1200,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,160)));
await p.goto("http://localhost:3010/login",{waitUntil:"domcontentloaded"});
await p.evaluate(()=>{localStorage.setItem("userId","1");
  localStorage.setItem("activeRoles",JSON.stringify(["admin","sales","solar","sales_sup","solar_sup","account","leadsseeker"]));
  localStorage.removeItem("pipeline.mineOnly");});
await p.goto("http://localhost:3010/pipeline",{waitUntil:"networkidle0",timeout:180000});
await new Promise(r=>setTimeout(r,3000));
const stats = await p.evaluate(()=>{
  const t=document.body.innerText;
  return {
    ontime:(t.match(/SLA เสร็จตามกำหนด/g)||[]).length,
    late:(t.match(/SLA เสร็จเกินกำหนด/g)||[]).length,
    open:(t.match(/SLA (เกินกำหนด|ใกล้กำหนด|กำลังดำเนินการ|เร่งด่วน)(?!\s)/g)||[]).length,
  };
});
console.log("บนหน้าจอ:", JSON.stringify(stats), "pageerrors:", errs.length);
// ครอปการ์ดใบแรกที่มีกล่องเขียว
const box = await p.evaluate(()=>{
  const el=[...document.querySelectorAll("span")].find(s=>s.textContent.trim()==="SLA เสร็จตามกำหนด");
  if(!el) return null;
  const card=el.closest('div[role="button"]');
  const r=card.getBoundingClientRect();
  card.scrollIntoView({block:"center"});
  return {y:r.top};
});
if (box) {
  await new Promise(r=>setTimeout(r,600));
  const clip = await p.evaluate(()=>{
    const el=[...document.querySelectorAll("span")].find(s=>s.textContent.trim()==="SLA เสร็จตามกำหนด");
    const r=el.closest('div[role="button"]').getBoundingClientRect();
    return {x:Math.max(0,r.x-4),y:Math.max(0,r.y-4),width:Math.min(1790,r.width+8),height:Math.min(1190,r.height+8)};
  });
  await p.screenshot({path:`${OUT}/green_card.png`, clip});
  console.log("saved green_card.png");
}
await b.close();
