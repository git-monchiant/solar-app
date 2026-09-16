// สำรวจว่า smsmkt ยอมรับอะไรบ้าง — credentials ใช้ได้ไหม / sender ชื่ออะไรถึงจะผ่าน / otp-send ใช้ได้ไหม
import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const base = env.SMSMKT_API_URL || "https://portal-otp.smsmkt.com/api";
const H = { "Content-Type":"application/json", api_key: env.SMSMKT_API_KEY, secret_key: env.SMSMKT_SECRET_KEY };
const hit = async (path, body, method="POST") => {
  const r = await fetch(base+path, { method, headers:H, body: body?JSON.stringify(body):undefined }).catch(e=>({err:e.message}));
  if (r.err) return console.log(`  ${path.padEnd(18)} ยิงไม่ออก ${r.err}`);
  const t = await r.text();
  console.log(`  ${path.padEnd(18)} HTTP ${r.status} · ${t.slice(0,180)}`);
};
console.log("โพรบ smsmkt:");
await hit("/credit-balance", {}, "POST");
await hit("/sender-list", {}, "POST");
await hit("/otp-send", { project_key: env.SMSMKT_PROJECT_ID, phone: process.argv[2] });
