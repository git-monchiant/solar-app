// ดึงข้อมูลจริงสำหรับ mockup แท็บติดตาม / รอบโทร / ปิดงาน — ใช้ API ของระบบเอง จะได้ scope ตรงกับที่หน้าจอเห็นจริง
import fs from "fs";
const B = "http://localhost:3010", H = { "x-user-id": "1" };
const get = async (p) => { const r = await fetch(B + p, { headers: H }); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };

const g = await get("/api/om/houses/groups");
const groups = (g.groups ?? []).filter((x) => !x.hidden && x.duewash > 0)
  .sort((a, b) => b.duewash - a.duewash);
// size ตัน 100 ต่อหน้า — ต้องไล่ทีละหน้าจนครบ
let due = await get("/api/om/houses?filter=duewash&size=100&page=1");
const rows = [...(due.houses ?? [])];
for (let pg = 2; rows.length < due.total; pg++) {
  const d = await get(`/api/om/houses?filter=duewash&size=100&page=${pg}`);
  if (!d.houses?.length) break;
  rows.push(...d.houses);
}
const stat = {
  due_total: due.total,
  projects: groups.length,
  nophone: rows.filter((r) => !r.customer_phone).length,
  noquota: rows.filter((r) => (r.balance ?? 0) <= 0).length,
  callable: rows.filter((r) => r.customer_phone && (r.balance ?? 0) > 0).length,
  never: rows.filter((r) => !r.last_wash).length,
  quota_remain: rows.reduce((s, r) => s + Math.max(0, r.balance ?? 0), 0),
  cycle: due.cleaningCycleMonths,
};
const months = (d) => d ? Math.round((Date.now() - new Date(d)) / 2592000000) : null;
// ตัวอย่างบ้าน: คละให้ครบทุกกรณีที่หน้าจอต้องรับมือ (โทรได้ / ไม่เคยล้าง / ไม่มีเบอร์ / สิทธิ์หมด)
const top = groups[0];
// เอาเฉพาะบ้านในโครงการจริง (ตัดกลุ่ม VIP ที่ใช้ชื่อคนเป็นชื่อโครงการออก)
const inPj = rows.filter((r) => r.project_id && r.house_number && !r.is_vip);
const pick = (f, n) => inPj.filter(f).slice(0, n);
const chosen = [
  ...pick((r) => r.customer_phone && r.balance > 0 && r.last_wash, 5),
  ...pick((r) => r.customer_phone && r.balance > 0 && !r.last_wash, 4),
  ...pick((r) => !r.customer_phone && r.balance > 0, 3),
  ...pick((r) => r.balance <= 0, 3),
];
const sample = chosen.map((r) => ({
  id: r.id, hn: r.house_number, name: r.customer_name, phone: r.customer_phone,
  project: r.project_name, pcode: r.project_id, remain: r.balance, last: r.last_wash,
  months: months(r.last_wash), used: r.wash_count, kwp: r.kwp_list, warranty: r.warranty_start,
}));
const out = { stat, groups: groups.slice(0, 25).map((x) => ({ code: x.pid, name: x.name, due: x.duewash, houses: x.houses, nophone: x.nophone, bal: x.bal })), top: top.name, sample };
fs.writeFileSync("/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/mock_follow.json", JSON.stringify(out));
console.log("ถึงคิวรวม", stat.due_total, "| โครงการ", stat.projects, "| ไม่มีเบอร์", stat.nophone,
  "| สิทธิ์หมด", stat.noquota, "| โทรได้", stat.callable, "| ไม่เคยล้าง", stat.never, "| รอบ", stat.cycle, "เดือน");
console.log("โครงการค้างมากสุด:", top.name, top.duewash, "หลัง · ตัวอย่าง", sample.length, "หลัง");
console.log(groups.slice(0,6).map(x=>`  ${x.name} ${x.duewash}/${x.houses}`).join("\n"));
