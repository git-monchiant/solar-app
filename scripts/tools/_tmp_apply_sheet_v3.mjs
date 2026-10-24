// รอบเก็บตก — แถวที่รอบแรกจับคู่โครงการไม่ลง
//   สาเหตุเดิม: ตัวเทียบชื่อใช้แค่ทะเบียนโครงการ ไม่ได้ใช้ชื่อที่ตาราง om_houses ใช้จริง
//   (เช่น ไฟล์บัญชีเขียน "Sena Ville Salaya" ทะเบียนเก็บ "เสนาวิลล์ บรมราชชนนี สาย 5")
//   + ตัดตัวห้อยท้ายเลขบ้านเพิ่ม (ev / OM / -OM) + โครงการที่ผู้ใช้ระบุเอง (45/189 = K9BK2)
// เติมเฉพาะช่องที่ยังว่าง · ลงที่มารายฟิลด์ทุกค่า · PO ของ "งานบริการ" ไม่เขียน (รอผู้ใช้ตัดสิน)
// รัน: node scripts/tools/_tmp_apply_sheet_v3.mjs [--write]
import sql from "mssql"; import fs from "fs";
const PLAN = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/write_plan2.json";
const FILE = "สรุป บ้านเสนาติดตั้ง solar ส่งพี่เปิ้ล 20260908.xlsx";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "รอบเก็บตก: เติม install_date/inverter_kw/po_number จากไฟล์บัญชี (แก้ตัวเทียบชื่อโครงการ)" }) + "\n");

// รวมรายแถวเป็นรายบ้าน — บ้านเดียวมีได้หลายใบแจ้งหนี้
const byHouse = new Map();
for (const p of plan) {
  const d = byHouse.get(p.house_id) ?? { ...p, dates: [], kws: [], pos: [], rows: [] };
  if (p.date) d.dates.push([p.date, p.row]);
  if (p.kw) d.kws.push([p.kw, p.row]);
  if (p.po && !p.service_po) d.pos.push([p.po, p.row]);
  d.rows.push(p.row);
  byHouse.set(p.house_id, d);
}
const tx = new sql.Transaction(pool); await tx.begin();
const n = { batch: 0, houses: 0, date: 0, kw: 0, po: 0, conflict: 0 };
try {
  let batchId = null;
  if (WRITE) {
    const b = await new sql.Request(tx).input("f", sql.NVarChar(200), FILE)
      .input("no", sql.NVarChar(300), "รอบเก็บตก — แก้ตัวเทียบชื่อโครงการ (ใช้ชื่อที่ตารางบ้านใช้จริง) + ตัดตัวห้อยเลขบ้าน + โครงการที่ผู้ใช้ระบุ")
      .input("rc", sql.Int, plan.length)
      .query(`INSERT INTO om_import_batches (source_file, note, row_count) OUTPUT INSERTED.id VALUES (@f, @no, @rc)`);
    batchId = b.recordset[0].id; n.batch = batchId;
  }
  const fs_ = async (v) => {
    if (!WRITE) return;
    await new sql.Request(tx).input("h", sql.Int, v.house_id).input("i", sql.Int, v.inst_id)
      .input("t", sql.VarChar(40), "om_installations").input("c", sql.VarChar(40), v.col)
      .input("nv", sql.NVarChar(200), v.newv == null ? null : String(v.newv))
      .input("ov", sql.NVarChar(200), v.oldv == null ? null : String(v.oldv))
      .input("k", sql.VarChar(20), "import").input("b", sql.Int, batchId)
      .input("r", sql.NVarChar(200), v.ref).input("mm", sql.NVarChar(80), v.method)
      .input("cf", sql.VarChar(12), v.conf)
      .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value, source_kind, batch_id, source_ref, match_method, confidence)
              VALUES (@h, @i, @t, @c, @nv, @ov, @k, @b, @r, @mm, @cf)`);
  };
  for (const d of byHouse.values()) {
    const ref = (r) => `AR-SSE แถว ${r} · ${d.by}`;
    let touched = false;
    if (d.dates.length) {
      const [v, r] = d.dates.sort()[0];
      if (!d.cur_date) {
        const u = WRITE ? await new sql.Request(tx).input("i", sql.Int, d.inst_id).input("d", sql.Date, v)
          .query(`UPDATE om_installations SET install_date=@d, updated_at=SYSDATETIMEOFFSET() WHERE id=@i AND install_date IS NULL`) : { rowsAffected: [1] };
        if (u.rowsAffected[0] === 1) { n.date++; touched = true; await fs_({ ...d, col: "install_date", newv: v, oldv: null, ref: ref(r), method: d.how, conf: "confirmed" }); }
      } else if (v !== d.cur_date) {
        n.conflict++;
        await fs_({ ...d, col: "install_date", newv: v, oldv: d.cur_date, ref: ref(r) + " · ★ ไม่เขียนทับ ค่าเดิมต่างกัน", method: d.how, conf: "probable" });
      }
    }
    if (d.kws.length && d.cur_kw == null) {
      const [v, r] = d.kws.sort((a, b) => a[0] - b[0]).at(-1);
      const u = WRITE ? await new sql.Request(tx).input("i", sql.Int, d.inst_id).input("k", sql.Decimal(10, 4), v)
        .query(`UPDATE om_installations SET inverter_kw=@k, updated_at=SYSDATETIMEOFFSET() WHERE id=@i AND inverter_kw IS NULL`) : { rowsAffected: [1] };
      if (u.rowsAffected[0] === 1) { n.kw++; touched = true; await fs_({ ...d, col: "inverter_kw", newv: v, oldv: null, ref: ref(r), method: d.how, conf: "confirmed" }); }
    }
    if (d.pos.length) {
      const [v, r] = d.pos.sort((a, b) => a[1] - b[1]).at(-1);
      const u = WRITE ? await new sql.Request(tx).input("i", sql.Int, d.inst_id).input("p", sql.NVarChar(50), v)
        .query(`UPDATE om_installations SET po_number=@p, updated_at=SYSDATETIMEOFFSET() WHERE id=@i AND po_number IS NULL`) : { rowsAffected: [1] };
      if (u.rowsAffected[0] === 1) { n.po++; touched = true; await fs_({ ...d, col: "po_number", newv: v, oldv: null, ref: ref(r), method: d.how, conf: "confirmed" }); }
    }
    if (touched) n.houses++;
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
  console.log(`  batch id       : ${n.batch || "-"}`);
  console.log(`  บ้านที่แตะ     : ${n.houses}`);
  console.log(`  เติมวันติดตั้ง : ${n.date}`);
  console.log(`  เติม kW        : ${n.kw}`);
  console.log(`  เติมเลข PO     : ${n.po}`);
  console.log(`  บันทึกค่าชนกัน : ${n.conflict}`);
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
