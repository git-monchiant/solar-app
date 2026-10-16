// ★ ส่ง SMS จริง — ผู้ใช้สั่งทดสอบ 10 ก.ย. 69 ("ทดสอบ otp ส่งมาที่ 0868811414")
// ใช้สัญญาเดียวกับ src/lib/om/otp.ts ที่เพิ่งแก้ (ชุดเดียวกับที่ระบบขายส่งได้จริง)
import fs from "fs"; import crypto from "crypto";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const phone = process.argv[2];
if (!/^0[689]\d{8}$/.test(phone ?? "")) throw new Error("ต้องใส่เบอร์ 10 หลัก");
const code = String(crypto.randomInt(100000, 999999));
const ref  = "SNA" + crypto.randomInt(1000, 9999);
const url  = (env.SMSMKT_API_URL || "https://portal-otp.smsmkt.com/api") + "/send-message";
const body = { message: `รหัสยืนยัน SENA Solar: ${code} (อ้างอิง ${ref}) ใช้ได้ 5 นาที`,
               phone, sender: env.SMSMKT_SENDER, project_id: env.SMSMKT_PROJECT_ID };
console.log(`ส่งไป ${phone} · ผู้ส่ง "${env.SMSMKT_SENDER}" · ref ${ref} · รหัส ${code}`);
const res = await fetch(url, { method:"POST",
  headers:{ "Content-Type":"application/json", api_key: env.SMSMKT_API_KEY, secret_key: env.SMSMKT_SECRET_KEY },
  body: JSON.stringify(body) }).catch(e => { console.log("★ ยิงไม่ออก:", e.message); return null; });
if (!res) process.exit(1);
const data = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status} · ตอบกลับ:`, JSON.stringify(data));
console.log(data?.code === "000" ? "✔ ส่งสำเร็จ รอ SMS เข้าเครื่อง" : "★ ยังไม่สำเร็จ ดู code/detail ข้างบน");
